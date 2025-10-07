// Server/src/services/providers.js
// Canonical broker resolver. Accepts aliases and never requires "await".

import * as zerodha from "./brokers/zerodha.js";
import * as upstox  from "./brokers/upstox.js";
import * as mock    from "./brokers/mock.js";

const ALIASES = new Map([
  ["zerodha", "zerodha"],
  ["kite", "zerodha"],
  ["upstox", "upstox"],
  ["mock", "mock"]
]);

export function getBrokerName() {
  const raw = (process.env.BROKER || "mock").trim().toLowerCase();
  return ALIASES.get(raw) || "mock";
}

export function getBrokerAdapter(name) {
  const broker = ALIASES.get((name || getBrokerName()).toLowerCase());
  if (broker === "zerodha") return zerodha;
  if (broker === "upstox")  return upstox;
  if (broker === "mock")    return mock;

  // Helpful diagnostics
  const available = {
    zerodha: Object.keys(zerodha || {}),
    upstox:  Object.keys(upstox  || {}),
    mock:    Object.keys(mock    || {}),
  };
  throw new Error(`Unsupported or missing broker adapter: ${name || "(env)"}; available keys: ${JSON.stringify(available)}`);
}
