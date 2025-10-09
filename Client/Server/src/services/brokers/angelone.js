// Server/src/services/brokers/angelone.js
// Angel One (SmartAPI) adapter skeleton
// SDK: `npm i smartapi-javascript` (official SmartAPI JS lib)
// NOTE: Uses credential login (client_code, password, TOTP)

import { BrokerToken } from "../../models/BrokerToken.js";
import { BrokerAdapter } from "./AdapterBase.js";

function softRequireEnv(name) {
  const v = process.env[name];
  if (!v) console.warn(`[AngelOne] Consider setting env ${name}`);
  return v;
}

async function getSmartApi() {
  try {
    // eslint-disable-next-line import/no-extraneous-dependencies
    const { SmartAPI } = await import("smartapi-javascript");
    return SmartAPI;
  } catch (e) {
    throw new Error("[AngelOne] SDK not installed. Run: npm i smartapi-javascript");
  }
}

export const AngelAdapter = {
  // Kept for interface parity; SmartAPI doesn't use OAuth redirects.
  async loginUrl(_userId) {
    return "about:blank"; // Not applicable; use credentialLogin instead.
  },
  async handleCallback() {
    // Not used
    return;
  },

  // ---- Real login for SmartAPI (call via POST /api/broker/credential-login) ----
  async credentialLogin(userId, { client_code, password, totp }) {
    if (!client_code || !password || !totp) {
      throw new Error("[AngelOne] Need { client_code, password, totp }");
    }
    const apiKey = softRequireEnv("ANGEL_API_KEY");      // aka client_id
    const apiSecret = softRequireEnv("ANGEL_API_SECRET"); // some flows need it

    const SmartAPI = await getSmartApi();
    const smart = new SmartAPI({ api_key: apiKey });

    // 1) Generate session (will return access_token)
    const session = await smart.generateSession(client_code, password, totp);
    // 2) OPTIONAL: if refresh/create token step is required in your account, do it here.

    await BrokerToken.findOneAndUpdate(
      { userId, broker: "angelone" },
      {
        $set: {
          accessToken: session?.data?.access_token || session?.access_token,
          meta: session
        }
      },
      { upsert: true }
    );

    return { ok: true };
  },

  async isAuthenticated(userId) {
    const doc = await BrokerToken.findOne({ userId, broker: "angelone" });
    return !!doc?.accessToken;
  },

  async placeOrder(userId, { symbol, side, qty, price, type = "MARKET" }) {
    const doc = await BrokerToken.findOne({ userId, broker: "angelone" });
    if (!doc?.accessToken) throw new Error("[AngelOne] Not authenticated");

    try {
      const apiKey = softRequireEnv("ANGEL_API_KEY");
      const SmartAPI = await getSmartApi();
      const smart = new SmartAPI({ api_key: apiKey });
      smart.setAccessToken(doc.accessToken);

      // Map symbol to AngelOne token/exchange
      // You need your instrument master for correct 'tradingsymbol', 'symboltoken', 'exchange'
      const body = {
        variety: "NORMAL",
        tradingsymbol: symbol,       // TODO: map correctly
        symboltoken: symbol,         // TODO: map correctly
        transactiontype: side === "BUY" ? "BUY" : "SELL",
        exchange: "NSE",             // NSE/BSE/NFO...
        ordertype: type === "LIMIT" ? "LIMIT" : "MARKET",
        producttype: "INTRADAY",
        duration: "DAY",
        quantity: Number(qty),
      };
      if (type === "LIMIT" && price) body.price = Number(price);

      const r = await smart.placeOrder(body);
      return { brokerOrderId: r?.data?.orderid || r?.orderid || "angelone-" + Date.now() };
    } catch (e) {
      console.error("[AngelOne.placeOrder] error:", e?.message || e);
      return { brokerOrderId: null, warning: e?.message || "AngelOne order not placed" };
    }
  },

  async getPositions(userId) {
    const doc = await BrokerToken.findOne({ userId, broker: "angelone" });
    if (!doc?.accessToken) return [];
    try {
      const apiKey = softRequireEnv("ANGEL_API_KEY");
      const SmartAPI = await getSmartApi();
      const smart = new SmartAPI({ api_key: apiKey });
      smart.setAccessToken(doc.accessToken);

      const r = await smart.getPosition(); // or getPositions(), depending on SDK
      const list = r?.data || r || [];
      return list.map((p) => ({
        symbol: p?.tradingsymbol || p?.symboltoken || "",
        type: Number(p?.netqty) > 0 ? "LONG" : Number(p?.netqty) < 0 ? "SHORT" : "FLAT",
        qty: Math.abs(Number(p?.netqty || 0)),
        avgPrice: Number(p?.avgnetprice || 0),
      }));
    } catch (e) {
      console.error("[AngelOne.getPositions] error:", e?.message || e);
      return [];
    }
  },

  async getQuotes(symbols = []) { return {}; },

  async stream(userId, symbols = [], onTick = () => {}) {
    // TODO: implement websocket streaming; return unsubscribe
    return () => {};
  },
};

export class MockAdapter extends BrokerAdapter {
  constructor(opts = {}) {
    super("mock");
  }
  async init() { return true; }
  async loginUrl(userId = "default") {
    // In mock, login is instant – just return the callback URL
    return loginUrl(userId);
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
  async connectMarketWS(params) {
    // For completeness, expose the market data stream connector
    return connectMarketWS(params);
  }
}
