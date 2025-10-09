import { marketBus, startMarketFeed } from "./marketHub.js";
const map = new Map();
let booted=false;
if(!booted){
  booted=true;
  startMarketFeed([]).catch(()=>{});
  marketBus.on("tick",(t)=>{
    const r = map.get(t.symbol)||{ symbol:t.symbol };
    r.ltp = t.ltp; r.ts = t.ts || Date.now();
    map.set(t.symbol, r);
  });
}
export function getSnapshotRows(){ return Array.from(map.values()); }
