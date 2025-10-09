// Server/src/services/brokerService.js
import { Order } from "../models/Order.js";
import { Position } from "../models/Position.js";
import { ltpOf } from "./marketDataService.js";

/**
 * Place an order (mock fill) and update positions with safe netting.
 * Validates input inside the function; API validates too.
 */
export async function placeOrder(payload = {}) {
  try {
    const { symbol, side, qty, price: overridePrice } = payload;

    if (typeof symbol !== "string" || !symbol.trim()) {
      throw new Error("placeOrder requires a valid symbol (string)");
    }
    if (!["BUY", "SELL"].includes(side)) {
      throw new Error("placeOrder requires side = BUY | SELL");
    }
    const nQty = Number(qty);
    if (!Number.isFinite(nQty) || nQty <= 0) {
      throw new Error("placeOrder requires qty > 0");
    }

    const mkt = ltpOf(symbol);
    const price = Number.isFinite(Number(overridePrice))
      ? Number(overridePrice)
      : (Number.isFinite(mkt) ? mkt : 0);

    const ord = await Order.create({
      symbol: symbol.trim(),
      side,
      qty: nQty,
      price,
      status: "FILLED",
    });

    const posSide = side === "BUY" ? "LONG" : "SHORT";
    let pos = await Position.findOne({ symbol: symbol.trim() });

    if (!pos) {
      await Position.create({
        symbol: symbol.trim(),
        type: posSide,
        qty: nQty,
        avgPrice: price,
        ltp: price,
        pnl: 0,
      });
      return ord;
    }

    if (pos.type === posSide) {
      const totalCost = pos.avgPrice * pos.qty + price * nQty;
      const newQty = pos.qty + nQty;
      pos.avgPrice = totalCost / newQty;
      pos.qty = newQty;
      pos.ltp = price;
      await pos.save();
      return ord;
    }

    if (nQty < pos.qty) {
      pos.qty -= nQty;
      pos.ltp = price;
      await pos.save();
      return ord;
    }

    if (nQty === pos.qty) {
      await Position.deleteOne({ _id: pos._id });
      return ord;
    }

    const leftover = nQty - pos.qty;
    await Position.deleteOne({ _id: pos._id });
    await Position.create({
      symbol: symbol.trim(),
      type: posSide,
      qty: leftover,
      avgPrice: price,
      ltp: price,
      pnl: 0,
    });
    return ord;
  } catch (err) {
    // Do NOT reference variables like `symbol` here; they may be undefined in bad calls
    console.error("[broker/placeOrder] failed:", err?.message || err);
    throw err;
  }
}

export async function markToMarket() {
  const cursor = Position.find({}, { _id: 1, symbol: 1, type: 1, avgPrice: 1, qty: 1 }).cursor();
  const ops = [];
  for await (const p of cursor) {
    const ltp = ltpOf(p.symbol);
    const current = Number.isFinite(ltp) ? ltp : p.avgPrice;
    const diff = p.type === "LONG" ? current - p.avgPrice : p.avgPrice - current;
    const pnl = Number((diff * p.qty).toFixed(2));
    ops.push({ updateOne: { filter: { _id: p._id }, update: { $set: { ltp: current, pnl } } } });
  }
  if (ops.length) await Position.bulkWrite(ops, { ordered: false });
}

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
