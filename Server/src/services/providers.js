import { BrokerToken } from "../models/BrokerToken.js";
import * as zerodha from "./brokers/zerodha.js";
import * as upstox from "./brokers/upstox.js";

export async function getBrokerAdapter() {
  const name = (process.env.BROKER || "zerodha").toLowerCase();
  if (name === "zerodha") return zerodha;
  if (name === "upstox") return upstox;
  throw new Error("Unsupported broker");
}
