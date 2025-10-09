// Server/src/services/strategyService.js
import { marketBus } from "./marketHub.js";
import { queueOrder } from "./orderService.js";
import { rsi, macd } from "../lib/technicals.js";
const WINDOW=200, COOLDOWN_MS=30000;
const state = new Map();
function pushPrice(s,px){ s.prices.push(px); if(s.prices.length>WINDOW) s.prices.shift(); }
function computeFeatures(s){ if(s.prices.length<34) return null; const R=rsi(s.prices,14); const M=macd(s.prices,12,26,9); return { rsi:R, macdHist:M?.hist ?? 0 }; }
function decide(f){ if(!f) return null; const up = f.macdHist>0 ? true : f.macdHist<0 ? false : null; if(f.rsi<30 && (up===null||up===true)) return { side:"BUY", qty:1 }; if(f.rsi>70 && (up===null||up===false)) return { side:"SELL", qty:1 }; return null; }
marketBus.on("tick", async (t)=>{
  const s = state.get(t.symbol) || { prices:[], lastSignalAt:0 };
  pushPrice(s, Number(t.ltp||0));
  const f = computeFeatures(s);
  const sig = decide(f);
  const now = Date.now();
  if(sig && now - s.lastSignalAt >= COOLDOWN_MS){
    s.lastSignalAt = now;
    try{ await queueOrder("default", { symbol:t.symbol, side:sig.side, qty:sig.qty, type:"MARKET" }); }catch{}
  }
  state.set(t.symbol, s);
});
