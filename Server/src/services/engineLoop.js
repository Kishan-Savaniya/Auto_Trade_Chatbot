// Server/src/services/engineLoop.js
import { EngineState } from "../models/EngineState.js";
import { Settings } from "../models/Settings.js";
import { getSnapshotRows, ltpOf } from "./marketDataService.js";
import { placeOrder, markToMarket, closeAllPositions } from "./brokerService.js";
import { sendDailyEodReportIfEnabled } from "./notifyService.js";
import { config } from "../config.js";

// ✅ Single source for IST time & market window helpers
import {
  nowIST,
  isMarketOpenIST,
  isSquareOffWindowIST,
  todayKeyIST,
} from "../utils/istTime.js";

// ------- env flags -------
const NON_NEG_EOD = process.env.EOD_NON_NEGATIVE_TARGET !== "0"; // default ON

// ------- runtime state -------
let LOOP = null;
let RUNNING = false;
let STARTED_AT = null;
let PEAK_PNL = 0;
let NEW_TRADES_ALLOWED = true;    // flips off in protection windows
const lastTradeAt = new Map();    // symbol -> ms (cooldown)

// Small helper: IST minutes-of-day (no naming collision with utils)
function minutesIST(d = nowIST()) {
  return d.getHours() * 60 + d.getMinutes();
}

// ------- db state helpers -------
async function readState() {
  let s = await EngineState.findOne({});
  if (!s) s = await EngineState.create({ running: false, eodDoneFor: null });
  return s;
}
async function writeState(patch) {
  return EngineState.findOneAndUpdate({}, { $set: patch }, { upsert: true, new: true });
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
    dailyLossLimit: Number(risk.dailyLossLimit ?? process.env.DAILY_LOSS_LIMIT ?? 0) || 0,
    maxCapitalUsage: Number(risk.maxCapitalUsage ?? process.env.MAX_CAPITAL_USAGE ?? 0) || 0,
  };
}

function qtyFor(capital, ltp) {
  if (!ltp || ltp <= 0) return 0;
  return Math.max(0, Math.floor(capital / ltp));
}

async function getPositionsLean() {
  const { Position } = await import("../models/Position.js");
  return Position.find({}, { symbol: 1, type: 1, qty: 1, avgPrice: 1, ltp: 1, pnl: 1 }).lean();
}
async function netPnl() {
  const pos = await getPositionsLean();
  return pos.reduce((a, p) => a + Number(p.pnl || 0), 0);
}

// ------- Guardrails & EOD logic -------
let lastRiskCheckAt = 0;

