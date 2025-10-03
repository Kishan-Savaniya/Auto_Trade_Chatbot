// src/services/riskService.js
import { Order } from "../models/Order.js";
import { Position } from "../models/Position.js";
import { Settings } from "../models/Settings.js";
import { todayKeyIST } from "../utils/istTime.js";
import { setEngineRunning } from "./engineLoop.js";
import { closeAllPositions, markToMarket } from "./brokerService.js";

function cashflowPnL(orders) {
  const by = new Map();
  for (const o of orders) {
    const v = by.get(o.symbol) || { buy: 0, sell: 0 };
    if (o.side === "BUY") v.buy += (o.price || 0) * (o.qty || 0);
    else v.sell += (o.price || 0) * (o.qty || 0);
    by.set(o.symbol, v);
  }
  let realized = 0;
  for (const v of by.values()) realized += (v.sell - v.buy);
  return Number(realized.toFixed(2));
}

function capitalInUseFromPositions(positions) {
  // Simple notion: market value exposure (qty * ltp)
  let cap = 0;
  for (const p of positions) {
    cap += (p.qty || 0) * (p.ltp || p.avgPrice || 0);
  }
  return Math.max(0, Math.round(cap));
}

export async function riskSnapshot() {
  const s = await Settings.findOne({}) || await Settings.create({});
  const { dailyLossLimit = 5000, maxCapitalUsage = 50000 } = s.risk || {};

  const dayKey = todayKeyIST();
  const start = new Date(`${dayKey}T00:00:00.000Z`);
  const end   = new Date(`${dayKey}T23:59:59.999Z`);

  // realized PnL from today's orders
  const orders = await Order.find({ createdAt: { $gte: start, $lte: end } });
  const net = cashflowPnL(orders);

  // unrealized ignored for limit stop; but keep positions fresh for UI
  await markToMarket();
  const positions = await Position.find({});
  const capitalInUse = capitalInUseFromPositions(positions);

  return {
    dayKey, net, capitalInUse,
    limits: { dailyLossLimit, maxCapitalUsage }
  };
}

export async function ensureRiskLimits() {
  const snap = await riskSnapshot();
  const breachDailyLoss = snap.net <= -Math.abs(snap.limits.dailyLossLimit);
  const breachCapital   = snap.capitalInUse > Math.abs(snap.limits.maxCapitalUsage);

  if (breachDailyLoss || breachCapital) {
    const reason = breachDailyLoss ? "DAILY_LOSS_LIMIT" : "CAP_USAGE_LIMIT";
    console.warn(`[RISK] Stopping engine :: reason=${reason} net=${snap.net} cap=${snap.capitalInUse} limits=${JSON.stringify(snap.limits)}`);
    await setEngineRunning(false);
    await closeAllPositions(reason);
    return { stopped: true, reason, snapshot: snap };
  }
  return { stopped: false, snapshot: snap };
}
