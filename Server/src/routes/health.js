import { Router } from "express";
import mongoose from "mongoose";
import { getBrokerName, getBrokerAdapter, normalizeBroker } from "../services/providers.js";

export const healthRouter = Router();
healthRouter.get("/", (_req,res)=> res.json({ ok:true, db: mongoose.connection.readyState===1?"up":"down", ts: Date.now() }));
healthRouter.get("/ready", (_req,res)=> res.json({ ready:true, ts: Date.now() }));
healthRouter.get("/debug/broker", async (req,res)=>{
  const raw = (req.query.name || process.env.BROKER || "mock");
  const norm = normalizeBroker(raw) || "mock";
  const mod = await getBrokerAdapter(raw);
  res.json({ raw, normalized: norm, moduleKeys: Object.keys(mod || {}), using: getBrokerName() });
});