async function enforceRisk({ dailyLossLimit }) {
  const now = Date.now();
  if (now - lastRiskCheckAt < 1200) return; // throttle
  lastRiskCheckAt = now;

  const net = await netPnl();
  if (net > PEAK_PNL) PEAK_PNL = net;

  // Daily hard loss cut
  if (dailyLossLimit > 0 && net <= -Math.abs(dailyLossLimit)) {
    console.warn(`[Risk] Daily loss limit hit: ${net.toFixed(2)}. Flatten & stop.`);
    await closeAllPositions("DAILY_LOSS_LIMIT");
    NEW_TRADES_ALLOWED = false;
    await setEngineRunning(false);
  }

  // After 14:00, if net is ≤ 0, stop new trades & start de-risking
  const m = minutesIST();
  if (NON_NEG_EOD && m >= 14 * 60 && net <= 0) {
    if (NEW_TRADES_ALLOWED) {
      console.warn("[Guard] After 14:00 & net ≤ 0 -> stop new entries, reduce risk.");
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
    .map(p => {
      const ltp = ltpOf(p.symbol) || p.ltp || p.avgPrice;
      const pnl = p.type === "LONG" ? (ltp - p.avgPrice) * p.qty : (p.avgPrice - ltp) * p.qty;
      return { ...p, pnl };
    })
    .filter(p => p.pnl < 0)
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

async function nonNegativeEodClose() {
  // Try to exit winners first, then only close losers if we remain ≥ 0 after each exit.
  const m = minutesIST();
  if (!NON_NEG_EOD || m < 14 * 60 + 30) return; // only from 14:30 onwards

  let positions = await getPositionsLean();
  if (!positions.length) return;

  // Always keep LTP fresh before decisions
  await markToMarket();
  positions = await getPositionsLean();

  // Split winners/losers by live pnl
  const winners = [];
  const losers = [];
  for (const p of positions) {
    const ltp = ltpOf(p.symbol) || p.ltp || p.avgPrice;
    const pnl = p.type === "LONG" ? (ltp - p.avgPrice) * p.qty : (p.avgPrice - ltp) * p.qty;
    (pnl >= 0 ? winners : losers).push({ ...p, livePnl: pnl });
  }

  // 1) Bank all winners first
  for (const w of winners.sort((a, b) => b.livePnl - a.livePnl)) {
    const sideExit = w.type === "LONG" ? "SELL" : "BUY";
    if (w.qty > 0) await placeOrder({ symbol: w.symbol, side: sideExit, qty: w.qty });
  }

  // 2) Re-evaluate net; only close losers while net remains ≥ 0
  await markToMarket();
  let net = await netPnl();

  for (const l of losers.sort((a, b) => a.livePnl - b.livePnl)) {
    if (net <= 0) break; // can't close more without risking < 0
    const sideExit = l.type === "LONG" ? "SELL" : "BUY";

    // If closing full loser would push net below 0, try partial
    const wouldBeNet = net + l.livePnl; // adding (negative) pnl reduces net
    if (wouldBeNet >= 0) {
      await placeOrder({ symbol: l.symbol, side: sideExit, qty: l.qty });
      net = wouldBeNet;
    } else {
      // compute max qty we can close while staying >= 0
      const ltp = ltpOf(l.symbol) || l.ltp || l.avgPrice;
      const perShareLoss = (l.type === "LONG" ? (ltp - l.avgPrice) : (l.avgPrice - ltp));
      if (perShareLoss <= 0) continue; // unexpected
      const maxLossWeCanAfford = net; // must stay non-negative
      const maxQty = Math.floor(maxLossWeCanAfford / perShareLoss);
      if (maxQty > 0) {
        await placeOrder({ symbol: l.symbol, side: sideExit, qty: Math.min(maxQty, l.qty) });
        net = await netPnl();
      }
      break; // stop after partial; any more likely flips < 0
    }
  }
}

async function eodIfNeeded() {
  const s = await readState();
  const todayKey = todayKeyIST(nowIST());

  if (s.eodDoneFor === todayKey) return;

  // From 14:30, engage non-negative close routine
  await nonNegativeEodClose();

  // After close window (>= 15:10 IST), force square-off + email
  if (isSquareOffWindowIST(nowIST())) {
    console.log("[EOD] Market closed → force square off & mark EOD");
    await closeAllPositions("EOD_FORCE");
    await writeState({ eodDoneFor: todayKey, running: false });
    RUNNING = false;

    try {
      await sendDailyEodReportIfEnabled();
    } catch (err) {
      console.error("[EOD] Email report failed:", err?.message || err);
    }
  }
}

// ------- Trade logic -------
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

    const grossPct = ((ltp - p.avgPrice) / p.avgPrice) * 100 * (p.type === "LONG" ? 1 : -1);
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
      qty
    });
    markTraded(r.symbol);
  }
}

// ------- tick loop -------
async function tick() {
  try {
    await markToMarket();   // keep LTP & pnl fresh
    await eodIfNeeded();    // non-negative close + EOD tasks

    // Only trade while engine is running and market is open
    if (!RUNNING || !isMarketOpenIST(nowIST())) return;

    const conf = await loadRuntimeConfig();
    await enforceRisk(conf);
    await manageOpenPositions(conf);
    await maybeOpenNewPositions(conf);
  } catch (err) {
    console.error("[EngineTickError]", err?.message || err);
  }
}

// ------- public API -------
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
