import { config } from "../config.js";
import { getSnapshotRows } from "./marketDataService.js";
import { placeOrder, markToMarket } from "./brokerService.js";
import { Position } from "../models/Position.js";

// Simple strategy:
// - Buy when RSI < 30 and we have capacity
// - Sell when RSI > 70 and we hold a long
// - Basic SL/TP check on every tick
export async function algoStep() {
  const rows = getSnapshotRows();
  await markToMarket();

  const positions = await Position.find({});
  const bySymbol = new Map(positions.map(p => [p.symbol, p]));

  // Risk controls
  const canOpenMore = positions.length < config.maxPositions;

  for (const r of rows) {
    const pos = bySymbol.get(r.symbol);
    const price = r.ltp;

    // SL/TP enforcement for open positions
    if (pos) {
      const changePct =
        pos.type === "LONG"
          ? ((price - pos.avgPrice) / pos.avgPrice) * 100
          : ((pos.avgPrice - price) / pos.avgPrice) * 100;

      if (changePct <= -config.stopLossPct) {
        // stop loss
        await placeOrder({
          symbol: r.symbol,
          side: pos.type === "LONG" ? "SELL" : "BUY",
          qty: pos.qty
        });
        continue;
      }

      if (changePct >= config.targetPct) {
        // take profit
        await placeOrder({
          symbol: r.symbol,
          side: pos.type === "LONG" ? "SELL" : "BUY",
          qty: pos.qty
        });
        continue;
      }
    }

    // Entry signals
    if (!pos && canOpenMore && r.rsi < 30 && r.signal === "BUY") {
      const qty = Math.max(1, Math.floor(config.capitalPerTrade / price));
      await placeOrder({ symbol: r.symbol, side: "BUY", qty });
    }

    if (pos && pos.type === "LONG" && r.rsi > 70 && r.signal === "SELL") {
      await placeOrder({ symbol: r.symbol, side: "SELL", qty: pos.qty });
    }
  }
}
