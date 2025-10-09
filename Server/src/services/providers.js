// Server/src/services/providers.js
const ENV_NAME = (process.env.BROKER || process.env.BROKER_PROVIDER || "kite").toLowerCase();
const NAME_ALIASES = new Map([["kite","zerodha"],["zerodha","zerodha"],["upstox","upstox"],["mock","mock"],["paper","mock"]]);
export function normalizeBroker(name){ if(!name) return "zerodha"; const k=String(name||"").toLowerCase(); return NAME_ALIASES.get(k)||"zerodha"; }
let _cachedName = normalizeBroker(ENV_NAME);
export function getBrokerName(){ return _cachedName; }
export function setBrokerName(newName){ _cachedName = normalizeBroker(newName); }
export async function getBrokerAdapter(name){
  const broker = normalizeBroker(name||_cachedName);
  if(broker==="zerodha"){ const m = await import("./brokers/zerodha.js"); return {loginUrl:m.loginUrl,handleCallback:m.handleCallback,isAuthenticated:m.isAuthenticated,connectMarketWS:m.connectMarketWS,placeOrder:m.placeOrder,getPositions:m.getPositions,getOrders:m.getOrders,name:"zerodha"}; }
  if(broker==="upstox"){ const m = await import("./brokers/upstox.js"); return {loginUrl:m.loginUrl,handleCallback:m.handleCallback,isAuthenticated:m.isAuthenticated,connectMarketWS:m.connectMarketWS,placeOrder:m.placeOrder,getPositions:m.getPositions,getOrders:m.getOrders,name:"upstox"}; }
  const m = await import("./brokers/mockAdapter.js"); return { ...m.default, name:"mock" };
}
