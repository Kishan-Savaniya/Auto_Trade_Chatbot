// Server/src/services/reconcileService.js
import { getBrokerAdapter, getBrokerName } from "./providers.js";
import { Order } from "../models/Order.js";

export async function reconcile(userId = "default") {
  const A = await getBrokerAdapter();
  const [orders, positions] = await Promise.all([
    A.getOrders?.(userId).catch(()=>[]),
    A.getPositions?.(userId).catch(()=>[])
  ]);

  // Update local order statuses (OPEN -> COMPLETE/REJECTED/CANCELLED if broker says so)
  for (const o of orders || []) {
    if (!o?.brokerOrderId) continue;
    await Order.updateOne(
      { brokerOrderId: o.brokerOrderId },
      { $set: { status: o.status || "OPEN" } }
    ).catch(()=>{});
  }

  return { broker: getBrokerName(), orders: (orders||[]).length, positions: (positions||[]).length };
}

export function startReconciler(userId = "default", everyMs = 30_000) {
  const iv = setInterval(() => reconcile(userId).catch(console.error), everyMs);
  return () => clearInterval(iv);
}
