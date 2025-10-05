// Server/src/routes/reports.js
// Provides summarized daily P&L KPIs for the dashboard and a CSV download.
// Exports: reportsRouter

import { Router } from "express";
import { nowIST, todayKeyIST, istDayRangeUTC, shiftISTDays } from "../utils/istTime.js";
import { Order } from "../models/Order.js";

export const reportsRouter = Router();

/**
 * Compute realized P&L for an IST day using FILLED orders in chronological order.
 * We keep a simple running position per symbol and realize P&L on opposing-side fills.
 */
async function computeNetForDayIST(refDate = nowIST()) {
  const { startUTC, endUTC } = istDayRangeUTC(refDate);
  const orders = await Order.find({
    status: "FILLED",
    createdAt: { $gte: startUTC, $lt: endUTC },
  }).sort({ createdAt: 1 }).lean();

  const pos = new Map(); // sym -> { qty, avg }
  let realized = 0;
  let trades = 0;
  let wins = 0;
  let losses = 0;

  for (const o of orders) {
    const sym = o.symbol;
    const side = (o.side || "").toUpperCase(); // BUY/SELL
    const qty = Number(o.qty || 0);
    const price = Number(o.price || 0);

    if (!sym || !qty || !price) continue;
    trades++;

    const p = pos.get(sym) || { qty: 0, avg: 0 };

    if (side === "BUY") {
      // If currently short, buying closes short first (realize P&L on closed qty)
      if (p.qty < 0) {
        const closeQty = Math.min(-p.qty, qty);
        const pnl = (p.avg - price) * closeQty; // short avg - buy price
        realized += pnl;
        if (pnl >= 0) wins++; else losses++;

        p.qty += closeQty; // closer to zero
        // remaining buy (if any) adds to long qty with new average
        const rem = qty - closeQty;
        if (rem > 0) {
          const totalCost = p.avg * Math.max(p.qty, 0) + price * rem;
          const totalQty = Math.max(p.qty, 0) + rem;
          p.avg = totalQty ? totalCost / totalQty : 0;
          p.qty += rem;
        }
      } else {
        // opening/increasing long
        const totalCost = p.avg * p.qty + price * qty;
        const totalQty = p.qty + qty;
        p.avg = totalQty ? totalCost / totalQty : price;
        p.qty = totalQty;
      }
    } else if (side === "SELL") {
      // If currently long, selling closes long first (realize P&L on closed qty)
      if (p.qty > 0) {
        const closeQty = Math.min(p.qty, qty);
        const pnl = (price - p.avg) * closeQty; // sell - long avg
        realized += pnl;
        if (pnl >= 0) wins++; else losses++;

        p.qty -= closeQty;
        // remaining sell (if any) adds to short qty with new average
        const rem = qty - closeQty;
        if (rem > 0) {
          const totalProceeds = p.avg * Math.abs(Math.min(p.qty, 0)) + price * rem;
          const totalQty = Math.abs(Math.min(p.qty, 0)) + rem;
          p.avg = totalQty ? totalProceeds / totalQty : price;
          p.qty -= rem;
        }
      } else {
        // opening/increasing short
        const totalProceeds = p.avg * Math.abs(p.qty) + price * qty;
        const totalQty = Math.abs(p.qty) + qty;
        p.avg = totalQty ? totalProceeds / totalQty : price;
        p.qty -= qty;
      }
    }

    pos.set(sym, p);
  }

  return { net: Number(realized.toFixed(2)), trades, wins, losses };
}

/**
 * GET /api/reports/today
 * Returns: { todayNet, todayPercent, yesterdayNet, yesterdayPercent, trades, wins, losses, dayKeyIST }
 */
reportsRouter.get("/today", async (req, res) => {
  try {
    const today = await computeNetForDayIST(nowIST());
    const yesterday = await computeNetForDayIST(shiftISTDays(nowIST(), -1));

    // percent baselined by absolute notional; if zero, return 0%
    const denom = Math.max(Math.abs(today.net), 1);
    const todayPercent = Number(((today.net / denom) * 100).toFixed(2));
    const yesterdayPercent = Number(((yesterday.net / denom) * 100).toFixed(2));

    res.json({
      todayNet: today.net,
      todayPercent,
      yesterdayNet: yesterday.net,
      yesterdayPercent,
      trades: today.trades,
      wins: today.wins,
      losses: today.losses,
      dayKeyIST: todayKeyIST(nowIST()),
    });
  } catch (e) {
    console.error("[reports/today]", e);
    res.status(500).json({ error: "Failed to compute today's report" });
  }
});

/**
 * GET /api/reports/today/download
 * Downloads a simple CSV with the computed stats.
 */
reportsRouter.get("/today/download", async (_req, res) => {
  try {
    const today = await computeNetForDayIST(nowIST());
    const yesterday = await computeNetForDayIST(shiftISTDays(nowIST(), -1));

    const rows = [
      ["Metric", "Value"],
      ["Today Net", today.net],
      ["Today %", today.net === 0 ? 0 : ((today.net / Math.max(Math.abs(today.net), 1)) * 100).toFixed(2)],
      ["Yesterday Net", yesterday.net],
      ["Trades", today.trades],
      ["Wins", today.wins],
      ["Losses", today.losses],
      ["IST Day", todayKeyIST(nowIST())],
    ];

    const csv = rows.map(r => r.join(",")).join("\n");
    const fname = `report_${todayKeyIST(nowIST()).replace(/\s+/g, "_")}.csv`;
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="${fname}"`);
    res.send(csv);
  } catch (e) {
    console.error("[reports/today/download]", e);
    res.status(500).send("Download failed");
  }
});
