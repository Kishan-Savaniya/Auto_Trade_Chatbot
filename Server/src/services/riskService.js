// Server/src/services/riskService.js
// Unified risk module = (A) runtime guards used BEFORE placing orders,
// (B) periodic hard-stop checks based on realized PnL & capital usage.
//
// Keeps your existing snapshot/limit logic (daily loss + capital use) and
// merges kill-switch, orders/min throttling, per-symbol/day loss caps, and
// exposure cap used in pre-trade validation.

// ----- Imports from your existing code -----
import { Order } from "../models/Order.js";
import { Position } from "../models/Position.js";
import { Settings } from "../models/Settings.js";
import { todayKeyIST } from "../utils/istTime.js";
import { setEngineRunning } from "./engineLoop.js";
import { closeAllPositions, markToMarket } from "./brokerService.js";

// Optional metrics (safe if not present)
let metrics = null;
try {
  // export counters in metrics/metrics.js if available
  metrics = await import("../metrics/metrics.js").then(m => m).catch(() => null);
} catch { /* noop */ }

// ---------------------------------------------------------------------------------
// RUNTIME STATE (fast in-memory controls)
// ---------------------------------------------------------------------------------
const state = {
  killSwitch: false,

  // ENV defaults for lightweight runtime checks; persisted Settings
  // still drive the hard-stop checks inside ensureRiskLimits()
  dayLossCap: Number(process.env.RISK_DAY_LOSS || 5000),
  perSymbolLossCap: Number(process.env.RISK_SYMBOL_LOSS || 2000),
  maxOrdersPerMin: Number(process.env.RISK_ORDERS_PER_MIN || 30),
  exposureCap: Number(process.env.RISK_EXPOSURE || 1_000_000),

  counters: {
    ordersWindow: [],          // timestamps for orders/min throttle
    perSymbolPnl: new Map(),   // symbol -> realized PnL (best-effort, optional)
  }
};

// ---------------------------------------------------------------------------------
// PUBLIC API: runtime toggles for operations / admin panel
// ---------------------------------------------------------------------------------
export function setKillSwitch(on) {
  state.killSwitch = !!on;
  console.warn(`[RISK] Kill-switch ${state.killSwitch ? "ENABLED" : "DISABLED"}`);
}
export function isKillSwitchOn() { return state.killSwitch; }

// ---------------------------------------------------------------------------------
// LIGHTWEIGHT PRE-TRADE CHECKS (called BEFORE OMS.place())
// These run synchronously and should be fast.
// ---------------------------------------------------------------------------------
/**
 * checkOrder — throw to block an order BEFORE it hits OMS/broker.
 * Provide estPrice when possible; fall back to 0.
 */
export function checkOrder({ symbol, side, qty, estPrice = 0, notional }) {
  // 0) Global kill
  if (state.killSwitch) throw new Error("Risk: kill switch active");

  const now = Date.now();

  // 1) Orders/min throttling (sliding window 60s)
  state.counters.ordersWindow = state.counters.ordersWindow.filter(t => now - t < 60_000);
  if (state.counters.ordersWindow.length >= state.maxOrdersPerMin) {
    throw new Error("Risk: max orders/min reached");
  }
  state.counters.ordersWindow.push(now);

  // 2) Exposure cap (rough notional check = qty * price)
  const approxNotional = Number(notional ?? (Number(qty || 0) * Number(estPrice || 0)));
  if (Number.isFinite(approxNotional) && approxNotional > 0 && approxNotional > state.exposureCap) {
    throw new Error(`Risk: order notional ${approxNotional} exceeds exposure cap ${state.exposureCap}`);
  }

  // 3) Per-symbol realized loss cap (best-effort running counter)
  const symPnL = Number(state.counters.perSymbolPnl.get(symbol) || 0);
  if (-Math.abs(state.perSymbolLossCap) >= symPnL) {
    // already below or at cap; block more losses
    throw new Error(`Risk: per-symbol loss cap breached for ${symbol}`);
  }

  return true;
}

// Optionally update per-symbol realized PnL (caller can feed fills here)
export function updatePerSymbolPnL(symbol, realizedDelta) {
  const cur = Number(state.counters.perSymbolPnl.get(symbol) || 0);
  const next = cur + Number(realizedDelta || 0);
  state.counters.perSymbolPnl.set(symbol, next);
}

// ---------------------------------------------------------------------------------
// HARD-STOP SNAPSHOT / LIMIT ENFORCEMENT (existing logic, kept intact)
// Runs on a schedule or on-demand (e.g., each N seconds or on new fill).
// ---------------------------------------------------------------------------------
function cashflowPnL(orders) {
  const by = new Map();
  for (const o of orders) {
    const v = by.get(o.symbol) || { buy: 0, sell: 0 };
    const price = Number(o.price || 0);
    const qty   = Number(o.qty || 0);
    if (o.side === "BUY") v.buy  += price * qty;
    else                  v.sell += price * qty;
    by.set(o.symbol, v);
  }
  let realized = 0;
  for (const v of by.values()) realized += (v.sell - v.buy);
  return Number(realized.toFixed(2));
}

function capitalInUseFromPositions(positions) {
  // Simple exposure proxy: sum(qty * (ltp || avgPrice))
  let cap = 0;
  for (const p of positions) {
    const px = Number(p.ltp || p.avgPrice || 0);
    cap += Number(p.qty || 0) * px;
  }
  return Math.max(0, Math.round(cap));
}

export async function riskSnapshot() {
  // Settings drive the hard-stop
  const s = await Settings.findOne({}) || await Settings.create({});
  const { dailyLossLimit = 5000, maxCapitalUsage = 50000 } = s.risk || {};

  const dayKey = todayKeyIST();
  const start = new Date(`${dayKey}T00:00:00.000Z`);
  const end   = new Date(`${dayKey}T23:59:59.999Z`);

  // Realized PnL from today's orders (cashflow)
  const orders = await Order.find({ createdAt: { $gte: start, $lte: end } });
  const net = cashflowPnL(orders);

  // Refresh LTPs for capital calc
  await markToMarket();
  const positions = await Position.find({});
  const capitalInUse = capitalInUseFromPositions(positions);

  return {
    dayKey,
    net,
    capitalInUse,
    limits: { dailyLossLimit, maxCapitalUsage }
  };
}

/**
 * ensureRiskLimits — HALT engine + square-off when hard limits breach.
 * Returns { stopped, reason?, snapshot }.
 */
export async function ensureRiskLimits() {
  const snap = await riskSnapshot();
  const breachDailyLoss = snap.net <= -Math.abs(snap.limits.dailyLossLimit);
  const breachCapital   = snap.capitalInUse > Math.abs(snap.limits.maxCapitalUsage);

  if (breachDailyLoss || breachCapital) {
    const reason = breachDailyLoss ? "DAILY_LOSS_LIMIT" : "CAP_USAGE_LIMIT";
    console.warn(
      `[RISK] Stopping engine :: reason=${reason} net=${snap.net} cap=${snap.capitalInUse} limits=${JSON.stringify(snap.limits)}`
    );

    try {
      await setEngineRunning(false);
    } catch (e) {
      console.error("[RISK] setEngineRunning(false) failed:", e?.message || e);
    }

    try {
      await closeAllPositions(reason);
    } catch (e) {
      console.error("[RISK] closeAllPositions failed:", e?.message || e);
    }

    if (metrics?.riskHalts) metrics.riskHalts.inc?.();
    return { stopped: true, reason, snapshot: snap };
  }

  return { stopped: false, snapshot: snap };
}
