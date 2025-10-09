import { marketBus, startMarketFeed } from "./marketHub.js";
import { counters } from "../metrics/metrics.js";
const map = new Map();
let booted=false;
if(!booted){ booted=true; startMarketFeed([]).catch(()=>{}); marketBus.on("tick",(t)=>{ const r = map.get(t.symbol)||{symbol:t.symbol}; r.ltp=t.ltp; map.set(t.symbol,r); }); }
export function snapshotRows(){ return Array.from(map.values()); }
export function onTick(cb){ marketBus.on("tick", cb); }
