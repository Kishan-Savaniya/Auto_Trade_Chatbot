import { Router } from "express";
import { getBrokerAdapter, getUserBrokerName } from "../services/brokers/index.js";
import { BrokerToken } from "../models/BrokerToken.js";

export const brokerRouter = Router();

// 1) Providers list
brokerRouter.get("/providers", (_req, res) => {
  res.json({ providers: ["zerodha", "upstox", "angelone"] });
});

// 2) Start login
brokerRouter.get("/login/:name", async (req, res) => {
  const brokerName = req.params.name;
  const userId = req.query.userId || "default";
  const adapter = getBrokerAdapter(brokerName);
  const url = await adapter.loginUrl(userId);
  res.json({ url });
});

// 3) OAuth callback (broker-name specific)
brokerRouter.get("/callback/:name", async (req, res) => {
  const brokerName = req.params.name;
  const userId = req.query.state || req.query.userId || "default";
  const adapter = getBrokerAdapter(brokerName);
  await adapter.handleCallback(userId, req.query);
  res.send("Authenticated. You can close this window.");
});

// 4) Test connection
brokerRouter.post("/test", async (req, res) => {
  const userId = req.body.userId || "default";
  const brokerName = req.body.broker || getUserBrokerName();
  const adapter = getBrokerAdapter(brokerName);
  const ok = await adapter.isAuthenticated(userId);
  res.json({ ok, message: ok ? "Broker connectivity OK" : "Not authenticated" });
});

// 5) Pass-through orders to adapter
brokerRouter.post("/orders/place", async (req, res) => {
  const userId = req.body.userId || "default";
  const brokerName = req.body.broker || getUserBrokerName();
  const adapter = getBrokerAdapter(brokerName);
  const r = await adapter.placeOrder(userId, req.body);
  res.json({ ok: true, ...r });
});

// 6) Positions from broker (optional – your DB positions exist; this fetches live)
brokerRouter.get("/positions", async (req, res) => {
  const userId = req.query.userId || "default";
  const brokerName = req.query.broker || getUserBrokerName();
  const adapter = getBrokerAdapter(brokerName);
  const list = await adapter.getPositions(userId);
  res.json(list);
});

brokerRouter.post("/:name/credential-login", async (req, res) => {
  try {
    const name = req.params.name.toLowerCase();
    const userId = req.body.userId || "default";
    const a = getBrokerAdapter(name);
    if (!a.credentialLogin) {
      return res.status(400).json({ ok: false, error: `${name} does not support credential login` });
    }
    const r = await a.credentialLogin(userId, req.body);
    res.json({ ok: true, ...r });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});