import { snapshotRows, onTick } from "./marketDataService.js";
import { placeNormalizedOrder } from "./oms.js";
import { shouldBlockNewEntries, checkOrder } from "./riskService.js";
import { counters } from "../metrics/metrics.js";
import { isEngineRunning } from "../routes/engine.js";

const last = new Map();       // symbol -> last price
const ema = new Map();        // symbol -> { ema12, ema26, dea }
const lastAction = new Map(); // symbol -> ms

const COOLDOWN_MS = 30_000;

function emaUpdate(prev, price, period){
  const k = 2/(period+1);
  return prev == null ? price : prev + k*(price - prev);
}

function macdFor(symbol, price){
  const s = ema.get(symbol) || { ema12:null, ema26:null, dea:0 };
  s.ema12 = emaUpdate(s.ema12, price, 12);
  s.ema26 = emaUpdate(s.ema26, price, 26);
  const dif = (s.ema12 ?? price) - (s.ema26 ?? price);
  s.dea = emaUpdate(s.dea, dif, 9);
  ema.set(symbol, s);
  const bar = (dif - s.dea) * 2;
  return { dif, dea: s.dea, bar };
}

function rsiFor(symbol, price){
  const p = last.get(symbol);
  last.set(symbol, price);
  if (p == null) return 50;
  const up = Math.max(0, price - p);
  const down = Math.max(0, p - price);
  // simple 14-period approximation using smoothing
  const key = symbol + ":rsi";
  const st = rsiState.get(key) || { avgUp: up, avgDown: down };
  st.avgUp = (st.avgUp*13 + up)/14;
  st.avgDown = (st.avgDown*13 + down)/14;
  rsiState.set(key, st);
  const rs = st.avgDown ? st.avgUp/st.avgDown : 100;
  return 100 - (100/(1+rs));
}
const rsiState = new Map();

export function startStrategyLoop(){
  onTick(async (t)=>{
    if (!isEngineRunning()) return;
    const now = Date.now();
    const lastAt = lastAction.get(t.symbol)||0;
    if (now - lastAt < COOLDOWN_MS) return;

    const macd = macdFor(t.symbol, t.ltp);
    const rsi = rsiFor(t.symbol, t.ltp);

    // Simple conditions
    let action = null;
    if (rsi < 30 && macd.bar > 0) action = "BUY";
    else if (rsi > 70 && macd.bar < 0) action = "SELL";

    if (!action) return;

    // Risk gates
    const gate = await shouldBlockNewEntries(); if (gate.block) return;
    try{ checkOrder({ symbol:t.symbol, side:action, qty:1, estPrice:t.ltp }); } catch { return; }

    // Place normalized order; include variety default
    const o = await placeNormalizedOrder("default", { symbol:t.symbol, side:action, qty:1, type:"MARKET", variety:"regular" });
    if (o?.status === "PLACED") { counters.orders_placed.inc(); lastAction.set(t.symbol, now); }
  });
}
