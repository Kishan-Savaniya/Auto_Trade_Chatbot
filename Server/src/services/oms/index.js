//Scope Create broker-agnostic API with idempotency, retries, slippage bounds.

import { v4 as uuid } from "uuid";
import { getBrokerAdapter } from "../providers.js"; // return active adapter
import { Order } from "../../models/Order.js";

export async function place(order) {
  const idemKey = order.idemKey || uuid();
  const existing = await Order.findOne({ idemKey });
  if (existing) return existing; // idempotent
  const adapter = await getBrokerAdapter();
  const res = await adapter.placeOrder({ ...order, idemKey });
  const doc = await Order.create({
    ...order, idemKey,
    brokerOrderId: res.brokerOrderId,
    status: "PENDING"
  });
  return doc;
}

export async function cancel(brokerOrderId) {
  const adapter = await getBrokerAdapter();
  await adapter.cancelOrder(brokerOrderId);
  await Order.updateOne({ brokerOrderId }, { $set: { status: "CANCELLED" }});
}

export async function modify(brokerOrderId, patch) {
  const adapter = await getBrokerAdapter();
  await adapter.modifyOrder(brokerOrderId, patch);
}
