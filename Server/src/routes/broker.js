// Server/src/routes/broker.js
import { Router } from "express";
import { getBrokerAdapter, getBrokerName } from "../services/providers.js";


export const brokerRouter = Router();

/**
 * Infer current logged-in user id.
 * Adapt this for your auth system (cookie/session/jwt).
 */
function getUserId(req) {
  return req.user?._id || req.session?.uid || req.query.userId || "default";
}

brokerRouter.get("/status", async (req, res) => {
  try {
    const userId = getUserId(req);
    const name = (req.query.broker || getBrokerName()).toLowerCase();

    const A = getBrokerAdapter(name);
    const ok = await A.isAuthenticated?.(userId);
    res.json({ connected: !!ok, name });
  } catch (e) {
    res.json({ connected: false, error: e?.message });
  }
});

// Return OAuth login URL for the selected broker
brokerRouter.get("/login/:name", async (req, res) => {
  const name = (req.params.name || "").toLowerCase();
  const userId = getUserId(req);
  try {
    const A = getBrokerAdapter(name);
    const url = await A.loginUrl?.(userId);
    if (!url) return res.status(400).json({ error: "loginUrl not implemented for broker" });
    return res.json({ url });
  } catch (e) {
    return res.status(500).json({ error: e?.message || "failed to build login url" });
  }
});

// OAuth callbacks
brokerRouter.get("/callback/zerodha", async (req, res) => {
  try {
    const userId = req.query.state || getUserId(req);
    const A = getBrokerAdapter("zerodha");
    await A.handleCallback?.(userId, req.query);
    res.redirect("/Client/index.html#broker=ok");
  } catch (e) {
    console.error("[broker/callback/zerodha]", e);
    res.redirect("/Client/index.html#broker=fail");
  }
});

brokerRouter.get("/callback/upstox", async (req, res) => {
  try {
    const userId = req.query.state || getUserId(req);
    const A = getBrokerAdapter("upstox");
    await A.handleCallback?.(userId, req.query);
    res.redirect("/Client/index.html#broker=ok");
  } catch (e) {
    console.error("[broker/callback/upstox]", e);
    res.redirect("/Client/index.html#broker=fail");
  }
});

// Mock callback for local testing convenience
brokerRouter.get("/callback/mock", async (req, res) => {
  try {
    const userId = req.query.state || getUserId(req);
    const A = getBrokerAdapter("mock");
    await A.handleCallback?.(userId, req.query);
    res.redirect("/Client/index.html#broker=ok");
  } catch (e) {
    console.error("[broker/callback/mock]", e);
    res.redirect("/Client/index.html#broker=fail");
  }
});
