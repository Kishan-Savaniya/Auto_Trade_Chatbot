import { ZerodhaAdapter } from "./zerodha.js";
import { UpstoxAdapter } from "./upstox.js";
import { AngelAdapter } from "./angelone.js";

const map = {
  zerodha: ZerodhaAdapter,
  upstox: UpstoxAdapter,
  angelone: AngelAdapter,
};

export function getBrokerAdapter(name) {
  const key = String(name || "").toLowerCase();
  if (!map[key]) throw new Error(`Unsupported broker: ${name}`);
  return map[key];
}

// You can change this to read from Settings/DB per user
export function getUserBrokerName() {
  return "zerodha"; // default
}
