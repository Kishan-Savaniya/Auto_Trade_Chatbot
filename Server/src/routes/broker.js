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


// Return OAuth login URL for the selected broker
brokerRouter.get("/login/:name", async (req, res) => {
  const name = (req.params.name || "").toLowerCase();
  try {
    if (name === "upstox") {
      const key = process.env.UPSTOX_API_KEY;
      const redirect = process.env.UPSTOX_REDIRECT_URI;
      const scope = process.env.UPSTOX_SCOPE || "orders profile websocket marketdata";
      if (!key || !redirect) return res.status(500).json({ error: "Upstox API keys not configured" });
      const url = `https://api.upstox.com/v2/login/authorization/dialog?response_type=code&client_id=${encodeURIComponent(key)}&redirect_uri=${encodeURIComponent(redirect)}&scope=${encodeURIComponent(scope)}`;
      return res.json({ url });
    }
    if (name === "zerodha" || name === "kite") {
      const key = process.env.KITE_API_KEY;
      const redirect = process.env.KITE_REDIRECT_URI; // optional; Kite v3 ignores redirect param
      if (!key) return res.status(500).json({ error: "Kite API key not configured" });
      const base = `https://kite.trade/connect/login?api_key=${encodeURIComponent(key)}&v=3`;
      const url = redirect ? base + `&redirect_uri=${encodeURIComponent(redirect)}` : base;
      return res.json({ url });
    }
    return res.status(400).json({ error: "unsupported broker" });
  } catch (e) {
    res.status(500).json({ error: "failed to build login url" });
  }
});
