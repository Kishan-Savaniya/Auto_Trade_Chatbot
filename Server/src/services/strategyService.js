// Server/src/services/strategyService.js
import { marketBus } from "./marketHub.js";
import { queueOrder } from "./orderService.js";
import { rsi, macd } from "../lib/technicals.js";

const COOLDOWN_MS = 30_000; // per-symbol
const WINDOW = 200;
const state = new Map(); // symbol -> { prices: [], lastSignalAt: 0 }

function pushPrice(s, px) {
  s.prices.push(px);
  if (s.prices.length > WINDOW) s.prices.shift();
}

function computeFeatures(s) {
  const prices = s.prices;
  if (prices.length < 34) return null;
  const _rsi = rsi(prices, 14);
  const _macd = macd(prices, 12, 26, 9); // returns {macd, signal, hist}
  return { rsi: _rsi, macdHist: _macd?.hist ?? 0 };
}

function decide(features) {
  if (!features) return null;
  const macdUp = features.macdHist > 0 ? true : features.macdHist < 0 ? false : null;
  if (features.rsi < 30 && (macdUp === null || macdUp === true)) return { side: "BUY", qty: 1 };
  if (features.rsi > 70 && (macdUp === null || macdUp === false)) return { side: "SELL", qty: 1 };
  return null;
}

marketBus.on("tick", async (t) => {
  const s = state.get(t.symbol) || { prices: [], lastSignalAt: 0 };
  pushPrice(s, Number(t.ltp || 0));
  const f = computeFeatures(s);
  const sig = decide(f);
  const now = Date.now();

  if (sig && now - s.lastSignalAt >= COOLDOWN_MS) {
    s.lastSignalAt = now;
    try {
      await queueOrder("default", { symbol: t.symbol, side: sig.side, qty: sig.qty, type: "MARKET" });
    } catch (e) {
      // swallow, risk or OMS rejections are normal sometimes
    }
  }
  state.set(t.symbol, s);
});
