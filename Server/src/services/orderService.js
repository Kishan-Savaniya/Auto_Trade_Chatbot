import { place as omsPlace } from "./oms/index.js";
import { checkOrder } from "./riskService.js";

export async function queueOrder(userId, order) {
  // Enrich with estimates if needed
  checkOrder({ symbol: order.symbol, side: order.side, qty: order.qty, estPrice: order.limitPrice });
  return omsPlace(userId, order);
}
