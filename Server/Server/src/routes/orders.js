// Server/src/routes/orders.js
import { Router } from "express";
import { Order } from "../models/Order.js";
import { placeOrder } from "../services/brokerService.js";

export const ordersRouter = Router();

// GET all orders
ordersRouter.get("/", async (_req, res) => {
  const list = await Order.find({}).sort({ createdAt: -1 }).lean();
  res.json(list);
});

// POST place order (validates payload)
ordersRouter.post("/place", async (req, res) => {
  try {
    const { symbol, side, qty, price } = req.body || {};
    if (typeof symbol !== "string" || !symbol.trim()) {
      return res.status(400).json({ ok: false, error: "symbol is required" });
    }
    if (!["BUY", "SELL"].includes(side)) {
      return res.status(400).json({ ok: false, error: "side must be BUY or SELL" });
    }
    const nQty = Number(qty);
    if (!Number.isFinite(nQty) || nQty <= 0) {
      return res.status(400).json({ ok: false, error: "qty must be a positive number" });
    }

    const ord = await placeOrder({ symbol: symbol.trim(), side, qty: nQty, price });
    res.json({ ok: true, order: ord });
  } catch (e) {
    console.error("[orders/place] error:", e?.message || e);
    res.status(500).json({ ok: false, error: e?.message || "Failed to place order" });
  }
});
