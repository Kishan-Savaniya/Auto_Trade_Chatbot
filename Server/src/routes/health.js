// Server/src/routes/health.js
import { Router } from "express";
import mongoose from "mongoose";
import { riskSnapshot } from "../services/riskService.js";
import { getBrokerName, getBrokerAdapter, normalizeBroker } from "../services/providers.js";
export const healthRouter = Router();
healthRouter.get("/", async (_req, res) => {
  let risk = null; try { risk = await riskSnapshot(); } catch {}
  res.json({ ok:true, db: mongoose.connection.readyState===1?"up":"down", broker:getBrokerName(), risk, ts:Date.now() });
});
healthRouter.get("/health", (_req,res)=>res.json({ ok:true, ts:Date.now() }));
healthRouter.get("/ready", (_req,res)=>{ const dbUp=mongoose.connection?.readyState===1; res.status(dbUp?200:503).json({ ready:dbUp, ts:Date.now() }); });
healthRouter.get("/debug/broker", async (req,res)=>{ const raw=(req.query.name||process.env.BROKER||"kite"); const norm=normalizeBroker(raw); let mod=null; try{ mod=await getBrokerAdapter(raw);}catch{} res.json({ raw, normalized:norm, moduleKeys:Object.keys(mod||{}), using:getBrokerName() }); });
