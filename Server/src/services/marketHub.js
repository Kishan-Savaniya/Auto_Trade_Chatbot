import EventEmitter from "eventemitter3";
import { getBrokerAdapter } from "./providers.js";
export const marketBus = new EventEmitter();
let stop;
export async function startMarketFeed(symbols=[]){
  if(stop){ try{ stop(); }catch{} }
  const A = await getBrokerAdapter();
  stop = A.connectMarketWS({ instruments: symbols, onTick:(t)=>marketBus.emit("tick",t), onStatus:(s,e)=>marketBus.emit("feed", { s, e: e?.message }) });
  return ()=> stop && stop();
}
export function stopMarketFeed(){ if(stop){ try{ stop(); }catch{} stop=null; } }
