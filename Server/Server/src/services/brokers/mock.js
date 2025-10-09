// Server/src/services/brokers/mock.js
// Fully local simulator: loginUrl/handleCallback succeed instantly,
// isAuthenticated true after "callback", and a 10Hz tick stream.

import { BrokerAdapter } from "./AdapterBase.js";

const mem = {
  authed: new Set(),
};

export async function loginUrl(userId = "default") {
  // In mock, "login" is trivial; just point to a fake page that triggers callback
  return `/api/broker/callback/mock?code=dev&state=${encodeURIComponent(userId)}`;
}

export async function handleCallback(userId = "default", _query = {}) {
  mem.authed.add(userId);
  return { ok: true, userId };
}

export async function isAuthenticated(userId = "default") {
  return mem.authed.has(userId);
}

export function connectMarketWS({ userId = "default", instruments = [], onTick, onStatus }) {
  if (!mem.authed.has(userId)) mem.authed.add(userId);
  onStatus?.("connected");
  const prices = new Map(instruments.map(s => [String(s), 100 + Math.random() * 10]));
  const iv = setInterval(() => {
    const now = Date.now();
    for (const [sym, p] of prices.entries()) {
      const np = p + (Math.random() - 0.5) * 0.25;
      prices.set(sym, np);
      onTick?.({
        symbol: sym,
        ltp: Number(np.toFixed(2)),
        bid: Number((np - 0.05).toFixed(2)),
        ask: Number((np + 0.05).toFixed(2)),
        ts: now,
      });
    }
  }, 100);

  return () => { clearInterval(iv); onStatus?.("disconnected"); };
}

// Minimal stubs for parity
export async function placeOrder(_userId, { symbol, side, qty, price, type = "MARKET" }) {
  return { brokerOrderId: `MOCK-${Date.now()}` };
}
export async function getPositions(_userId) { return []; }
export async function getOrders(_userId) { return []; }

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
