// Server/src/routes/reports.js (inside reportsRouter)

// ...imports you already have...
import { nowIST, todayKeyIST, istDayRangeUTC, shiftISTDays } from "../utils/istTime.js";

// helper: realized P&L for an IST day based on FILLED orders (you already have a variant)
async function computeNetForDayIST(refDate = nowIST()) {
  const { startUTC, endUTC } = istDayRangeUTC(refDate);
  const orders = await Order.find({
    status: "FILLED",
    createdAt: { $gte: startUTC, $lt: endUTC },
  }).sort({ createdAt: 1 }).lean();

  const pos = new Map(); // sym -> { side, qty, avg }
  let realized = 0;

  for (const o of orders) {
    const side = o.side === "BUY" ? "LONG" : "SHORT";
    const qty = Number(o.qty || 0);
    const price = Number(o.price || 0);
    if (!qty || !Number.isFinite(price)) continue;

    if (!pos.has(o.symbol)) pos.set(o.symbol, { side: null, qty: 0, avg: 0 });
    const p = pos.get(o.symbol);

    // open
    if (!p.side) { p.side = side; p.qty = qty; p.avg = price; continue; }

    // same side -> average
    if (p.side === side) {
      const total = p.avg * p.qty + price * qty;
      p.qty += qty; p.avg = total / p.qty; continue;
    }

    // opposite -> close
    let remaining = qty;
    while (remaining > 0 && p.qty > 0) {
      const closeQty = Math.min(p.qty, remaining);
      realized += p.side === "LONG" ? closeQty * (price - p.avg) : closeQty * (p.avg - price);
      p.qty -= closeQty; remaining -= closeQty;
      if (p.qty === 0) p.side = null;
    }
    // flip leftover
    if (remaining > 0) { p.side = side; p.qty = remaining; p.avg = price; }
  }
  return Number(realized.toFixed(2));
}

reportsRouter.get("/today", async (_req, res) => {
  try {
    // Your existing full today report (includes net, percent, trades, wins, losses, basisValue)
    const today = await (await import("./reports-core.js")).computeTodayReport?.() 
               || await computeTodayReport(); // fall back to your local implementation

    // Yesterday figures
    const yDate = shiftISTDays(nowIST(), -1);
    const yesterdayNet = await computeNetForDayIST(yDate);

    // % calc for both (same denominator rule used for today.percent)
    const denom = Number(today?.basisValue || 0) || Math.max(Math.abs(yesterdayNet), 1);
    const todayPct = Number.isFinite(Number(today?.percent)) ? Number(today.percent) : Number(((today.net / denom) * 100).toFixed(2));
    const yesterdayPct = Number(((yesterdayNet / denom) * 100).toFixed(2));

    res.json({
      ...today,
      todayNet: Number(today.net || 0),
      todayPercent: todayPct,
      yesterdayNet,
      yesterdayPercent: yesterdayPct,
      dayKeyIST: todayKeyIST(nowIST()),
    });
  } catch (e) {
    console.error("[reports/today]", e);
    res.status(500).json({ error: "Failed to compute today's report" });
  }
});
