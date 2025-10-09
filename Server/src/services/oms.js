import crypto from "node:crypto";
import { getBrokerAdapter } from "./providers.js";
import { Order } from "../models/Order.js";

function idKey(payload){
  const raw = JSON.stringify({
    s: payload.symbol, side: payload.side, q: payload.qty,
    t: payload.type || "MARKET", px: payload.price || 0, v: payload.variety || "regular"
  });
  return crypto.createHash("sha256").update(raw).digest("hex");
}

export async function placeNormalizedOrder(userId, payload, { slippageBps=50, maxRetries=2 } = {}){
  const key = payload.idempotencyKey || idKey(payload);
  let doc = await Order.findOne({ userId, idempotencyKey:key });
  if (doc && doc.status && doc.status !== "REJECTED") return doc; // idempotent

  const A = await getBrokerAdapter();
  let attempt = 0, lastErr = null, brokerOrderId = null;
  while (attempt <= maxRetries){
    try{
      const req = { ...payload, idempotencyKey: key };
      const r = await A.placeOrder?.(userId, req, { idempotencyKey:key });
      brokerOrderId = r?.brokerOrderId || null;
      if (brokerOrderId) break;
      lastErr = new Error(r?.warning || "Unknown broker error");
    }catch(e){ lastErr = e; }
    attempt += 1;
    await new Promise(r=>setTimeout(r, 300 * attempt));
  }

  doc = await Order.findOneAndUpdate(
    { userId, idempotencyKey:key },
    { $set: {
      symbol: payload.symbol, side: payload.side, qty: payload.qty,
      price: payload.price || 0, type: payload.type || "MARKET",
      variety: payload.variety || "regular",
      status: brokerOrderId? "PLACED" : "REJECTED",
      brokerOrderId, slippageBoundBps: slippageBps
    } }, { new:true, upsert:true }
  );
  if (!brokerOrderId) doc.error = String(lastErr?.message || lastErr || "reject");
  return doc;
}

export async function modifyNormalizedOrder(userId, brokerOrderId, changes){
  const A = await getBrokerAdapter();
  const r = await A.modifyOrder?.(userId, brokerOrderId, changes).catch(e=>({ error:e?.message||String(e) }));
  if (r?.ok){
    await Order.updateOne({ userId, brokerOrderId }, { $set: { ...changes, status:"MODIFIED" } });
  }
  return r;
}

export async function cancelNormalizedOrder(userId, brokerOrderId, opts={}){
  const A = await getBrokerAdapter();
  const r = await A.cancelOrder?.(userId, brokerOrderId, opts).catch(e=>({ error:e?.message||String(e) }));
  if (r?.ok){
    await Order.updateOne({ userId, brokerOrderId }, { $set: { status:"CANCELED" } });
  }
  return r;
}
