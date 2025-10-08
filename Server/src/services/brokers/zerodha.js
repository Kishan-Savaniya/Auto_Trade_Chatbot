// Server/src/services/brokers/zerodha.js
// Zerodha adapter: loginUrl -> handleCallback (request_token->access_token),
// isAuthenticated, WebSocket connect for live ticks, basic orders/positions.
// Uses in-memory access token (simple & non-intrusive). Persist later if needed.

import fs from "fs";
import path from "path";
import { BrokerAdapter } from "./AdapterBase.js";


// ---- Lazy-load sdk to avoid hard dependency errors at boot ----
let KiteConnect = null;
let KiteTicker = null;
try {
  const mod = await import("kiteconnect").catch(() => null);
  if (mod) {
    KiteConnect = mod.KiteConnect || mod.default?.KiteConnect || null;
    KiteTicker  = mod.KiteTicker  || mod.default?.KiteTicker  || null;
  }
} catch {
  // keep nulls; functions below will guard and throw helpful errors when used
}

const API_KEY    = process.env.KITE_API_KEY;
const API_SECRET = process.env.KITE_API_SECRET;

// In-memory store (per-process). Replace with DB model later.
const mem = {
  accessTokenByUser: new Map(), // userId -> accessToken
  map: null,                    // symbol -> { token, exchange }
  reverse: null,                // token  -> symbol
};

function ensureApiKey() {
  if (!API_KEY) throw new Error("KITE_API_KEY missing");
}
function ensureSdk() {
  if (!KiteConnect || !KiteTicker) {
    throw new Error("kiteconnect sdk not installed. Run: npm i kiteconnect");
  }
}

function loadInstrumentMap() {
  if (mem.map) return;
  try {
    const p = path.join(process.cwd(), "data", "kite-map.json");
    if (fs.existsSync(p)) {
      mem.map = JSON.parse(fs.readFileSync(p, "utf8"));
      mem.reverse = {};
      for (const [sym, v] of Object.entries(mem.map)) mem.reverse[v.token] = sym;
    } else {
      mem.map = {};
      mem.reverse = {};
    }
  } catch (e) {
    console.warn("[zerodha] failed to load instrument map:", e?.message || e);
    mem.map = {};
    mem.reverse = {};
  }
}

function lookup(symbol) {
  loadInstrumentMap();
  return mem.map[symbol] || null;
}
function symbolFromToken(token) {
  loadInstrumentMap();
  return mem.reverse[token] || null;
}

export async function loginUrl(userId = "default") {
  ensureApiKey();
  // If SDK is present, prefer its URL; else build manually.
  if (KiteConnect) {
    const kc = new KiteConnect({ api_key: API_KEY });
    const url = kc.getLoginURL();
    const sep = url.includes("?") ? "&" : "?";
    return `${url}${sep}state=${encodeURIComponent(userId)}`;
  }
  // Fallback (works fine without SDK)
  const base = `https://kite.trade/connect/login?api_key=${encodeURIComponent(API_KEY)}&v=3`;
  const sep = base.includes("?") ? "&" : "?";
  return `${base}${sep}state=${encodeURIComponent(userId)}`;
}

export async function handleCallback(userId = "default", query = {}) {
  ensureApiKey();
  if (!API_SECRET) throw new Error("KITE_API_SECRET missing");
  if (!query?.request_token) throw new Error("request_token missing in callback");
  ensureSdk();

  const kc = new KiteConnect({ api_key: API_KEY });
  const sess = await kc.generateSession(query.request_token, API_SECRET);
  if (!sess?.access_token) throw new Error("Failed to exchange request_token");
  mem.accessTokenByUser.set(userId, sess.access_token);
  return { ok: true, userId };
}

export async function isAuthenticated(userId = "default") {
  return Boolean(mem.accessTokenByUser.get(userId));
}

/**
 * Connect market WebSocket and stream normalized ticks.
 * instruments: array of symbols *or* instrument tokens (numbers/strings).
 * We will auto-map symbols -> tokens if the map is present.
 */
export function connectMarketWS({ userId = "default", instruments = [], onTick, onStatus }) {
  try {
    ensureApiKey();
    if (!KiteTicker) throw new Error("kiteconnect sdk not installed (ws). Run: npm i kiteconnect");

    const accessToken = mem.accessTokenByUser.get(userId);
    if (!accessToken) throw new Error("Not authenticated with Zerodha");

    const ticker = new KiteTicker({ api_key: API_KEY, access_token: accessToken });
    const subs = resolveTokens(instruments);

    ticker.autoReconnect(true, 10, 5);
    ticker.on("connect", () => {
      try {
        if (subs.length) {
          ticker.subscribe(subs);
          ticker.setMode(ticker.modeLTP, subs);
        }
        onStatus?.("connected");
      } catch (e) {
        onStatus?.("error", e);
      }
    });

    ticker.on("ticks", (ticks = []) => {
      for (const t of ticks) {
        const symbol = symbolFromToken(t.instrument_token) || String(t.instrument_token);
        const tick = {
          symbol,
          ltp: t.last_price,
          bid: Array.isArray(t.depth?.buy) && t.depth.buy[0]?.price || undefined,
          ask: Array.isArray(t.depth?.sell) && t.depth.sell[0]?.price || undefined,
          ts: Date.now(),
        };
        onTick?.(tick);
      }
    });

    ticker.on("error", (e) => onStatus?.("error", e));
    ticker.on("disconnect", (r) => onStatus?.("disconnected", r));
    ticker.connect();

    return () => { try { ticker.disconnect(); } catch {} };
  } catch (e) {
    onStatus?.("error", e);
    return () => {};
  }
}

