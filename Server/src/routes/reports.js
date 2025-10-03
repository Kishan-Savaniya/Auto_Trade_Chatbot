// Server/src/routes/reports.js
import { Router } from "express";
import { Order } from "../models/Order.js";
import { Position } from "../models/Position.js";
import { ltpOf } from "../services/marketDataService.js";
import { config } from "../config.js";
import { nowIST, todayKeyIST, istDayRangeUTC, shiftISTDays } from "../utils/istTime.js";

export const reportsRouter = Router();

/* -------------------------------------------------------------------------- */
/*                       Realized P&L (avg-cost netting)                      */
/* -------------------------------------------------------------------------- */
/**
 * Computes realized P&L and basic stats from a list of FILLED orders.
 * Mirrors the averaging/netting used in brokerService so numbers align.
 */
function realizedFromOrders(orders) {
  const book = new Map(); // sym -> { invQty, avgCost, realized, wins, losses, turnover }

  const ensure = (sym) => {
    if (!book.has(sym)) {
      book.set(sym, {
        invQty: 0,        // +long / -short
        avgCost: 0,
        realized: 0,
        wins: 0,
        losses: 0,
        turnover: 0
      });
    }
    return book.get(sym);
  };

  // process in chronological order
  const sorted = [...orders].sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt));

  for (const o of sorted) {
    const sym = o.symbol;
    const side = o.side; // "BUY" | "SELL"
    const qty  = Number(o.qty || 0);
    const px   = Number(o.price || 0);
    if (!sym || !qty || !px) continue;

    const tQty = side === "BUY" ? qty : -qty;
    const s = ensure(sym);
    s.turnover += Math.abs(qty * px);

    // If no inventory, open fresh
    if (s.invQty === 0) {
      s.invQty = tQty;
      s.avgCost = px;
      continue;
    }

    // Same direction -> average in
    if ((s.invQty > 0 && tQty > 0) || (s.invQty < 0 && tQty < 0)) {
      const oldAbs = Math.abs(s.invQty);
      const addAbs = Math.abs(tQty);
      s.avgCost = (s.avgCost * oldAbs + px * addAbs) / (oldAbs + addAbs);
      s.invQty += tQty;
      continue;
    }

    // Opposite direction -> realize P&L for matched qty, then possibly flip
    const closeQty = Math.min(Math.abs(s.invQty), Math.abs(tQty));
    if (closeQty > 0) {
      let pnl = 0;
      if (s.invQty > 0) {
        // closing long by SELL px
        pnl = (px - s.avgCost) * closeQty;
      } else {
        // closing short by BUY px
        pnl = (s.avgCost - px) * closeQty;
      }
      s.realized += pnl;
      if (pnl > 0) s.wins += 1;
      else if (pnl < 0) s.losses += 1;
    }

    const remaining = s.invQty + tQty;
    if (remaining === 0) {
      // fully closed
      s.invQty = 0;
      s.avgCost = 0;
    } else if (Math.sign(remaining) === Math.sign(s.invQty)) {
      // reduced but same direction stays
      s.invQty = remaining;
    } else {
      // flipped direction; leftover opens at latest price
      const leftoverAbs = Math.abs(Math.abs(tQty) - Math.abs(s.invQty));
      s.invQty = leftoverAbs * Math.sign(tQty);
      s.avgCost = px;
    }
  }

  let realized = 0, wins = 0, losses = 0, turnover = 0;
  for (const v of book.values()) {
    realized += v.realized;
    wins += v.wins;
    losses += v.losses;
    turnover += v.turnover;
  }
  return {
    realized: Number(realized.toFixed(2)),
    wins,
    losses,
    turnover: Number(turnover.toFixed(2)),
  };
}

