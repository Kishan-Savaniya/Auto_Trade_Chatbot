// Server/src/services/brokers/upstox.js
// Upstox adapter: loginUrl -> handleCallback (?code -> tokens),
// isAuthenticated, (stub) WS connect + minimal orders/positions.
// Uses in-memory token for now to stay non-intrusive.

import { URL } from "url";

const mem = {
  accessTokenByUser: new Map(),
  refreshTokenByUser: new Map(),
  expiresAtByUser: new Map(),
};

function reqEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`[Upstox] Missing env ${name}`);
  return v;
}

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

export async function handleCallback(userId = "default", { code }) {
  if (!code) throw new Error("[Upstox] Missing ?code in callback");
  const clientId = reqEnv("UPSTOX_CLIENT_ID");
  const clientSecret = reqEnv("UPSTOX_CLIENT_SECRET");
  const redirectUri = reqEnv("UPSTOX_REDIRECT_URI");

  // Direct token exchange via fetch (no SDK dependency)
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
  mem.accessTokenByUser.set(userId, payload.access_token);
  if (payload.refresh_token) mem.refreshTokenByUser.set(userId, payload.refresh_token);
  if (payload.expires_in) mem.expiresAtByUser.set(userId, new Date(Date.now() + payload.expires_in * 1000));
  return { ok: true, userId };
}

export async function isAuthenticated(userId = "default") {
  return Boolean(mem.accessTokenByUser.get(userId));
}

// Minimal place/get endpoints (map instruments properly as you integrate)
export async function placeOrder(userId, { symbol, side, qty, price, type = "MARKET" }) {
  const at = mem.accessTokenByUser.get(userId);
  if (!at) throw new Error("[Upstox] Not authenticated");
  // NOTE: You must translate your symbol -> instrument_token per Upstox instrument master.
  const body = {
    quantity: Number(qty),
    product: "I", // Intraday (adjust)
    duration: "DAY",
    price: type === "LIMIT" ? Number(price) : 0,
    trigger_price: 0,
    instrument_token: symbol, // TODO: map properly
    transaction_type: side === "BUY" ? "BUY" : "SELL",
    order_type: type === "LIMIT" ? "LIMIT" : "MARKET",
    disclosed_quantity: 0,
    is_amo: false,
  };

  const res = await fetch("https://api.upstox.com/v2/order/place", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${at}` },
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
  const at = mem.accessTokenByUser.get(userId);
  if (!at) return [];
  const res = await fetch("https://api.upstox.com/v2/portfolio/positions", {
    headers: { Authorization: `Bearer ${at}` },
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

// (Optional) WS streaming to add later. Keeping interface parity:
export function connectMarketWS({ userId = "default", instruments = [], onTick, onStatus }) {
  onStatus?.("error", new Error("Upstox WS not implemented yet in this skeleton"));
  return () => {};
}
