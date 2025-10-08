// Server/src/services/providers.js
// Maps normalized broker names -> adapters (Zerodha (kite), Upstox, Mock)
// Guarantees: normalizeBroker(), getBrokerName(), getBrokerAdapter()

const ENV_NAME = (process.env.BROKER || process.env.BROKER_PROVIDER || "kite").toLowerCase();

const NAME_ALIASES = new Map([
  ["kite", "zerodha"],
  ["zerodha", "zerodha"],
  ["upstox", "upstox"],
  ["mock", "mock"],
  ["paper", "mock"], // legacy alias
]);

export function normalizeBroker(name) {
  if (!name) return "zerodha";
  const k = String(name || "").toLowerCase();
  return NAME_ALIASES.get(k) || "zerodha";
}

let _cachedName = normalizeBroker(ENV_NAME);

export function getBrokerName() {
  return _cachedName;
}

export function setBrokerName(newName) {
  _cachedName = normalizeBroker(newName);
}

// Lazy import so boot never crashes when optional SDKs are missing
export function getBrokerAdapter(name) {
  const broker = normalizeBroker(name || _cachedName);
  if (broker === "zerodha") {
    // ESM named exports from zerodha.js
    return import("./brokers/zerodha.js").then(m => ({
      loginUrl: m.loginUrl,
      handleCallback: m.handleCallback,
      isAuthenticated: m.isAuthenticated,
      connectMarketWS: m.connectMarketWS,
      placeOrder: m.placeOrder,
      getPositions: m.getPositions,
      getOrders: m.getOrders,
      name: "zerodha",
    }));
  }
  if (broker === "upstox") {
    return import("./brokers/upstox.js").then(m => ({
      loginUrl: m.loginUrl,
      handleCallback: m.handleCallback,
      isAuthenticated: m.isAuthenticated,
      connectMarketWS: m.connectMarketWS,
      placeOrder: m.placeOrder,
      getPositions: m.getPositions,
      getOrders: m.getOrders,
      name: "upstox",
    }));
  }
  // fallback mock adapter (never throws)
  return import("./brokers/mockAdapter.js").then(m => ({
    ...m.default,
    name: "mock",
  }));
}
