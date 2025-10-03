import { Router } from "express";
import { Order } from "../models/Order.js";
import { placeOrder } from "../services/brokerService.js";
import { getBrokerAdapter, getUserBrokerName } from "../services/brokers/index.js";


export const ordersRouter = Router();

ordersRouter.get("/", async (_req, res) => {
  const list = await Order.find({}).sort({ createdAt: -1 }).limit(100);
  res.json(list);
});

// Manually place order (test endpoint)
ordersRouter.post("/place", async (req, res) => {
  const { symbol, side, qty } = req.body || {};
  if (!symbol || !side || !qty) {
    return res.status(400).json({ error: "symbol, side, qty required" });
  }
  const o = await placeOrder({ symbol, side, qty: Number(qty) });
  res.json({ ok: true, order: o });
});

const adapter = getBrokerAdapter(getUserBrokerName());
try {
  const br = await adapter.placeOrder("default", { symbol, side, qty, price });
  // store br.brokerOrderId in your Order doc (optional)
} catch (e) {
  console.error("[broker/placeOrder] failed:", e.message);
}