/* -------------------------------------------------------------------------- */
/*                        Daily report (for the IST day)                       */
/* -------------------------------------------------------------------------- */
async function computeTodayReport() {
  const { startUTC, endUTC } = istDayRangeUTC(nowIST());

  // Today’s filled orders (IST day window)
  const orders = await Order.find({
    createdAt: { $gte: startUTC, $lt: endUTC },
    status: "FILLED",
  }).lean();

  const { realized, wins, losses, turnover } = realizedFromOrders(orders);

  // Unrealized P&L on current open positions using live LTP
  const positions = await Position.find({}, { symbol: 1, type: 1, qty: 1, avgPrice: 1 }).lean();
  let unrealized = 0;
  let exposure = 0;

  for (const p of positions) {
    const ltp = ltpOf(p.symbol) || p.avgPrice || 0;
    const absQty = Math.abs(Number(p.qty || 0));
    exposure += absQty * ltp;

    if (p.type === "LONG") {
      unrealized += (ltp - p.avgPrice) * absQty;
    } else {
      unrealized += (p.avgPrice - ltp) * absQty;
    }
  }

  const net = Number((realized + unrealized).toFixed(2));
  const trades = orders.length;
  const closedTrades = wins + losses;
  const winRate = closedTrades ? Number(((wins / closedTrades) * 100).toFixed(1)) : 0;

  // % basis preference: live exposure → today turnover → budget fallback
  const budget = Number(config.capitalPerTrade || 0) * Number(config.maxPositions || 0);
  const basisValue = exposure > 0 ? exposure : (turnover > 0 ? turnover : (budget || 1));
  const percent = Number(((net / basisValue) * 100).toFixed(2));

  return {
    // For UI
    net,
    trades,
    wins,
    losses,
    winRate,

    // Extra diagnostics
    realized,
    unrealized: Number(unrealized.toFixed(2)),
    exposure: Number(exposure.toFixed(2)),
    turnover,
    percent,
    basis: exposure > 0 ? "exposure" : (turnover > 0 ? "turnover" : "budget"),
    basisValue: Number(basisValue.toFixed(2)),
    dayKeyIST: todayKeyIST(nowIST())
  };
}

/* -------------------------------------------------------------------------- */
/*                        Yesterday realized P&L (IST)                         */
/* -------------------------------------------------------------------------- */
/** Realized P&L for an IST day using FILLED orders only (netting logic). */
async function computeNetForDayIST(refDate = nowIST()) {
  const { startUTC, endUTC } = istDayRangeUTC(refDate);

  const orders = await Order.find({
    status: "FILLED",
    createdAt: { $gte: startUTC, $lt: endUTC },
  })
    .sort({ createdAt: 1 })
    .lean();

  const { realized } = realizedFromOrders(orders);
  return realized; // number
}

/* -------------------------------------------------------------------------- */
/*                                   Routes                                   */
/* -------------------------------------------------------------------------- */

reportsRouter.get("/today", async (_req, res) => {
  try {
    const r = await computeTodayReport();

    // Compute yesterday's realized P&L (IST) and DoD % change
    const yesterdayNet = await computeNetForDayIST(shiftISTDays(nowIST(), -1));
    let changeVsYesterdayPct = null;
    if (Number.isFinite(yesterdayNet) && yesterdayNet !== 0) {
      changeVsYesterdayPct = ((Number(r.net || 0) - yesterdayNet) / Math.abs(yesterdayNet)) * 100;
      changeVsYesterdayPct = Number(changeVsYesterdayPct.toFixed(2));
    }

    res.json({
      ...r,
      yesterdayNet,
      changeVsYesterdayPct,
    });
  } catch (e) {
    console.error("[reports/today]", e);
    res.status(500).json({ error: "Failed to compute today's report" });
  }
});

reportsRouter.get("/today/download", async (_req, res) => {
  try {
    const r = await computeTodayReport();

    // Append yesterday + DoD% to CSV too
    const yesterdayNet = await computeNetForDayIST(shiftISTDays(nowIST(), -1));
    let changeVsYesterdayPct = null;
    if (Number.isFinite(yesterdayNet) && yesterdayNet !== 0) {
      changeVsYesterdayPct = ((Number(r.net || 0) - yesterdayNet) / Math.abs(yesterdayNet)) * 100;
      changeVsYesterdayPct = Number(changeVsYesterdayPct.toFixed(2));
    }

    const rows = [
      ["field","value"],
      ["dayKeyIST", r.dayKeyIST],
      ["net", r.net],
      ["percent", `${r.percent}% (basis=${r.basis}, value=${r.basisValue})`],
      ["realized", r.realized],
      ["unrealized", r.unrealized],
      ["trades", r.trades],
      ["wins", r.wins],
      ["losses", r.losses],
      ["winRate", `${r.winRate}%`],
      ["exposure", r.exposure],
      ["turnover", r.turnover],
      ["yesterdayNet", yesterdayNet],
      ["changeVsYesterdayPct", changeVsYesterdayPct ?? ""],
    ];

    const csv = rows.map(a => a.join(",")).join("\n");
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="today_report_${r.dayKeyIST}.csv"`);
    res.send(csv);
  } catch (e) {
    console.error("[reports/today/download]", e);
    res.status(500).json({ error: "Failed to download today's report" });
  }
});
