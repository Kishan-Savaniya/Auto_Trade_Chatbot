import { getBrokerAdapter } from "./providers.js";
import { Order } from "../models/Order.js";
import { Position } from "../models/Position.js";
import { Execution } from "../models/Execution.js";
import { alert } from "../services/notifyService.js";

export async function reconcile() {
  const adapter = await getBrokerAdapter();
  const [brokerOrders, brokerPositions] = await Promise.all([
    adapter.getOrders(), adapter.getPositions()
  ]);
  // diff with local, fix, and alert drifts > threshold
  // ... (persist updates)
}

export function startReconciler() {
  return setInterval(() => reconcile().catch(e => alert("reconcile_fail", e)), 30000);
}
