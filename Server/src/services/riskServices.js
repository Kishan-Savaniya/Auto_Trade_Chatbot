// Server/src/services/riskService.js
// Centralized risk gates used by the strategy/engine/scheduler.
// Exposes: setKillSwitch, isKillSwitchOn, setCutoffActive, isCutoffActive,
//          shouldBlockNewEntries, checkOrder,
//          setNetPnlSnapshot, setExposureSnapshot

const state = {
  // hard switches
  killSwitch: false,        // when true, no new entries are allowed
  cutoffActive: false,      // EOD cutoff (set by scheduler at 15:25 IST)

  // caps (env-configurable)
  dayLossCap: Number(process.env.RISK_DAY_LOSS || 5000),
  perSymbolLossCap: Number(process.env.RISK_SYMBOL_LOSS || 2000),
  maxOrdersPerMin: Number(process.env.RISK_ORDERS_PER_MIN || 30),
  exposureCap: Number(process.env.RISK_EXPOSURE || 1_000_000),

  // in-memory counters
  counters: {
    ordersWindow: [],        // timestamps (ms) of recent order requests
    perSymbolLoss: new Map() // symbol -> running loss estimate (approx)
  },

  // (optional) snapshots fed from reconciler/MTM loops
  snapshots: {
    netPnl: 0,               // broker PnL parity if you wire it
    exposure: 0              // current gross exposure (qty * ltp)
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
 */
export async function shouldBlockNewEntries() {
  if (state.killSwitch)   return { block: true, reason: "KILL_SWITCH" };
  if (state.cutoffActive) return { block: true, reason: "EOD_CUTOFF" };

  // Day loss cap (if reconciler updates snapshots.netPnl)
  if (Number.isFinite(state.snapshots.netPnl)) {
    const net = Number(state.snapshots.netPnl || 0);
    if (net <= -Math.abs(state.dayLossCap)) {
      return { block: true, reason: "DAY_LOSS_CAP" };
    }
  }

  // Exposure cap (if MTM loop updates snapshots.exposure)
  if (Number.isFinite(state.snapshots.exposure)) {
    const exp = Number(state.snapshots.exposure || 0);
    if (exp > Math.abs(state.exposureCap)) {
      return { block: true, reason: "EXPOSURE_CAP" };
    }
  }

  return { block: false };
}

/**
 * Fine-grained per-order checks. Throw to reject; otherwise return true.
 * - Orders/min sliding window
 * - Optional per-symbol cap (approx; authoritative parity from reconciler)
 */
export function checkOrder({ symbol, side, qty, estPrice }) {
  const now = Date.now();

  // global hard stops
  if (state.killSwitch)   throw new Error("Risk: kill switch active");
  if (state.cutoffActive) throw new Error("Risk: EOD cutoff active");

  // rate limit: sliding 60s window
  const win = state.counters.ordersWindow;
  // trim items >60s old (items are newest-first)
  for (let i = win.length - 1; i >= 0; i--) {
    if (now - win[i] > 60_000) win.pop(); else break;
  }
  if (win.length >= state.maxOrdersPerMin) {
    throw new Error("Risk: max orders/min reached");
  }
  win.unshift(now);

  // optional per-symbol running loss approximation
  if (symbol && Number.isFinite(state.perSymbolLossCap)) {
    const key = String(symbol);
    const s = (side || "").toUpperCase();
    const signed = (s === "SELL" ? +1 : -1) * Number(estPrice || 0) * Number(qty || 0);
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
export function setNetPnlSnapshot(value) {
  if (Number.isFinite(value)) state.snapshots.netPnl = Number(value);
}
export function setExposureSnapshot(value) {
  if (Number.isFinite(value)) state.snapshots.exposure = Number(value);
}
