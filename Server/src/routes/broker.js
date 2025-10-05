// Server/src/routes/broker.js
import { Router } from "express";
import { getBrokerAdapter, getUserBrokerName } from "../services/brokers/index.js";

export const brokerRouter = Router();

brokerRouter.get("/status", async (req, res) => {
  const userId = req.query.userId || "default";
  const name = req.query.broker || getUserBrokerName();
  try {
    const A = getBrokerAdapter(name);
    const ok = await A.isAuthenticated?.(userId);
    res.json({ connected: !!ok, name });
  } catch (e) {
    res.json({ connected: false, name, error: e?.message });
  }
});