function resolveTokens(arr) {
  loadInstrumentMap();
  const tokens = [];
  for (const it of arr) {
    if (Number.isFinite(it) || /^\d+$/.test(String(it))) {
      tokens.push(Number(it));
    } else {
      const meta = lookup(String(it));
      if (meta?.token) tokens.push(meta.token);
    }
  }
  return tokens;
}

/* ---------- optional order/positions minimal helpers (no breaking deps) ---------- */

export async function placeOrder(userId, { symbol, side, qty, product = "MIS", priceType = "MARKET", limitPrice }) {
  ensureApiKey();
  if (!KiteConnect) throw new Error("kiteconnect sdk not installed. Run: npm i kiteconnect");

  const accessToken = mem.accessTokenByUser.get(userId);
  if (!accessToken) throw new Error("Not authenticated with Zerodha");

  const kc = new KiteConnect({ api_key: API_KEY });
  kc.setAccessToken(accessToken);

  const meta = lookup(symbol);
  if (!meta) throw new Error(`Unknown symbol: ${symbol} (instrument map missing)`);

  const tx = side === "BUY" ? "BUY" : "SELL";
  const order = await kc.placeOrder("regular", {
    exchange: meta.exchange || "NSE",
    tradingsymbol: symbol,
    transaction_type: tx,
    quantity: Number(qty),
    product,
    order_type: priceType, // MARKET / LIMIT
    price: priceType === "LIMIT" ? Number(limitPrice || 0) : 0,
    validity: "DAY",
  });
  return { brokerOrderId: order?.order_id || "" };
}

export async function getPositions(userId) {
  ensureApiKey();
  if (!KiteConnect) throw new Error("kiteconnect sdk not installed. Run: npm i kiteconnect");

  const accessToken = mem.accessTokenByUser.get(userId);
  if (!accessToken) throw new Error("Not authenticated with Zerodha");

  const kc = new KiteConnect({ api_key: API_KEY });
  kc.setAccessToken(accessToken);
  const r = await kc.getPositions();
  return (r?.net || []).map((p) => ({
    symbol: p.tradingsymbol,
    type: Number(p.quantity) > 0 ? "LONG" : Number(p.quantity) < 0 ? "SHORT" : "FLAT",
    qty: Math.abs(Number(p.quantity || 0)),
    avgPrice: Number(p.average_price || 0),
    ltp: Number(p.last_price || 0),
    pnl: Number(p.pnl || 0),
  }));
}

export async function getOrders(userId) {
  ensureApiKey();
  if (!KiteConnect) throw new Error("kiteconnect sdk not installed. Run: npm i kiteconnect");

  const accessToken = mem.accessTokenByUser.get(userId);
  if (!accessToken) throw new Error("Not authenticated with Zerodha");

  const kc = new KiteConnect({ api_key: API_KEY });
  kc.setAccessToken(accessToken);
  const list = await kc.getOrders();
  return (list || []).map((o) => ({
    brokerOrderId: o.order_id,
    symbol: o.tradingsymbol,
    side: o.transaction_type,
    qty: Number(o.quantity || 0),
    price: Number(o.average_price || o.price || 0),
    status: o.status,
    createdAt: new Date(o.order_timestamp || Date.now()),
  }));
}

export class ZerodhaAdapter extends BrokerAdapter {
  constructor(opts = {}) {
    super("zerodha");
    // (We could initialize API keys or other config here if needed; ensureApiKey() will run on usage)
  }
  async init() {
    // Optionally perform any setup; for now, no special init needed (could check API connectivity).
    return true;
  }
  async loginUrl(userId = "default") {
    return loginUrl(userId);  // call the module's exported function
  }
  async handleCallback(userId = "default", query = {}) {
    return handleCallback(userId, query);
  }
  async isAuthenticated(userId = "default") {
    return isAuthenticated(userId);
  }
  async placeOrder(userId, order) {
    return placeOrder(userId, order);
  }
  async getPositions(userId) {
    return getPositions(userId);
  }
  async getOrders(userId) {
    return getOrders(userId);
  }
  // (Additional methods from Zerodha’s API can be added as needed)
}
