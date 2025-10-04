// Server/src/routes/broker.js
import { Router } from "express";
import { getBrokerAdapter, getUserBrokerName } from "../services/brokers/index.js";
import { BrokerToken } from "../models/BrokerToken.js";
import { applySymbols } from "../services/marketHub.js";

export const brokerRouter = Router();

// helper: async handler
const ah = (fn) => (req, res) => Promise.resolve(fn(req, res)).catch((e) => {
  console.error("[brokerRouter]", e?.stack || e?.message || e);
  res.status(400).json({ ok: false, error: e?.message || "broker error" });
});

// 1) Providers list
brokerRouter.get("/providers", ah(async (_req, res) => {
  res.json({ providers: ["zerodha", "upstox", "angelone"] });
}));

// 2) Start login
brokerRouter.get("/login/:name", ah(async (req, res) => {
  const brokerName = String(req.params.name || "").toLowerCase();
  const userId = String(req.query.userId || "default");
  const adapter = getBrokerAdapter(brokerName);
  if (!adapter?.loginUrl) throw new Error(`${brokerName} adapter missing loginUrl()`);
  const url = await adapter.loginUrl(userId);
  res.json({ url });
}));

// 3) OAuth callback (broker-name specific)
brokerRouter.get("/callback/:name", ah(async (req, res) => {
  const brokerName = String(req.params.name || "").toLowerCase();
  const userId = String(req.query.state || req.query.userId || "default");
  const adapter = getBrokerAdapter(brokerName);
  if (!adapter?.handleCallback) throw new Error(`${brokerName} adapter missing handleCallback()`);
  await adapter.handleCallback(userId, req.query);
  res.send("Authenticated. You can close this window.");
}));

// 4) Test connection
brokerRouter.post("/test", ah(async (req, res) => {
  const userId = String(req.body?.userId || "default");
  const brokerName = String(req.body?.broker || getUserBrokerName() || "").toLowerCase();
  const adapter = getBrokerAdapter(brokerName);
  if (!adapter?.isAuthenticated) throw new Error(`${brokerName} adapter missing isAuthenticated()`);
  const ok = await adapter.isAuthenticated(userId);
  res.json({ ok, message: ok ? "Broker connectivity OK" : "Not authenticated" });
}));

// 5) Pass-through orders to adapter
brokerRouter.post("/orders/place", ah(async (req, res) => {
  const userId = String(req.body?.userId || "default");
  const brokerName = String(req.body?.broker || getUserBrokerName() || "").toLowerCase();
  const adapter = getBrokerAdapter(brokerName);
  if (!adapter?.placeOrder) throw new Error(`${brokerName} adapter missing placeOrder()`);

  const payload = req.body || {};
  if (!payload.symbol || !payload.side || !payload.qty) {
    return res.status(400).json({ ok: false, error: "symbol, side, qty required" });
  }
  const r = await adapter.placeOrder(userId, payload);
  res.json({ ok: true, ...r });
}));

// 6) Positions from broker (optional – live view)
brokerRouter.get("/positions", ah(async (req, res) => {
  const userId = String(req.query?.userId || "default");
  const brokerName = String(req.query?.broker || getUserBrokerName() || "").toLowerCase();
  const adapter = getBrokerAdapter(brokerName);
  if (!adapter?.getPositions) throw new Error(`${brokerName} adapter missing getPositions()`);
  const list = await adapter.getPositions(userId);
  res.json(list);
}));

// 7) Credential login (brokers that support it)
brokerRouter.post("/:name/credential-login", ah(async (req, res) => {
  const name = String(req.params.name || "").toLowerCase();
  const userId = String(req.body?.userId || "default");
  const adapter = getBrokerAdapter(name);
  if (!adapter?.credentialLogin) {
    return res.status(400).json({ ok: false, error: `${name} does not support credential login` });
  }
  const r = await adapter.credentialLogin(userId, req.body);
  res.json({ ok: true, ...r });
}));

// 8) Update runtime watchlist + resubscribe feed
brokerRouter.post("/subscribe", ah(async (req, res) => {
  const symbols = Array.isArray(req.body?.symbols) ? req.body.symbols : String(req.body?.symbols || "")
    .split(",").map(s => s.trim()).filter(Boolean);
  if (!symbols.length) return res.status(400).json({ ok: false, error: "symbols required" });

  applySymbols(symbols);
  res.json({ ok: true, symbols });
}));

// 9) Quick LTP probe (debug / UI helpers)
brokerRouter.get("/ltp", ah(async (req, res) => {
  // optional: adapter may expose ltpOf; otherwise UI can use /api/market/table
  const symbols = String(req.query?.symbols || "")
    .split(",").map(s => s.trim()).filter(Boolean);
  if (!symbols.length) return res.status(400).json({ ok: false, error: "symbols query required" });

  const adapter = getBrokerAdapter(getUserBrokerName() || "mock");
  const out = {};
  for (const s of symbols) {
    try { out[s] = Number(adapter?.ltpOf?.(s)) || null; }
    catch { out[s] = null; }
  }
  res.json(out);
}));
