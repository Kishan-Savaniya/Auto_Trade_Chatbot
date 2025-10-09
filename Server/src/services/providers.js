// Server/src/services/providers.js
const ENV = (process.env.BROKER || "mock").toLowerCase();
const MAP = new Map([["kite","zerodha"],["zerodha","zerodha"],["upstox","upstox"],["paper","mock"],["mock","mock"]]);
export function normalizeBroker(n){ return MAP.get(String(n||ENV).toLowerCase()) || "mock"; }
let _name = normalizeBroker(ENV);
export function getBrokerName(){ return _name; }
export function setBrokerName(n){ _name = normalizeBroker(n); }
export async function getBrokerAdapter(name){
  const b = normalizeBroker(name || _name);
  try {
    if (b === "zerodha"){ const m = await import("./brokers/zerodha.js"); return { ...m, name:"zerodha" }; }
    if (b === "upstox"){  const m = await import("./brokers/upstox.js");  return { ...m, name:"upstox"  }; }
    const m = await import("./brokers/mockAdapter.js"); return { ...(m.default||m), name:"mock" };
  } catch (e){
    const m = await import("./brokers/mockAdapter.js");
    return { ...(m.default||m), name:"mock", error: e?.message || String(e) };
  }
}
