// Server/src/services/engineLoop.js
import { EngineState } from "../models/EngineState.js";
import { Settings } from "../models/Settings.js";
import { getSnapshotRows, ltpOf } from "./marketDataService.js";
import { placeOrder, markToMarket, closeAllPositions } from "./brokerService.js";
import { sendDailyEodReportIfEnabled } from "./notifyService.js";
import { config } from "../config.js";


/* ============================================================================
 * IST helpers
 * ==========================================================================*/
function istDate(d = new Date()) {
  const nowUTC = d.getTime() + d.getTimezoneOffset() * 60000;
  return new Date(nowUTC + 5.5 * 3600000);
}
function istMinutes(date = istDate()) {
  return date.getHours() * 60 + date.getMinutes();
}
function isWeekendIST(date = istDate()) {
  const day = date.getDay();
  return day === 0 || day === 6;
}
function isMarketOpenIST() {
  if (config.devForceOpen) return true;
  if (isWeekendIST()) return false;
  const m = istMinutes();
  return m >= 9 * 60 + 15 && m <= 15 * 60 + 10;
}
function isAfterCloseIST() {
  if (isWeekendIST()) return true;
  return istMinutes() > 15 * 60 + 10;
}
function todayKeyIST() {
  const d = istDate();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function isAfterHardCutoffIST(date = istDate()) {
  const raw =
    String(config.eodHardCutoffIST || process.env.EOD_HARD_CUTOFF_IST || "15:25");
  const [hh, mm] = raw.split(":").map(Number);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return false;
  return istMinutes(date) >= hh * 60 + mm;
}

/* ============================================================================
 * Env/config switches (backwards compatible with your existing flag)
 * ==========================================================================*/
const NON_NEG_EOD =
  typeof config.mustEndDayProfitable === "boolean"
    ? config.mustEndDayProfitable
    : (process.env.MUST_END_DAY_PROFITABLE ??
        process.env.EOD_NON_NEGATIVE_TARGET ??
        "1") !== "0"; // default ON

/* ============================================================================
 * Runtime state
 * ==========================================================================*/
let LOOP = null;
let RUNNING = false;
let STARTED_AT = null;
let PEAK_PNL = 0;
let NEW_TRADES_ALLOWED = true; // flips off in protection windows
const lastTradeAt = new Map(); // symbol -> ms (cooldown)

/* ============================================================================
 * DB state helpers
 * ==========================================================================*/
async function readState() {
  let s = await EngineState.findOne({});
  if (!s) s = await EngineState.create({ running: false, eodDoneFor: null });
  return s;
}
async function writeState(patch) {
  return EngineState.findOneAndUpdate(
    {},
    { $set: patch },
    { upsert: true, new: true }
  );
}
export async function setEngineRunning(val) {
  RUNNING = !!val;
  if (RUNNING && !STARTED_AT) STARTED_AT = new Date();
  await writeState({ running: RUNNING, startedAt: STARTED_AT || null });
  return RUNNING;
}

async function loadRuntimeConfig() {
  const s = await Settings.findOne({}).lean();
  const algo = s?.algo || {};
  const risk = s?.risk || {};
  return {
    symbols: Array.isArray(config.symbols) ? config.symbols : [],
    capitalPerTrade: Number(algo.capitalPerTrade ?? config.capitalPerTrade),
    maxPositions: Number(algo.maxPositions ?? config.maxPositions),
    stopLossPct: Number(algo.stopLossPct ?? config.stopLossPct),
    targetPct: Number(algo.targetPct ?? config.targetPct),
    dailyLossLimit:
      Number(risk.dailyLossLimit ?? process.env.DAILY_LOSS_LIMIT ?? 0) || 0,
    maxCapitalUsage:
      Number(risk.maxCapitalUsage ?? process.env.MAX_CAPITAL_USAGE ?? 0) || 0,
  };
}

function qtyFor(capital, ltp) {
  if (!ltp || ltp <= 0) return 0;
  return Math.max(0, Math.floor(capital / ltp));
}

async function getPositionsLean() {
  const { Position } = await import("../models/Position.js");
  return Position.find(
    {},
    { symbol: 1, type: 1, qty: 1, avgPrice: 1, ltp: 1, pnl: 1 }
  ).lean();
}

/* ============================================================================
 * Intraday net P&L = realized(today IST) + unrealized(current)
 * ==========================================================================*/
function istDayBoundsUtcFor(dateIST = istDate()) {
  const y = dateIST.getFullYear(),
    m = dateIST.getMonth(),
    d = dateIST.getDate();
  const startUTC = new Date(Date.UTC(y, m, d, -5, -30, 0, 0));
  const endUTC = new Date(startUTC.getTime() + 24 * 60 * 60 * 1000);
  return { startUTC, endUTC };
}

async function realizedPnLTodayIST() {
  const { Order } = await import("../models/Order.js");
  const { startUTC, endUTC } = istDayBoundsUtcFor();

  const orders = await Order.find({
    status: "FILLED",
    createdAt: { $gte: startUTC, $lt: endUTC },
  })
    .sort({ createdAt: 1 })
    .lean();

  const book = new Map(); // sym -> { side:'LONG'|'SHORT'|null, qty, avg }
  let realized = 0;

  for (const o of orders) {
    const qty = Number(o.qty || 0);
    const px = Number(o.price || 0);
    const sym = o.symbol;
    const side = o.side; // BUY/SELL
    if (!sym || !qty || !Number.isFinite(px)) continue;

    if (!book.has(sym)) book.set(sym, { side: null, qty: 0, avg: 0 });
    const p = book.get(sym);

    if (!p.side) {
      p.side = side === "BUY" ? "LONG" : "SHORT";
      p.qty = qty;
      p.avg = px;
      continue;
    }

    // same side -> average in
    if (
      (p.side === "LONG" && side === "BUY") ||
      (p.side === "SHORT" && side === "SELL")
    ) {
      const total = p.avg * p.qty + px * qty;
      p.qty += qty;
      p.avg = total / p.qty;
      continue;
    }

    // opposite -> realize
    let remaining = qty;
    while (remaining > 0 && p.qty > 0) {
      const closeQty = Math.min(p.qty, remaining);
      realized +=
        p.side === "LONG"
          ? closeQty * (px - p.avg)
          : closeQty * (p.avg - px);
      p.qty -= closeQty;
      remaining -= closeQty;
      if (p.qty === 0) p.side = null;
    }
    if (remaining > 0) {
      // flip/new
      p.side = side === "BUY" ? "LONG" : "SHORT";
      p.qty = remaining;
      p.avg = px;
    }
  }

  return Number(realized.toFixed(2));
}

async function unrealizedPnLNow() {
  const pos = await getPositionsLean();
  let u = 0;
  for (const p of pos) {
    const ltp = ltpOf(p.symbol) || p.ltp || p.avgPrice || 0;
    const qty = Math.abs(Number(p.qty || 0));
    u += p.type === "LONG" ? (ltp - p.avgPrice) * qty : (p.avgPrice - ltp) * qty;
  }
  return Number(u.toFixed(2));
}

async function intradayNetNow() {
  const r = await realizedPnLTodayIST();
  const u = await unrealizedPnLNow();
  return Number((r + u).toFixed(2));
}

/* ============================================================================
 * Guardrails & EOD logic
 * ==========================================================================*/
let lastRiskCheckAt = 0;

async function enforceRisk({ dailyLossLimit }) {
  const now = Date.now();
  if (now - lastRiskCheckAt < 1200) return; // throttle ~1.2s
  lastRiskCheckAt = now;

  const net = await intradayNetNow(); // realized+unrealized
  if (net > PEAK_PNL) PEAK_PNL = net;

  // Daily hard loss cut
  if (dailyLossLimit > 0 && net <= -Math.abs(dailyLossLimit)) {
    console.warn(
      `[Risk] Daily loss limit hit: ${net.toFixed(2)}. Flatten & stop.`
    );
    await closeAllPositions("DAILY_LOSS_LIMIT");
    NEW_TRADES_ALLOWED = false;
    await setEngineRunning(false);
  }

  // After 14:00, if net ≤ 0 -> stop new entries & de-risk
  const m = istMinutes();
  if (NON_NEG_EOD && m >= 14 * 60 && net <= 0) {
    if (NEW_TRADES_ALLOWED) {
      console.warn(
        "[Guard] After 14:00 & net ≤ 0 -> stop new entries, reduce risk."
      );
    }
    NEW_TRADES_ALLOWED = false;
    await deriskPositionsTowardZero();
  }
}

async function deriskPositionsTowardZero() {
  // Halve the largest losing position to cut downside if we’re red after 14:00
  const pos = await getPositionsLean();
  if (!pos.length) return;
  const losers = pos
    .map((p) => {
      const ltp = ltpOf(p.symbol) || p.ltp || p.avgPrice;
      const pnl =
        p.type === "LONG"
          ? (ltp - p.avgPrice) * p.qty
          : (p.avgPrice - ltp) * p.qty;
      return { ...p, pnl };
    })
    .filter((p) => p.pnl < 0)
    .sort((a, b) => a.pnl - b.pnl); // most negative first
  const worst = losers[0];
  if (!worst) return;
  const sideExit = worst.type === "LONG" ? "SELL" : "BUY";
  const qty = Math.max(1, Math.floor(worst.qty / 2));
  try {
    await placeOrder({ symbol: worst.symbol, side: sideExit, qty });
  } catch (e) {
    console.error("[Guard] deriskPositionsTowardZero failed:", e?.message || e);
  }
}

/**
 * Try to end the day with non-negative realized+unrealized P&L.
 * 1) Bank winners
 * 2) Close losers only to the extent we stay >= 0 (partial if needed)
 */
async function nonNegativeEodClose() {
  const m = istMinutes();
  if (!NON_NEG_EOD || m < 14 * 60 + 30) return; // only from 14:30 onwards

  await markToMarket(); // refresh LTP
  let positions = await getPositionsLean();
  if (!positions.length) return;

  const winners = [];
  const losers = [];
  for (const p of positions) {
    const ltp = ltpOf(p.symbol) || p.ltp || p.avgPrice;
    const livePnl =
      p.type === "LONG"
        ? (ltp - p.avgPrice) * p.qty
        : (p.avgPrice - ltp) * p.qty;
    (livePnl >= 0 ? winners : losers).push({ ...p, livePnl });
  }

  // 1) Bank all winners first
  for (const w of winners.sort((a, b) => b.livePnl - a.livePnl)) {
    const sideExit = w.type === "LONG" ? "SELL" : "BUY";
    if (w.qty > 0)
      await placeOrder({ symbol: w.symbol, side: sideExit, qty: w.qty });
  }

  // 2) Re-evaluate net; only close losers while net remains ≥ 0
  let net = await intradayNetNow();

  for (const l of losers.sort((a, b) => a.livePnl - b.livePnl)) {
    if (net <= 0) break; // can't close more without risking < 0
    const sideExit = l.type === "LONG" ? "SELL" : "BUY";

    // If closing full loser would push net below 0, try partial
    const wouldBeNet = net + l.livePnl; // l.livePnl is <= 0
    if (wouldBeNet >= 0) {
      await placeOrder({ symbol: l.symbol, side: sideExit, qty: l.qty });
      net = await intradayNetNow();
    } else {
      // partial close amount we can afford
      const ltp = ltpOf(l.symbol) || l.ltp || l.avgPrice;
      const perShareLoss =
        l.type === "LONG" ? ltp - l.avgPrice : l.avgPrice - ltp;
      if (perShareLoss <= 0) continue; // unexpected safeguard
      const maxLossWeCanAfford = net; // must stay non-negative
      const maxQty = Math.floor(maxLossWeCanAfford / perShareLoss);
      if (maxQty > 0) {
        await placeOrder({
          symbol: l.symbol,
          side: sideExit,
          qty: Math.min(maxQty, l.qty),
        });
        net = await intradayNetNow();
      }
      break; // stop after partial; further closures would risk < 0
    }
  }
}

/**
 * EOD coordinator:
 * - from 14:30: attempt non-negative close
 * - after 15:10:
 *    - if must-end-profitable: only square-off when net ≥ 0 OR at hard cutoff time
 *    - else: immediate square-off
 */
async function eodIfNeeded() {
  const s = await readState();
  const todayKey = todayKeyIST();
  if (s.eodDoneFor === todayKey) return;

  await nonNegativeEodClose();

  if (isAfterCloseIST()) {
    const mustProfit = NON_NEG_EOD;
    const net = await intradayNetNow();

    if (!mustProfit || net >= 0 || isAfterHardCutoffIST()) {
      console.log(`[EOD] Square-off (net=${net})`);
      await closeAllPositions("EOD_SQUARE_OFF");
      await writeState({ eodDoneFor: todayKey, running: false });
      RUNNING = false;

      try {
        await sendDailyEodReportIfEnabled();
      } catch (err) {
        console.error("[EOD] Email report failed:", err?.message || err);
      }
    } else {
      // Defer: keep engine running but block new entries & de-risk
      if (NEW_TRADES_ALLOWED) {
        console.warn(
          `[EOD-Guard] net=${net} < 0 → deferring until ${
            config.eodHardCutoffIST || process.env.EOD_HARD_CUTOFF_IST || "15:25"
          } IST`
        );
      }
      NEW_TRADES_ALLOWED = false;
      await deriskPositionsTowardZero();
    }
  }
}

/* ============================================================================
 * Trade logic
 * ==========================================================================*/
function canTradeSymbol(symbol) {
  const last = lastTradeAt.get(symbol) || 0;
  return Date.now() - last > 60_000; // 60s cooldown
}
function markTraded(symbol) {
  lastTradeAt.set(symbol, Date.now());
}

async function manageOpenPositions({ stopLossPct, targetPct }) {
  const { Position } = await import("../models/Position.js");
  const list = await Position.find({}).lean();

  for (const p of list) {
    const ltp = ltpOf(p.symbol) || p.ltp || p.avgPrice;
    if (!ltp || !p.avgPrice) continue;

    const grossPct =
      ((ltp - p.avgPrice) / p.avgPrice) * 100 * (p.type === "LONG" ? 1 : -1);
    const exitSide = p.type === "LONG" ? "SELL" : "BUY";

    if (stopLossPct && grossPct <= -Math.abs(stopLossPct)) {
      await placeOrder({ symbol: p.symbol, side: exitSide, qty: p.qty });
      continue;
    }
    if (targetPct && grossPct >= Math.abs(targetPct)) {
      await placeOrder({ symbol: p.symbol, side: exitSide, qty: p.qty });
      continue;
    }
  }
}

async function maybeOpenNewPositions({ capitalPerTrade, maxPositions }) {
  if (!NEW_TRADES_ALLOWED) return;

  const { Position } = await import("../models/Position.js");
  const open = await Position.countDocuments({});
  if (open >= maxPositions) return;

  const rows = getSnapshotRows(); // [{symbol, ltp, signal}]
  if (!rows?.length) return;

  // Favor strongest signals only
  for (const r of rows) {
    if (!canTradeSymbol(r.symbol)) continue;
    if (!r?.ltp || r.ltp <= 0) continue;
    if (r.signal !== "BUY" && r.signal !== "SELL") continue;

    const qty = qtyFor(capitalPerTrade, r.ltp);
    if (qty <= 0) continue;

    await placeOrder({
      symbol: r.symbol,
      side: r.signal === "BUY" ? "BUY" : "SELL",
      qty,
    });
    markTraded(r.symbol);
  }
}

/* ============================================================================
 * Tick loop
 * ==========================================================================*/
async function tick() {
  try {
    await markToMarket(); // keep LTP & pnl fresh
    await eodIfNeeded(); // try to achieve non-negative close, handle email, etc.

    if (!RUNNING || !isMarketOpenIST()) return;

    const conf = await loadRuntimeConfig();
    await enforceRisk(conf);
    await manageOpenPositions(conf);
    await maybeOpenNewPositions(conf);
  } catch (err) {
    console.error("[EngineTickError]", err?.message || err);
  }
}

/* ============================================================================
 * Public API
 * ==========================================================================*/
export async function startLoop() {
  if (LOOP) return { ok: true, running: RUNNING };
  RUNNING = true;
  NEW_TRADES_ALLOWED = true;
  STARTED_AT = new Date();
  await writeState({ running: true, startedAt: STARTED_AT });
  console.log("[Engine] Loop started");
  LOOP = setInterval(tick, 3000);
  return { ok: true, running: true };
}

export async function stopLoop() {
  if (LOOP) {
    clearInterval(LOOP);
    LOOP = null;
  }
  RUNNING = false;
  NEW_TRADES_ALLOWED = false;
  await writeState({ running: false });
  console.log("[Engine] Loop stopped");
  return { ok: true, running: false };
}

export async function emergencyStop() {
  console.warn("[Engine] EMERGENCY STOP: squaring off and stopping engine.");
  await closeAllPositions("EMERGENCY_STOP");
  await stopLoop();
  return { ok: true };
}

export async function getEngineState() {
  const s = await readState();
  return {
    running: !!s.running,
    riskLevel: "Medium",
    startedAt: s.startedAt || STARTED_AT || null,
  };
}
