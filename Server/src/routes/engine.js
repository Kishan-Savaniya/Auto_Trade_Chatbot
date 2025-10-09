import { Router } from "express";
import { isCutoffActive } from "../services/scheduler.js";
import { isKillSwitchOn } from "../services/riskService.js";

let running = false;
let startedAt = null;

export const engineRouter = Router();

engineRouter.get("/state", (_req,res)=> res.json({ running, startedAt }));

engineRouter.post("/start", (_req,res)=>{
  if (isCutoffActive()) return res.status(400).json({ error:"EOD cutoff active" });
  if (isKillSwitchOn()) return res.status(400).json({ error:"Kill switch active" });
  running = true; startedAt = new Date();
  return res.json({ ok:true, running, startedAt });
});

engineRouter.post("/stop", (_req,res)=>{
  running = false;
  return res.json({ ok:true, running });
});

export function isEngineRunning(){ return running; }
