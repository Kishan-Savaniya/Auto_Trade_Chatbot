import { v4 as uuid } from "uuid";
import { Order } from "../../models/Order.js";
import { getBrokerAdapter, getBrokerName } from "../providers.js";

export async function place(userId, order) {
  const idemKey = order.idemKey || uuid();
  const existing = await Order.findOne({ idemKey });
  if (existing) return existing;

  const broker = getBrokerName();
  const adapter = getBrokerAdapter();

  const doc = await Order.create({ ...order, userId, idemKey, broker, status: "PENDING" });
  try {
    const res = await adapter.placeOrder?.(userId, order);
    await Order.updateOne({ _id: doc._id }, { $set: { brokerOrderId: res?.brokerOrderId || null, status: res?.warning ? "PENDING" : "OPEN" } });
    return await Order.findById(doc._id);
  } catch (e) {
    await Order.updateOne({ _id: doc._id }, { $set: { status: "REJECTED" } });
    throw e;
  }
}

export async function cancel(userId, brokerOrderId) {
  const adapter = getBrokerAdapter();
  await adapter.cancelOrder?.(userId, brokerOrderId);
  await Order.updateOne({ brokerOrderId }, { $set: { status: "CANCELLED" } });
}

export async function modify(userId, brokerOrderId, patch) {
  const adapter = getBrokerAdapter();
  await adapter.modifyOrder?.(userId, brokerOrderId, patch);
}
