// Server/src/services/brokerService.js
import { Order } from "../models/Order.js";
import { Position } from "../models/Position.js";
import { ltpOf } from "./marketDataService.js";

/**
 * Place an order (mock fill) and update positions with safe netting.
 * Also computes realized P&L whenever you reduce/close a position.
 */
export async function placeOrder({ symbol, side, qty, price: overridePrice }) {
  if (!symbol || !side || !qty) {
    throw new Error("placeOrder requires { symbol, side, qty }");
  }

  const mkt = ltpOf(symbol);
  const price = Number.isFinite(overridePrice) ? overridePrice : (Number.isFinite(mkt) ? mkt : 0);

  const ord = await Order.create({
    symbol,
    side,
    qty,
    price,
    status: "FILLED",
    realizedPnl: 0
  });

  const posSide = side === "BUY" ? "LONG" : "SHORT";
  let pos = await Position.findOne({ symbol });

  const realizedFor = (position, closeQty, fillPrice) => {
    if (!position || !closeQty) return 0;
    // Closing LONG by SELL => profit = (sell - avg) * closeQty
    // Closing SHORT by BUY => profit = (avg - buy) * closeQty
    return Number(
      (position.type === "LONG"
        ? (fillPrice - position.avgPrice) * closeQty
        : (position.avgPrice - fillPrice) * closeQty
      ).toFixed(2)
    );
  };

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
    const realized = realizedFor(pos, qty, price);
    await Order.updateOne({ _id: ord._id }, { $set: { realizedPnl: realized } });

    pos.qty -= qty;
    pos.ltp = price;
    await pos.save();
    return ord;
  }

  if (qty === pos.qty) {
    // Full close
    const realized = realizedFor(pos, qty, price);
    await Order.updateOne({ _id: ord._id }, { $set: { realizedPnl: realized } });

    await Position.deleteOne({ _id: pos._id }); // idempotent delete
    return ord;
  }

  // qty > pos.qty -> close current & open leftover on opposite side
  const realized = realizedFor(pos, pos.qty, price);
  await Order.updateOne({ _id: ord._id }, { $set: { realizedPnl: realized } });

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
}

export async function markToMarket() {
  const cursor = Position.find({}, { _id: 1, symbol: 1, type: 1, avgPrice: 1, qty: 1 }).cursor();

  const ops = [];
  for await (const p of cursor) {
    const ltp = ltpOf(p.symbol);
    const current = Number.isFinite(ltp) ? ltp : p.avgPrice;
    const diff = p.type === "LONG" ? current - p.avgPrice : p.avgPrice - current;
    const pnl = Number((diff * p.qty).toFixed(2));

    ops.push({
      updateOne: {
        filter: { _id: p._id },
        update: { $set: { ltp: current, pnl } },
      },
    });
  }

  if (ops.length) {
    await Position.bulkWrite(ops, { ordered: false });
  }
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
