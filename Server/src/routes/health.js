import { Router } from "express";
import mongoose from "mongoose";
import { getEngineState } from "../services/engineLoop.js";
import { isMarketOpenIST, todayKeyIST } from "../utils/istTime.js";
import { riskSnapshot } from "../services/riskService.js";

export const healthRouter = Router();

healthRouter.get("/", async (_req, res) => {
  const st = await getEngineState();
  const risk = await riskSnapshot();
  res.json({
    ok: true,
    db: mongoose.connection.readyState === 1 ? "up" : "down",
    engine: { running: !!st.running, startedAt: st.startedAt || null },
    market: { openIST: isMarketOpenIST(), dayKey: todayKeyIST() },
    risk,
  });
});

healthRouter.get("/health", (_req, res) =>
  res.json({ ok: true, ts: Date.now() })
);
healthRouter.get("/ready", (_req, res) =>
  res.json({ ready: true, ts: Date.now() })
);
