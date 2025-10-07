// Server/src/routes/health.js
import { Router } from "express";
import mongoose from "mongoose";

// Soft-load services so this route never crashes if a module is absent during dev
let engineApi = null;
let ist = null;
let risk = null;
let providers = null;

try { engineApi = await import("../services/engineLoop.js"); } catch { engineApi = {}; }
try { ist       = await import("../utils/istTime.js"); }     catch { ist = {}; }
try { risk      = await import("../services/riskService.js"); } catch { risk = {}; }
try { providers = await import("../services/providers.js"); } catch { providers = {}; }

const getEngineState    = engineApi.getEngineState    || (async () => ({ running: false, startedAt: null }));
const isMarketOpenIST   = ist.isMarketOpenIST         || (() => false);
const todayKeyIST       = ist.todayKeyIST             || (() => new Date().toISOString().slice(0,10));
const riskSnapshot      = risk.riskSnapshot           || (async () => ({ dayKey: todayKeyIST(), net: 0, capitalInUse: 0, limits: {} }));
const getBrokerName     = providers.getBrokerName     || (() => "mock");
const getBrokerAdapter  = providers.getBrokerAdapter  || (() => ({}));
const normalizeBroker   = providers.normalizeBroker   || ((s) => (s || "mock"));

export const healthRouter = Router();

/**
 * Root health: DB, engine, market (IST), and risk snapshot
 */
healthRouter.get("/", async (_req, res) => {
  try {
    const st = await getEngineState();
    const snap = await riskSnapshot();
    res.json({
      ok: true,
      db: mongoose.connection?.readyState === 1 ? "up" : "down",
      engine: { running: !!st.running, startedAt: st.startedAt || null },
      market: { openIST: !!isMarketOpenIST(), dayKey: todayKeyIST() },
      risk: snap,
    });
  } catch (e) {
    res.status(200).json({
      ok: true,
      db: mongoose.connection?.readyState === 1 ? "up" : "down",
      engine: { running: false, startedAt: null },
      market: { openIST: false, dayKey: todayKeyIST() },
      risk: { error: e?.message || String(e) },
      warn: "health fallback used due to missing service"
    });
  }
});

/**
 * Liveness
 */
healthRouter.get("/health", (_req, res) =>
  res.json({ ok: true, ts: Date.now() })
);

/**
 * Readiness
 */
healthRouter.get("/ready", (_req, res) =>
  res.json({ ready: true, ts: Date.now() })
);

/**
 * Debug: which broker adapter is actually being resolved at runtime
 */
healthRouter.get("/debug/broker", (req, res) => {
  const raw = (req.query.name || process.env.BROKER || "mock");
  const norm = normalizeBroker(raw) || "mock";
  const mod = getBrokerAdapter(raw) || {};
  res.json({
    raw,
    normalized: norm,
    moduleKeys: Object.keys(mod),
    using: getBrokerName()
  });
});
