// Server/src/services/marketHub.js
// Central hub for live market data. Normalizes various providers -> rows[] and emits updates.

import EventEmitter from "eventemitter3";
import { config } from "../config.js";
import { getFeed } from "../adapters/market/index.js";
import { calcMACD, calcRSI } from "../utils/tech.js";
export const marketHub = new EventEmitter();

// In-memory history per symbol for indicators
const history = new Map(); // symbol -> number[]
export const marketBus = new EventEmitter();

function seedIfMissing(symbols) {
  symbols.forEach((s) => {
    if (!history.has(s)) {
      const base = 1000 + Math.floor(Math.random() * 1500);
      const arr = Array.from({ length: 60 }, (_, i) => base + i * 0.5);
      history.set(s, arr);
    }
  });
}

export function ltpOf(symbol) {
  const arr = history.get(symbol) || [];
  return arr.length ? arr[arr.length - 1] : 0;
}

export function getSnapshotRows() {
  const rows = [];
  for (const sym of config.symbols) {
    const arr = history.get(sym) || [];
    const ltp = arr.at(-1) ?? 0;
    const prev = arr.at(-2) ?? ltp;
    const change = prev ? ((ltp - prev) / prev) * 100 : 0;
    const rsi = Math.round(calcRSI(arr));
    const macdObj = calcMACD(arr);
    const signal =
      rsi < 30 ? "BUY" :
      rsi > 70 ? "SELL" :
      Math.sign(macdObj.hist) > 0 ? "BUY" :
      Math.sign(macdObj.hist) < 0 ? "SELL" :
      "HOLD";
    rows.push({
      symbol: sym,
      ltp: Number(ltp.toFixed(2)),
      change,
      rsi,
      macd: Number(macdObj.macd.toFixed(2)),
      signal
    });
  }
  return rows;
}

/**
 * Start market feed (mock or real) and keep history updated.
 * Emits 'tick' events with latest rows, throttled by config.market.streamPushMs.
 */
export function startMarketFeed() {
  seedIfMissing(config.symbols);

  const feed = getFeed(config.market.provider);
  feed.subscribe(config.symbols, (tick) => {
    // tick: { symbol, ltp }
    const arr = history.get(tick.symbol) || [];
    arr.push(Number(tick.ltp));
    if (arr.length > 400) arr.shift();
    history.set(tick.symbol, arr);
  });

  // Throttled broadcast
  let lastPush = 0;
  const pushInterval = setInterval(() => {
    const now = Date.now();
    if (now - lastPush < config.market.streamPushMs) return;
    lastPush = now;
    marketBus.emit("snapshot", getSnapshotRows());
  }, Math.max(300, config.market.streamPushMs));

  // Allow runtime symbol updates without restart
  marketBus.on("symbols:update", (symbols) => {
    feed.resubscribe(symbols);
    seedIfMissing(symbols);
  });

  return () => {
    clearInterval(pushInterval);
    feed.close?.();
  };
}
// Helper: broadcast each new tick to listeners (e.g., SSE/WebSockets later)
export function publishSnapshot(rows) {
  marketHub.emit("snapshot", rows);
}