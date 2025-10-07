// Server/src/services/strategyService.js
// Deterministic, event-driven strategy:
// - Maintains per-symbol rolling windows from market ticks
// - Computes features (RSI/MACD if lib present; else safe fallbacks)
// - Generates signals with cooldown & throttling
// - Enforces a soft cap on simultaneous positions (optional/app-config)
// - Queues orders via orderService (risk & OMS handle downstream)

import { marketBus } from "./marketHub.js";
import { queueOrder } from "./orderService.js";

// Optional dependencies (kept soft to avoid runtime breakage)
let tech = null;
try {
  tech = await import("../lib/technicals.js").then(m => m).catch(() => null);
} catch { /* noop */ }

let util = null;
try {
  util = await import("../lib/util.js").then(m => m).catch(() => null);
} catch { /* noop */ }

// Optional config & Position model for max-open control
let config = { maxPositions: Number(process.env.MAX_POSITIONS || 5) };
try {
  const cfg = await import("../config.js").then(m => m.config).catch(() => null);
  if (cfg?.maxPositions) config.maxPositions = cfg.maxPositions;
} catch { /* noop */ }

let Position = null;
try {
  Position = (await import("../models/Position.js")).Position;
} catch { /* noop: if model missing we skip max-open check */ }

// ----------------------- Tunables -----------------------
const COOLDOWN_MS = 30_000;  // per-symbol cooldown after firing
const WINDOW = 200;          // rolling window size for features
const USER_ID = "default";   // adapt if multi-user in memory

// ----------------------- State --------------------------
/**
 * state[symbol] = {
 *   prices: number[],
 *   lastPrice: number,
 *   lastSignalAt: number,
 *   lastMacdSign: number | null
 * }
 */
const state = new Map();

// cache of open positions count refreshed on interval (avoid DB per-tick)
let cachedOpenCount = 0;
let lastOpenRefreshAt = 0;
const OPEN_REFRESH_MS = 2000;

// ----------------------- Helpers ------------------------
function getOrInit(sym) {
  if (!state.has(sym)) state.set(sym, { prices: [], lastPrice: undefined, lastSignalAt: 0, lastMacdSign: null });
  return state.get(sym);
}

function pushPrice(arr, px) {
  arr.push(px);
  if (arr.length > WINDOW) arr.shift();
}

async function getOpenCount() {
  const now = Date.now();
  if (!Position) return 0; // if model not available, treat as 0
  if (now - lastOpenRefreshAt < OPEN_REFRESH_MS) return cachedOpenCount;
  lastOpenRefreshAt = now;
  try {
    cachedOpenCount = await Position.countDocuments({ qty: { $gt: 0 } });
  } catch {
    cachedOpenCount = 0;
  }
  return cachedOpenCount;
}

function computeFeatures(prices) {
  const close = prices;
  const features = { len: close.length };

  if (tech?.rsi) {
    // typical 14-period RSI
    try { features.rsi = tech.rsi(close, 14); } catch { /* noop */ }
  }
  if (tech?.macd) {
    // typical MACD (12,26,9)
    try {
      const m = tech.macd(close, 12, 26, 9); // expect { macd, signal, hist }
      features.macd = m?.macd;
      features.macdSignal = m?.signal;
      features.macdHist = m?.hist;
    } catch { /* noop */ }
  }

  // Fallbacks if technicals lib is absent
  if (features.rsi == null && close.length >= 15) {
    // crude momentum proxy: RSI ~ 50 + slope * K (very rough); keep deterministic
    const last = close.at(-1);
    const prev = close.at(-15);
    const slope = (last - prev) / Math.max(1e-6, Math.abs(prev));
    features.rsi = Math.max(0, Math.min(100, 50 + slope * 5000));
  }
  if (features.macdHist == null && close.length >= 30) {
    const fast = sma(close, 12);
    const slow = sma(close, 26);
    const macd = fast - slow;
    const signal = emaSeq(close, 9).at(-1) ?? 0; // very rough proxy
    features.macdHist = macd - signal;
  }

  return features;
}

function sma(arr, n) {
  if (arr.length < n) return arr.at(-1) ?? 0;
  let sum = 0;
  for (let i = arr.length - n; i < arr.length; i++) sum += arr[i];
  return sum / n;
}

function emaSeq(arr, n) {
  if (!arr.length) return [];
  const k = 2 / (n + 1);
  const out = [arr[0]];
  for (let i = 1; i < arr.length; i++) out.push(arr[i] * k + out[i - 1] * (1 - k));
  return out;
}

/**
 * Decide: pure function on features only.
 * Returns { action: "BUY" | "SELL", qty: number } | null
 */
function decidePure(features) {
  if (features.len < 30) return null;

  // RSI gates
  const buyRSI = features.rsi != null && features.rsi < 30;
  const sellRSI = features.rsi != null && features.rsi > 70;

  // MACD histogram cross (sign change)
  let macdUp = null;
  if (features.macdHist != null) macdUp = features.macdHist > 0;

  // Combine: conservative – require RSI gate + MACD hist direction if available
  if (buyRSI && (macdUp === null || macdUp === true)) return { action: "BUY", qty: 1 };
  if (sellRSI && (macdUp === null || macdUp === false)) return { action: "SELL", qty: 1 };
  return null;
}

/**
 * Gate: cooldown + max open positions
 */
async function shouldFire(sym) {
  const s = state.get(sym);
  const now = Date.now();
  if (s && now - (s.lastSignalAt || 0) < COOLDOWN_MS) return false;

  const open = await getOpenCount();
  if (open >= Number(config.maxPositions || 0)) return false;

  return true;
}

function signalToOrder(symbol, sig) {
  return {
    symbol,
    side: sig.action,
    qty: sig.qty,
    type: "MARKET"
  };
}

// ------------------ Tick Handler (deterministic + throttled) ------------------
async function onTick(t) {
  const symbol = String(t.symbol);
  const price = Number(t.ltp);
  if (!Number.isFinite(price)) return;

  const s = getOrInit(symbol);
  s.lastPrice = price;
  pushPrice(s.prices, price);

  const features = computeFeatures(s.prices);
  const sig = decidePure(features);
  if (!sig) return;

  if (!(await shouldFire(symbol))) return;

  // Fire
  try {
    await queueOrder(USER_ID, signalToOrder(symbol, sig));
    s.lastSignalAt = Date.now();
  } catch (e) {
    // swallow to keep loop alive; upstream logging/alerts can capture
  }
  state.set(symbol, s);
}

// Throttle to avoid CPU spikes (20Hz)
const throttledOnTick = util?.throttle ? util.throttle(onTick, 50) : onTick;
marketBus.on("tick", throttledOnTick);

// ------------------ Optional API for tests/ops ------------------
export function resetStrategyState() {
  state.clear();
  cachedOpenCount = 0;
  lastOpenRefreshAt = 0;
}
export function setCooldownMs(ms) {
  // convenience in tests
  // eslint-disable-next-line no-constant-condition
  if (ms && typeof ms === "number") (COOLDOWN_MS = Math.max(0, ms)); // note: if using bundlers this may be const; keep function for API parity
}
