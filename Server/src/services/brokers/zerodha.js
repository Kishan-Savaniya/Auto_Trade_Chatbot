// Server/src/services/brokers/zerodha.js
// Zerodha adapter: loginUrl -> handleCallback (request_token->access_token),
// isAuthenticated, WebSocket connect for live ticks, basic orders/positions.
// Uses in-memory access token (simple & non-intrusive). Persist later if needed.

import EventEmitter from "events";
import { KiteConnect, KiteTicker } from "kiteconnect";
import fs from "fs";
import path from "path";

const API_KEY    = process.env.KITE_API_KEY;
const API_SECRET = process.env.KITE_API_SECRET;

// In-memory store (per-process). Replace with DB model later.
const mem = {
  accessTokenByUser: new Map(), // userId -> accessToken
  map: null,                    // symbol -> { token, exchange }
  reverse: null,                // token  -> symbol
};

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
  if (!API_KEY) throw new Error("KITE_API_KEY missing");
  const kc = new KiteConnect({ api_key: API_KEY });
  const url = kc.getLoginURL();
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}state=${encodeURIComponent(userId)}`;
}

export async function handleCallback(userId = "default", query = {}) {
  if (!API_KEY || !API_SECRET) throw new Error("Kite API keys missing");
  const requestToken = query.request_token;
  if (!requestToken) throw new Error("request_token missing in callback");
  const kc = new KiteConnect({ api_key: API_KEY });
  const sess = await kc.generateSession(requestToken, API_SECRET);
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
  if (!API_KEY) throw new Error("KITE_API_KEY missing");
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

export async function placeOrder(userId, { symbol, side, qty, product = "MIS", priceType = "MARKET" }) {
  if (!API_KEY) throw new Error("KITE_API_KEY missing");
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
    quantity: qty,
    product,
    order_type: priceType,
    validity: "DAY",
  });
  return { brokerOrderId: order?.order_id || "" };
}

export async function getPositions(userId) {
  if (!API_KEY) throw new Error("KITE_API_KEY missing");
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
  if (!API_KEY) throw new Error("KITE_API_KEY missing");
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
