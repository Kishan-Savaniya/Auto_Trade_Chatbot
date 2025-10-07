import { Order } from "../models/Order.js";

export async function dailyReport({ date = new Date() }) {
  // Compute today’s orders, basic PnL (if you persist fills/avg), risk events, slippage, latencies (if tracked)
  const start = new Date(date); start.setHours(0,0,0,0);
  const end = new Date(date);   end.setHours(23,59,59,999);
  const orders = await Order.find({ createdAt: { $gte: start, $lte: end } }).lean();
  const summary = {
    date: start.toISOString().slice(0,10),
    orders: orders.length,
    // TODO: compute PnL once fills/positions parity is in
  };
  return { summary, orders };
}
