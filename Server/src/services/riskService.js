// Server/src/services/riskService.js
const state = {
  killSwitch: false,
  cutoffActive: false,
  dayLossCap: Number(process.env.RISK_DAY_LOSS || 5000),
  perSymbolLossCap: Number(process.env.RISK_SYMBOL_LOSS || 2000),
  maxOrdersPerMin: Number(process.env.RISK_ORDERS_PER_MIN || 30),
  exposureCap: Number(process.env.RISK_EXPOSURE || 1_000_000),
  counters: { ordersWindow: [], perSymbolLoss: new Map() },
  snapshots: { netPnl: 0, exposure: 0 }
};
export function setKillSwitch(on){ state.killSwitch = !!on; }
export function isKillSwitchOn(){ return !!state.killSwitch; }
export function setCutoffActive(on){ state.cutoffActive = !!on; }
export function isCutoffActive(){ return !!state.cutoffActive; }
export async function shouldBlockNewEntries(){
  if (state.killSwitch) return { block:true, reason:"KILL_SWITCH" };
  if (state.cutoffActive) return { block:true, reason:"EOD_CUTOFF" };
  if (Number.isFinite(state.snapshots.netPnl)){
    const net = Number(state.snapshots.netPnl||0);
    if (net <= -Math.abs(state.dayLossCap)) return { block:true, reason:"DAY_LOSS_CAP" };
  }
  if (Number.isFinite(state.snapshots.exposure)){
    const exp = Number(state.snapshots.exposure||0);
    if (exp > Math.abs(state.exposureCap)) return { block:true, reason:"EXPOSURE_CAP" };
  }
  return { block:false };
}
export function checkOrder({ symbol, side, qty, estPrice }){
  const now = Date.now();
  if (state.killSwitch) throw new Error("Risk: kill switch active");
  if (state.cutoffActive) throw new Error("Risk: EOD cutoff active");
  const win = state.counters.ordersWindow;
  for (let i=win.length-1;i>=0;i--) { if (now - win[i] > 60000) win.pop(); else break; }
  if (win.length >= state.maxOrdersPerMin) throw new Error("Risk: max orders/min reached");
  win.unshift(now);
  if (symbol && Number.isFinite(state.perSymbolLossCap)){
    const key = String(symbol);
    const s = (side||"").toUpperCase();
    const signed = (s==="SELL"?+1:-1) * Number(estPrice||0) * Number(qty||0);
    const prev = state.counters.perSymbolLoss.get(key) || 0;
    const next = prev + signed;
    state.counters.perSymbolLoss.set(key, next);
    if (next <= -Math.abs(state.perSymbolLossCap)) throw new Error(`Risk: per-symbol loss cap breached for ${key}`);
  }
  return true;
}
export function setNetPnlSnapshot(v){ if (Number.isFinite(v)) state.snapshots.netPnl = Number(v); }
export function setExposureSnapshot(v){ if (Number.isFinite(v)) state.snapshots.exposure = Number(v); }
