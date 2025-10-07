// Server/src/services/strategyService.js
import { getSnapshotRows } from "./marketDataService.js";
import { placeOrder } from "./brokerService.js";
import { Position } from "../models/Position.js";
import { config } from "../config.js";
import { marketBus } from "./marketHub.js";
import { queueOrder } from "./orderService.js";
import { rsi, macd } from "../lib/technicals.js";
import { throttle } from "../lib/util.js";

const lastActionAt = new Map(); // symbol -> ms timestamp
const COOLDOWN_MS = 30_000;     // avoid spamming trades

export async function decideAndTrade() {
  const rows = getSnapshotRows();
  const openCount = await Position.countDocuments();

  for (const r of rows) {
    const now = Date.now();
    const last = lastActionAt.get(r.symbol) || 0;
    if (now - last < COOLDOWN_MS) continue;

    // Respect max open positions
    const currentOpen = await Position.countDocuments();
    if (currentOpen >= config.maxPositions) break;

    // Simple rules from your snapshot:
    if (r.rsi < 30 && r.signal === "BUY") {
      await placeOrder({ symbol: r.symbol, side: "BUY", qty: 1 });
      lastActionAt.set(r.symbol, now);
    } else if (r.rsi > 70 && r.signal === "SELL") {
      await placeOrder({ symbol: r.symbol, side: "SELL", qty: 1 });
      lastActionAt.set(r.symbol, now);
    }
  }
}

const state = new Map(); // symbol -> rolling window/features

function onTick(t) {
  const s = (state.get(t.symbol) || initState());
  updateWindows(s, t.ltp);
  const features = computeFeatures(s);
  const signal = decide(features); // pure & versioned
  if (shouldFire(signal, s)) {
    queueOrder(signalToOrder(signal));
    s.lastSignalAt = Date.now();
  }
  state.set(t.symbol, s);
}

marketBus.on("tick", throttle(onTick, 50)); // throttle to 20 Hz
