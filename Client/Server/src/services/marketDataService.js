// Server/src/services/marketDataService.js
import { config } from "../config.js";
import { calcMACD, calcRSI } from "../utils/tech.js";

// In-memory simulated price history per symbol
const history = new Map(); // symbol -> [prices]

function seedIfNeeded() {
  for (const s of config.symbols) {
    if (!history.has(s)) {
      const base = 1000 + Math.floor(Math.random() * 1500);
      const arr = Array.from({ length: 60 }, (_, i) => base + i * 0.5);
      history.set(s, arr);
    }
  }
}
seedIfNeeded();

function nextTickPrice(prev) {
  const drift = (Math.random() - 0.5) * 6;     // random walk ~ ±3
  const revert = (1000 - prev) * 0.0005;       // slight mean reversion
  let next = prev + drift + revert;
  if (next < 50) next = 50;
  return Number(next.toFixed(2));
}

export function tickMarket() {
  for (const [sym, arr] of history.entries()) {
    const last = arr[arr.length - 1];
    arr.push(nextTickPrice(last));
    if (arr.length > 300) arr.shift();
  }
}

// Backward-compat alias if other files imported tickAll earlier
export const tickAll = tickMarket;

export function getSnapshotRows() {
  const rows = [];
  for (const sym of config.symbols) {
    const arr = history.get(sym) || [];
    const ltp = arr[arr.length - 1] || 0;
    const prev = arr[arr.length - 2] || ltp;
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

export function ltpOf(symbol) {
  const arr = history.get(symbol) || [];
  return arr[arr.length - 1] || 0;
}
