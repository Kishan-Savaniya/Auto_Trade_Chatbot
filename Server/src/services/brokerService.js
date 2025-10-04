// Server/src/services/brokerService.js
import { Order } from "../models/Order.js";
import { Position } from "../models/Position.js";
import { ltpOf } from "./marketDataService.js";

/**
 * Place an order (mock fill) and update positions with safe netting.
 * - Same side: increases qty, recalculates avgPrice.
 * - Opposite side: nets; may partially/fully close or flip side.
 * - No double save/delete in same tick.
 */
export async function placeOrder(payload = {}) {
  try {
    const { symbol, side, qty, price: overridePrice } = payload;

    if (!symbol || !side || !qty) {
      throw new Error("placeOrder requires { symbol, side, qty }");
    }

    const mkt = ltpOf(symbol);
    const price = Number.isFinite(Number(overridePrice))
      ? Number(overridePrice)
      : (Number.isFinite(mkt) ? mkt : 0);

    // 1) Create order (mock-filled immediately)
    const ord = await Order.create({
      symbol,
      side,
      qty,
      price,
      status: "FILLED",
    });

    // 2) Update / net position
    const posSide = side === "BUY" ? "LONG" : "SHORT";
    let pos = await Position.findOne({ symbol });

    // No existing position -> open fresh
    if (!pos) {
      await Position.create({
        symbol,
        type: posSide,
        qty,
        avgPrice: price,
        ltp: price,
        pnl: 0,
      });
      return ord;
    }

    // Same side -> average in
    if (pos.type === posSide) {
      const totalCost = pos.avgPrice * pos.qty + price * qty;
      const newQty = pos.qty + qty;
      pos.avgPrice = totalCost / newQty;
      pos.qty = newQty;
      pos.ltp = price;
      await pos.save();
      return ord;
    }

    // Opposite side -> netting/closing logic
    if (qty < pos.qty) {
      // Partial close
      pos.qty -= qty;
      pos.ltp = price;
      await pos.save();
      return ord;
    }

    if (qty === pos.qty) {
      // Full close
      await Position.deleteOne({ _id: pos._id }); // idempotent
      return ord;
    }

    // qty > pos.qty -> close current & open leftover on opposite side
    const leftover = qty - pos.qty;
    await Position.deleteOne({ _id: pos._id });
    await Position.create({
      symbol,
      type: posSide,
      qty: leftover,
      avgPrice: price,
      ltp: price,
      pnl: 0,
    });
    return ord;
  } catch (err) {
    // IMPORTANT: never reference variables that might be out of scope here
    console.error("[broker/placeOrder] failed:", err?.message || err);
    throw err;
  }
}

/**
 * Mark-to-market: updates LTP & PnL atomically.
 */
export async function markToMarket() {
  const cursor = Position.find({}, { _id: 1, symbol: 1, type: 1, avgPrice: 1, qty: 1 }).cursor();

  const ops = [];
  for await (const p of cursor) {
    const ltp = ltpOf(p.symbol);
    const current = Number.isFinite(ltp) ? ltp : p.avgPrice; // fallback
    const diff = p.type === "LONG" ? current - p.avgPrice : p.avgPrice - current;
    const pnl = Number((diff * p.qty).toFixed(2));

    ops.push({
      updateOne: { filter: { _id: p._id }, update: { $set: { ltp: current, pnl } } }
    });
  }

  if (ops.length) {
    await Position.bulkWrite(ops, { ordered: false });
  }
}

/**
 * Close all positions by placing the exact opposite order for each.
 * NOTE: Do not delete positions here; placeOrder handles netting/deletes.
 */
export async function closeAllPositions(reason = "EOD_SQUARE_OFF") {
  const list = await Position.find({}, { symbol: 1, type: 1, qty: 1 });
  const closed = [];
  for (const p of list) {
    const side = p.type === "LONG" ? "SELL" : "BUY";
    const qty = p.qty;
    if (qty > 0) {
      await placeOrder({ symbol: p.symbol, side, qty });
      closed.push({ symbol: p.symbol, qty, side, reason });
    }
  }
  return closed;
}
