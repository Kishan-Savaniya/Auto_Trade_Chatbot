// Server/src/services/brokers/upstox.js
// Upstox adapter: OAuth (loginUrl, handleCallback), isAuthenticated,
// placeOrder/getPositions and a production-grade WebSocket streamer
// with heartbeat, reconnect, and resubscribe.
//
// Design goals:
// - Non-intrusive: keep function signatures your app expects.
// - Token persistence via tokenStore if available (fallback to in-memory).
// - Minimal assumptions: instrument mapping left as TODO (symbol->instrument_key).
//
// Dependencies: Node >=18 (global fetch), "ws" for WebSocket.
//   npm i ws
//
// ENV required:
//   UPSTOX_CLIENT_ID
//   UPSTOX_CLIENT_SECRET
//   UPSTOX_REDIRECT_URI
// Optional:
//   UPSTOX_SCOPE (default: "market:read orders:write")

import { URL } from "url";
import WebSocket from "ws";

// ---------------------------- Token storage layer -----------------------------
// Use DB (BrokerToken via services/tokenStore.js) if available; otherwise fallback to memory.
// This keeps your app working in dev even without the model.

let tokenStore = null;
try {
  tokenStore = await import("../tokenStore.js").then(m => m).catch(() => null);
} catch { /* noop */ }

const mem = {
  accessTokenByUser: new Map(),
  refreshTokenByUser: new Map(),
  expiresAtByUser: new Map(),
};

async function setTokens({ userId, accessToken, refreshToken, expiresInSec, payload }) {
  const expiresAt = expiresInSec ? new Date(Date.now() + expiresInSec * 1000) : undefined;

  // Persist if store present
  if (tokenStore?.setTokens) {
    await tokenStore.setTokens({
      userId, broker: "upstox",
      accessToken, refreshToken, expiresAt, meta: payload
    });
  }

  // Always keep an in-memory mirror for fast access and as fallback
  mem.accessTokenByUser.set(userId, accessToken);
  if (refreshToken) mem.refreshTokenByUser.set(userId, refreshToken);
  if (expiresAt) mem.expiresAtByUser.set(userId, expiresAt);

  return { accessToken, refreshToken, expiresAt };
}

async function getTokens(userId) {
  // Prefer DB if available
  if (tokenStore?.getTokens) {
    const doc = await tokenStore.getTokens({ userId, broker: "upstox" });
    if (doc?.accessToken) {
      // Mirror into memory for WS reconnects
      mem.accessTokenByUser.set(userId, doc.accessToken);
      if (doc.refreshToken) mem.refreshTokenByUser.set(userId, doc.refreshToken);
      if (doc.expiresAt) mem.expiresAtByUser.set(userId, new Date(doc.expiresAt));
      return {
        accessToken: doc.accessToken,
        refreshToken: doc.refreshToken,
        expiresAt: doc.expiresAt ? new Date(doc.expiresAt) : undefined,
      };
    }
  }
  // Fallback memory
  return {
    accessToken: mem.accessTokenByUser.get(userId),
    refreshToken: mem.refreshTokenByUser.get(userId),
    expiresAt: mem.expiresAtByUser.get(userId),
  };
}

// ------------------------------ ENV helpers ----------------------------------

function reqEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`[Upstox] Missing env ${name}`);
  return v;
}

// ------------------------------ OAuth: login ---------------------------------

export async function loginUrl(userId = "default") {
  const clientId = reqEnv("UPSTOX_CLIENT_ID");
  const redirectUri = reqEnv("UPSTOX_REDIRECT_URI");
  const scope = process.env.UPSTOX_SCOPE || "market:read orders:write";

  const base = "https://api.upstox.com/v2/login/authorization/dialog";
  const u = new URL(base);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("client_id", clientId);
  u.searchParams.set("redirect_uri", redirectUri);
  u.searchParams.set("scope", scope);
  u.searchParams.set("state", userId);
  return u.toString();
}

// --------------------------- OAuth: token exchange ---------------------------

export async function handleCallback(userId = "default", { code }) {
  if (!code) throw new Error("[Upstox] Missing ?code in callback");
  const clientId = reqEnv("UPSTOX_CLIENT_ID");
  const clientSecret = reqEnv("UPSTOX_CLIENT_SECRET");
  const redirectUri = reqEnv("UPSTOX_REDIRECT_URI");

  const res = await fetch("https://api.upstox.com/v2/login/authorization/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`[Upstox] token exchange failed: ${res.status} ${text}`);
  }

  const payload = await res.json();

  await setTokens({
    userId,
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token,
    expiresInSec: payload.expires_in,
    payload
  });

  return { ok: true, userId };
}

// ------------------------------ Auth status ----------------------------------

export async function isAuthenticated(userId = "default") {
  const tok = await getTokens(userId);
  return Boolean(tok?.accessToken);
}

// ----------------------------- Optional refresh ------------------------------
// If you want silent refresh, expose this and call when expiresAt is near.

