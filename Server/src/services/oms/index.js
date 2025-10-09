// Server/src/services/oms/index.js
import { getBrokerAdapter } from "../providers.js";
import crypto from "node:crypto";
import { checkOrder } from "../riskService.js";
const seen = new Set();
export function makeIdemKey(userId, payload){ const base=JSON.stringify({userId, ...payload}); return crypto.createHash("sha256").update(base).digest("hex"); }
export async function place(userId, payload){
  checkOrder({ symbol:payload.symbol, side:payload.side, qty:payload.qty, estPrice:payload.price||0 });
  const key = makeIdemKey(userId, payload);
  if(seen.has(key)) return { ok:true, idempotent:true, key };
  const A = await getBrokerAdapter();
  const res = await A.placeOrder(userId, payload);
  seen.add(key);
  return { ok:true, key, brokerOrderId: res?.brokerOrderId || res?.id };
}
export async function modify(){ throw new Error("modify not implemented"); }
export async function cancel(){ throw new Error("cancel not implemented"); }
