// Server/src/services/brokers/upstox.js
// Upstox adapter skeleton (OAuth2, code flow)
// SDK: `npm i upstox-js-sdk` (or use your preferred HTTP client)

import { BrokerToken } from "../../models/BrokerToken.js";

function required(name) {
  const v = process.env[name];
  if (!v) throw new Error(`[Upstox] Missing env ${name}`);
  return v;
}

// Lazy import the SDK so the app still boots without it
async function getSdk() {
  try {
    // eslint-disable-next-line import/no-extraneous-dependencies
    const sdk = await import("upstox-js-sdk");
    return sdk.default || sdk;
  } catch (e) {
    throw new Error(
      "[Upstox] SDK not installed. Run: npm i upstox-js-sdk (or implement HTTP calls yourself)"
    );
  }
}

function makeAuthUrl({ clientId, redirectUri, scope, state }) {
  const base = "https://api.upstox.com/v2/login/authorization/dialog";
  const u = new URL(base);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("client_id", clientId);
  u.searchParams.set("redirect_uri", redirectUri);
  if (scope) u.searchParams.set("scope", scope);
  if (state) u.searchParams.set("state", state);
  return u.toString();
}

export const UpstoxAdapter = {
  // 1) Redirect user to Upstox login
  async loginUrl(userId) {
    const clientId = required("UPSTOX_CLIENT_ID");
    const redirectUri = required("UPSTOX_REDIRECT_URI");
    const scope = process.env.UPSTOX_SCOPES || "market:read orders:write";
    return makeAuthUrl({ clientId, redirectUri, scope, state: userId });
  },

  // 2) Exchange ?code= for tokens
  async handleCallback(userId, { code }) {
    if (!code) throw new Error("[Upstox] Missing ?code in callback");
    const clientId = required("UPSTOX_CLIENT_ID");
    const clientSecret = required("UPSTOX_CLIENT_SECRET");
    const redirectUri = required("UPSTOX_REDIRECT_URI");

    // If you don't want the SDK, swap this with a direct POST to token endpoint
    const Sdk = await getSdk();
    const api = new Sdk.OAuthApi();
    const req = new Sdk.AccessTokenRequest(code, clientId, clientSecret, redirectUri, "authorization_code");
    const resp = await api.getAccessToken(req);

    // Persist
    await BrokerToken.findOneAndUpdate(
      { userId, broker: "upstox" },
      {
        $set: {
          accessToken: resp.access_token,
          refreshToken: resp.refresh_token,
          expiresAt: resp.expires_in ? new Date(Date.now() + resp.expires_in * 1000) : undefined,
          meta: resp
        }
      },
      { upsert: true }
    );
  },

  async isAuthenticated(userId) {
    const doc = await BrokerToken.findOne({ userId, broker: "upstox" });
    return !!doc?.accessToken;
  },

  // Minimal order placement example (MARKET/LIMIT). Map fields as needed.
  async placeOrder(userId, { symbol, side, qty, price, type = "MARKET" }) {
    const doc = await BrokerToken.findOne({ userId, broker: "upstox" });
    if (!doc?.accessToken) throw new Error("[Upstox] Not authenticated");

    try {
      const Sdk = await getSdk();
      const api = new Sdk.OrderApi();
      api.apiClient.authentications.oauth2.accessToken = doc.accessToken;

      // NOTE: Map instrument/exchange properly for your symbols
      const body = {
        quantity: Number(qty),
        product: "I" /* Intraday? adjust */,
        duration: "DAY",
        price: type === "LIMIT" ? Number(price) : 0,
        trigger_price: 0,
        instrument_token: symbol, // TODO: map your symbol to Upstox instrument_token
        transaction_type: side === "BUY" ? "BUY" : "SELL",
        order_type: type === "LIMIT" ? "LIMIT" : "MARKET",
        disclosed_quantity: 0,
        is_amo: false,
      };

      const r = await api.placeOrder(body);
      return { brokerOrderId: r?.data?.order_id || r?.order_id || "upstox-" + Date.now() };
    } catch (e) {
      // Keep local engine running even if live order fails
      console.error("[Upstox.placeOrder] error:", e?.message || e);
      return { brokerOrderId: null, warning: e?.message || "Upstox order not placed" };
    }
  },

  async getPositions(userId) {
    const doc = await BrokerToken.findOne({ userId, broker: "upstox" });
    if (!doc?.accessToken) return [];
    try {
      const Sdk = await getSdk();
      const api = new Sdk.PortfolioApi();
      api.apiClient.authentications.oauth2.accessToken = doc.accessToken;
      const r = await api.getPositions();
      const list = r?.data || r?.positions || [];
      return list.map((p) => ({
        symbol: p?.trading_symbol || p?.instrument_token || "",
        type: Number(p?.net_qty) > 0 ? "LONG" : Number(p?.net_qty) < 0 ? "SHORT" : "FLAT",
        qty: Math.abs(Number(p?.net_qty || 0)),
        avgPrice: Number(p?.avg_price || 0),
      }));
    } catch (e) {
      console.error("[Upstox.getPositions] error:", e?.message || e);
      return [];
    }
  },

  async getQuotes(symbols = []) {
    // TODO: implement if you want live quotes via REST
    return {};
  },

  async stream(userId, symbols = [], onTick = () => {}) {
    // TODO: implement WebSocket if needed; return an unsubscribe function
    return () => {};
  },
};