export async function refreshTokens(userId = "default") {
  const clientId = reqEnv("UPSTOX_CLIENT_ID");
  const clientSecret = reqEnv("UPSTOX_CLIENT_SECRET");

  const { refreshToken } = await getTokens(userId);
  if (!refreshToken) throw new Error("[Upstox] No refresh token");

  const res = await fetch("https://api.upstox.com/v2/login/authorization/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`[Upstox] refresh failed: ${res.status} ${text}`);
  }

  const payload = await res.json();
  return setTokens({
    userId,
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token || refreshToken,
    expiresInSec: payload.expires_in,
    payload
  });
}

// ------------------------------- Orders (REST) -------------------------------
// Keep minimal; map your symbol -> instrument_token for production.
// Upstox v2 typically expects instrument tokens/keys from their instrument master.

export async function placeOrder(userId, { symbol, side, qty, price, type = "MARKET" }) {
  const { accessToken } = await getTokens(userId);
  if (!accessToken) throw new Error("[Upstox] Not authenticated");

  // TODO: translate your 'symbol' to Upstox's instrument token/key.
  const instrument_token = symbol;

  const body = {
    quantity: Number(qty),
    product: "I", // Intraday; adjust to your product code if needed
    duration: "DAY",
    price: type === "LIMIT" ? Number(price) : 0,
    trigger_price: 0,
    instrument_token,
    transaction_type: side === "BUY" ? "BUY" : "SELL",
    order_type: type === "LIMIT" ? "LIMIT" : "MARKET",
    disclosed_quantity: 0,
    is_amo: false,
  };

  const res = await fetch("https://api.upstox.com/v2/order/place", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${accessToken}` },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    console.error("[Upstox.placeOrder] error:", res.status, txt);
    return { brokerOrderId: null, warning: txt || String(res.status) };
  }

  const data = await res.json().catch(() => ({}));
  return { brokerOrderId: data?.data?.order_id || `upstox-${Date.now()}` };
}

export async function getPositions(userId) {
  const { accessToken } = await getTokens(userId);
  if (!accessToken) return [];
  const res = await fetch("https://api.upstox.com/v2/portfolio/positions", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return [];
  const data = await res.json().catch(() => ({}));
  const list = data?.data || data?.positions || [];
  return list.map((p) => ({
    symbol: p?.trading_symbol || p?.instrument_token || "",
    type: Number(p?.net_qty) > 0 ? "LONG" : Number(p?.net_qty) < 0 ? "SHORT" : "FLAT",
    qty: Math.abs(Number(p?.net_qty || 0)),
    avgPrice: Number(p?.avg_price || 0),
  }));
}

// ---------------------------- WebSocket streaming ----------------------------
// Robust WS client with heartbeat, reconnect, and resubscribe.
// NOTE: Upstox feed URL/contract can change; validate with your account docs.

export function connectMarketWS({ userId = "default", instruments = [], onTick, onStatus }) {
  // Upstox v2 feed endpoint (verify). If a different URL is required, update below.
  const FEED_URL = "wss://api.upstox.com/v2/feed/market-data";
  let ws, reconnectTimer, beatTimer;

  // TODO: map your app's symbols to Upstox instrument keys/tokens here:
  const instrumentKeys = instruments.map(x => String(x));

  const subscribeMsg = {
    method: "sub",
    data: { instrumentKeys, feedType: "full" } // or "ltp" per requirements
  };

  function heartbeat() {
    clearTimeout(beatTimer);
    // If we don't receive ping or any message for 20s, kill socket to force reconnect.
    beatTimer = setTimeout(() => {
      try { ws?.terminate?.(); } catch {}
    }, 20000);
  }

  async function open() {
    try {
      const { accessToken } = await getTokens(userId);
      if (!accessToken) throw new Error("No Upstox access token");

      ws = new WebSocket(FEED_URL, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });

      ws.on("open", () => {
        onStatus?.("connected");
        try {
          ws.send(JSON.stringify(subscribeMsg));
        } catch (e) {
          onStatus?.("error", e);
        }
        heartbeat();
      });

      ws.on("message", (buf) => {
        heartbeat();
        let msg; try { msg = JSON.parse(buf.toString()); } catch { return; }
        // Normalize – adjust according to actual payload
        if (Array.isArray(msg?.data)) {
          for (const d of msg.data) {
            onTick?.({
              symbol: String(d.instrumentKey || d.instrument || ""),
              ltp: d.lastTradedPrice ?? d.ltp ?? 0,
              bid: d.bestBidPrice ?? undefined,
              ask: d.bestAskPrice ?? undefined,
              ts: d.exchangeTime || Date.now(),
            });
          }
        }
      });

      ws.on("ping", () => { try { ws.pong(); } catch {} heartbeat(); });
      ws.on("close", () => { onStatus?.("disconnected"); scheduleReconnect(); });
      ws.on("error", (e) => { onStatus?.("error", e); try { ws.close(); } catch {} });
    } catch (e) {
      onStatus?.("error", e);
      scheduleReconnect();
    }
  }

  function scheduleReconnect() {
    clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(open, 3000);
  }

  // initial connect
  open();

  // return stop handle
  return () => {
    clearTimeout(reconnectTimer);
    clearTimeout(beatTimer);
    try { ws?.close(); } catch {}
    onStatus?.("disconnected");
  };
}
