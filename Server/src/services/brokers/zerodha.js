import { KiteConnect } from "kiteconnect";
import { BrokerToken } from "../../models/BrokerToken.js";

function kcFor(userId, tokenDoc) {
  const kc = new KiteConnect({
    api_key: process.env.ZERODHA_API_KEY,
  });
  if (tokenDoc?.accessToken) kc.setAccessToken(tokenDoc.accessToken);
  return kc;
}

export const ZerodhaAdapter = {
  async loginUrl(userId) {
    const kc = new KiteConnect({ api_key: process.env.ZERODHA_API_KEY });
    return kc.getLoginURL({ v: 3, redirect_params: { state: userId } });
  },

  async handleCallback(userId, { request_token }) {
    const kc = new KiteConnect({
      api_key: process.env.ZERODHA_API_KEY,
    });
    const session = await kc.generateSession(request_token, process.env.ZERODHA_API_SECRET);
    await BrokerToken.findOneAndUpdate(
      { userId, broker: "zerodha" },
      {
        $set: {
          accessToken: session.access_token,
          publicToken: session.public_token,
          meta: session
        }
      },
      { upsert: true }
    );
  },

  async isAuthenticated(userId) {
    const doc = await BrokerToken.findOne({ userId, broker: "zerodha" });
    return !!doc?.accessToken;
  },

  async placeOrder(userId, { symbol, side, qty, price, type = "MARKET" }) {
    const doc = await BrokerToken.findOne({ userId, broker: "zerodha" });
    const kc = kcFor(userId, doc);

    // Map your symbol to Zerodha instrument_token if you have instrument map
    // For now, place by tradingsymbol on NSE:
    const params = {
      exchange: "NSE",
      tradingsymbol: symbol,
      transaction_type: side === "BUY" ? "BUY" : "SELL",
      quantity: qty,
      order_type: type === "LIMIT" ? "LIMIT" : "MARKET",
      product: "MIS",
      variety: "regular",
    };
    if (type === "LIMIT" && price) params.price = price;

    const r = await kc.placeOrder("regular", params);
    return { brokerOrderId: r.order_id };
  },

  async getPositions(userId) {
    const doc = await BrokerToken.findOne({ userId, broker: "zerodha" });
    const kc = kcFor(userId, doc);
    const pos = await kc.getPositions();
    // map to your schema
    const day = pos?.day || [];
    return day
      .filter(p => Number(p.quantity) !== 0)
      .map(p => ({
        symbol: p.tradingsymbol,
        type: Number(p.quantity) > 0 ? "LONG" : "SHORT",
        qty: Math.abs(Number(p.quantity)),
        avgPrice: Number(p.average_price || 0)
      }));
  },

  async getQuotes(symbols) {
    // For true quotes, use instruments tokens. Here we return empty to let your
    // marketHub keep mock if not mapped yet.
    return {};
  },

  async stream(userId, symbols, onTick) {
    // For live streaming, use KiteTicker with instrument_tokens list.
    // Placeholder so your engine can call and get a disposer:
    return () => {}; // noop close
  }
};
