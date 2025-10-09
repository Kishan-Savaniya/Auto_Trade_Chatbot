// Server/src/services/marketHub.js
import EventEmitter from "events";
import { getBrokerAdapter, getBrokerName } from "./providers.js";
export const marketBus = new EventEmitter();
let _stop;
export async function startMarketFeed(symbols = []){
  if(_stop){ try{_stop();}catch{} _stop=null; }
  const A = await getBrokerAdapter();
  const unsub = A.connectMarketWS({
    instruments: symbols,
    onTick: (t)=>marketBus.emit("tick", t),
    onStatus: (st, err)=>marketBus.emit("feed:status", { broker: getBrokerName(), st, err: err?.message })
  });
  _stop = ()=>unsub && unsub();
  return _stop;
}
export function stopMarketFeed(){ if(_stop){ try{_stop();}catch{} _stop=null; } }
