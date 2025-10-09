// Server/src/services/riskService.js
// Centralized risk gates used by the strategy/engine/scheduler.
// Exposes: setKillSwitch, isKillSwitchOn, setCutoffActive, isCutoffActive,
//          shouldBlockNewEntries, checkOrder

const state = {
  // hard switches
  killSwitch: false,        // when true, no new entries are allowed
  cutoffActive: false,      // EOD cutoff (set by scheduler at 15:25 IST)

  // caps (from .env, with safe defaults)
  dayLossCap: Number(process.env.RISK_DAY_LOSS || 5000),
  perSymbolLossCap: Number(process.env.RISK_SYMBOL_LOSS || 2000),
  maxOrdersPerMin: Number(process.env.RISK_ORDERS_PER_MIN || 30),
  exposureCap: Number(process.env.RISK_EXPOSURE || 1_000_000),

  // in-memory counters (lightweight; persist if you need cluster safety)
  counters: {
    ordersWindow: [],        // timestamps of recent order requests (ms)
    perSymbolLoss: new Map() // symbol -> running loss estimate (optional; refined by reconciler)
  },

  // (optional) live snapshots you can feed from reconciler/PNL calc
  snapshots: {
    netPnl: 0,               // set from reconciler if you want exact broker PnL parity
    exposure: 0              // set from positions mark-to-market loop if needed
  }
};

/* ----------------------------- switches & flags ----------------------------- */
export function setKillSwitch(on)       { state.killSwitch = !!on; }
export function isKillSwitchOn()        { return !!state.killSwitch; }
export function setCutoffActive(on)     { state.cutoffActive = !!on; }
export function isCutoffActive()        { return !!state.cutoffActive; }

/**
 * Coarse pre-trade gate used by strategy before placing any order.
 * Returns { block:boolean, reason?:string }
 * Extend this to read exact broker PnL and exposure via reconciler if needed.
 */
export async function shouldBlockNewEntries() {
  if (state.killSwitch)   return { block: true, reason: "KILL_SWITCH" };
  if (state.cutoffActive) return { block: true, reason: "EOD_CUTOFF" };

  // Day loss cap (uses snapshots.netPnl if wired; otherwise skip)
  if (Number.isFinite(state.snapshots.netPnl)) {
    const net = Number(state.snapshots.netPnl || 0);
    if (net <= -Math.abs(state.dayLossCap)) {
      return { block: true, reason: "DAY_LOSS_CAP" };
    }
  }

  // Exposure cap (if you update snapshots.exposure elsewhere)
  if (Number.isFinite(state.snapshots.exposure)) {
    const exp = Number(state.snapshots.exposure || 0);
    if (exp > Math.abs(state.exposureCap)) {
      return { block: true, reason: "EXPOSURE_CAP" };
    }
  }

  return { block: false };
}

/**
 * Fine-grained per-order checks. Throw to reject the order; otherwise return true.
 * - Orders/min sliding window
 * - Optional per-symbol cap (uses local running estimate)
 */
export function checkOrder({ symbol, side, qty, estPrice }) {
  const now = Date.now();

  // global kill & cutoff hard stop
  if (state.killSwitch)   throw new Error("Risk: kill switch active");
  if (state.cutoffActive) throw new Error("Risk: EOD cutoff active");

  // rate limit: sliding 60s window
  const win = state.counters.ordersWindow;
  // keep only events within last 60s
  for (let i = win.length - 1; i >= 0; i--) if (now - win[i] > 60_000) win.pop(); else break;
  if (win.length >= state.maxOrdersPerMin) {
    throw new Error("Risk: max orders/min reached");
  }
  win.unshift(now); // push newest at front (so popping from end is older)

  // optional per-symbol running loss (local approximation; authoritative parity from reconciler)
  if (symbol && Number.isFinite(state.perSymbolLossCap)) {
    const key = String(symbol);
    const approxSide = (side || "").toUpperCase();
    const signed = (approxSide === "SELL" ? +1 : -1) * Number(estPrice || 0) * Number(qty || 0);

    const prev = state.counters.perSymbolLoss.get(key) || 0;
    const next = prev + signed;
    state.counters.perSymbolLoss.set(key, next);

    if (next <= -Math.abs(state.perSymbolLossCap)) {
      throw new Error(`Risk: per-symbol loss cap breached for ${key}`);
    }
  }

  return true;
}

/* ------------------------- optional snapshot updaters ------------------------ */
/** Call this from your reconciler to keep day PnL parity in memory */
export function setNetPnlSnapshot(value) {
  if (Number.isFinite(value)) state.snapshots.netPnl = Number(value);
}
/** Call this from a positions MTM loop to track exposure */
export function setExposureSnapshot(value) {
  if (Number.isFinite(value)) state.snapshots.exposure = Number(value);
}
