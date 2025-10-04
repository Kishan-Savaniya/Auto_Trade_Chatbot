// Server/src/services/marketHub.js
// Central hub for live market data. Normalizes various providers -> rows[] and emits updates.

import EventEmitter from "eventemitter3";
import { config } from "../config.js";
import { getFeed } from "../adapters/market/index.js";
import { calcMACD, calcRSI } from "../utils/tech.js";

export const marketHub = new EventEmitter(); // legacy bus (kept for compatibility)
export const marketBus = new EventEmitter();  // primary bus for snapshots

// In-memory history per symbol for indicators (close prices)
const history = new Map(); // symbol -> number[]

// ---- helpers ---------------------------------------------------------------

const STREAM_MS = Number(config?.market?.streamPushMs ?? 1000);
const PROVIDER   = String(config?.market?.provider ?? "mock");

function seedIfMissing(symbols) {
  symbols.forEach((s) => {
    if (!history.has(s)) {
      const base = 1000 + Math.floor(Math.random() * 1500);
      const arr = Array.from({ length: 60 }, (_, i) => base + i * 0.5);
      history.set(s, arr);
    }
  });
}

function safeNum(n, fallback = 0) {
  const v = Number(n);
  return Number.isFinite(v) ? v : fallback;
}

export function ltpOf(symbol) {
  const arr = history.get(symbol) || [];
  return arr.length ? arr[arr.length - 1] : 0;
}

export function getSnapshotRows() {
  const rows = [];
  for (const sym of config.symbols) {
    const arr = history.get(sym) || [];
    const ltp = arr.length ? arr[arr.length - 1] : 0;
    const prev = arr.length > 1 ? arr[arr.length - 2] : ltp;
    const change = prev ? ((ltp - prev) / prev) * 100 : 0;

    // Indicators tolerate short arrays
    const closes = arr.length ? arr : [ltp, ltp, ltp];
    const rsi = Math.round(calcRSI(closes));
    const macdObj = calcMACD(closes);

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
 * Public: broadcast a snapshot immediately (keeps both buses for compatibility)
 */
export function publishSnapshot(rows) {
  marketBus.emit("snapshot", rows);
  marketHub.emit("snapshot", rows); // legacy listeners
}

/**
 * Public: update runtime watchlist symbols (keeps config + notifies feed)
 */
export function applySymbols(symbols) {
  const uniq = Array.from(new Set((symbols || []).map(s => String(s).trim()).filter(Boolean)));
  if (!uniq.length) return;

  // update runtime config + seed history
  config.symbols = uniq;
  seedIfMissing(uniq);

  // notify active feed (resubscribe)
  marketBus.emit("symbols:update", uniq);
}

/**
 * Fallback tick generator (mock) if feed is unavailable or disconnected.
 * Keeps the UI alive in dev.
 */
function tickSim(symbols) {
  for (const s of symbols) {
    const arr = history.get(s) || [];
    const prev = arr.length ? arr[arr.length - 1] : 1000;
    // random walk
    const drift = (Math.random() - 0.5) * 4;
    const next = Math.max(1, prev + drift);
    arr.push(Number(next.toFixed(2)));
    if (arr.length > 400) arr.shift();
    history.set(s, arr);
  }
}

/**
 * Start market feed (mock or real) and keep history updated.
 * Emits 'snapshot' events with latest rows, throttled by config.market.streamPushMs.
 */
export function startMarketFeed() {
  const symbols = Array.isArray(config.symbols) ? config.symbols : [];
  seedIfMissing(symbols);

  let feed;
  let usingSim = false;

  // 1) try to start real provider
  try {
    feed = getFeed(PROVIDER);
  } catch (e) {
    console.warn(`[marketHub] getFeed("${PROVIDER}") failed -> using simulator.`, e?.message || e);
    usingSim = true;
  }

  // 2) subscribe to live ticks or simulate
  let simTimer = null;

  if (feed?.subscribe) {
    // subscribe & update history on each tick
    feed.subscribe(symbols, (tick) => {
      // tick = { symbol, ltp }
      const sym = String(tick?.symbol || "");
      if (!sym) return;
      const ltp = safeNum(tick?.ltp, null);
      if (!Number.isFinite(ltp)) return;

      const arr = history.get(sym) || [];
      arr.push(ltp);
      if (arr.length > 400) arr.shift();
      history.set(sym, arr);
    });
  } else {
    usingSim = true;
  }

  if (usingSim) {
    simTimer = setInterval(() => tickSim(config.symbols), 1000);
  }

  // 3) Throttled broadcast
  let lastPush = 0;
  const pushInterval = setInterval(() => {
    const now = Date.now();
    if (now - lastPush < STREAM_MS) return;
    lastPush = now;
    publishSnapshot(getSnapshotRows());
  }, Math.max(300, STREAM_MS));

  // 4) runtime symbol updates without restart
  marketBus.on("symbols:update", (newSymbols) => {
    try {
      // switch feed subscriptions if feed supports it
      if (feed?.resubscribe) feed.resubscribe(newSymbols);
      // for sim, nothing special; seed ensures arrays exist
      seedIfMissing(newSymbols);
    } catch (e) {
      console.error("[marketHub] resubscribe failed:", e?.message || e);
    }
  });

  // 5) cleanup function
  return () => {
    clearInterval(pushInterval);
    if (simTimer) clearInterval(simTimer);
    try { feed?.close?.(); } catch {}
  };
}
