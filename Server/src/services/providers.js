import * as zerodha from "./brokers/zerodha.js";
import * as upstox from "./brokers/upstox.js";
import * as mock from "./brokers/mock.js";

export function getBrokerName() {
  return (process.env.BROKER || "mock").toLowerCase();
}

export function getBrokerAdapter() {
  const name = getBrokerName();
  if (name === "zerodha") return zerodha;
  if (name === "upstox") return upstox;
  if (name === "mock") return mock;
  throw new Error(`Unsupported broker: ${name}`);
}
