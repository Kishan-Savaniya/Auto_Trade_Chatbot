// Uses DB Order/Position + ltp from marketHub
import { Order } from "../../models/Order.js";
import { Position } from "../../models/Position.js";
import { ltpOf } from "../../services/marketHub.js";

export const paperBroker = {
  async placeOrder({ symbol, side, qty }) {
    const price = ltpOf(symbol);
    const ord = await Order.create({ symbol, side, qty, price, status: "FILLED" });

    const posSide = side === "BUY" ? "LONG" : "SHORT";
    let pos = await Position.findOne({ symbol });
    if (!pos) {
      await Position.create({ symbol, type: posSide, qty, avgPrice: price, ltp: price, pnl: 0 });
      return ord;
    }
    if (pos.type === posSide) {
      const total = pos.avgPrice * pos.qty + price * qty;
      const newQty = pos.qty + qty;
      pos.avgPrice = total / newQty;
      pos.qty = newQty;
      pos.ltp = price;
      await pos.save();
      return ord;
    }
    if (qty < pos.qty) {
      pos.qty -= qty; pos.ltp = price; await pos.save(); return ord;
    }
    if (qty === pos.qty) {
      await Position.deleteOne({ _id: pos._id }); return ord;
    }
    const leftover = qty - pos.qty;
    await Position.deleteOne({ _id: pos._id });
    await Position.create({ symbol, type: posSide, qty: leftover, avgPrice: price, ltp: price, pnl: 0 });
    return ord;
  },

  async positions() { return Position.find({}); },

  async closeAll() {
    const list = await Position.find({});
    for (const p of list) {
      const side = p.type === "LONG" ? "SELL" : "BUY";
      await this.placeOrder({ symbol: p.symbol, side, qty: p.qty });
    }
  }
};
