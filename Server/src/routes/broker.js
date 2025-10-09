import { Router } from "express";
import { getBrokerAdapter, getBrokerName } from "../services/providers.js";
export const brokerRouter = Router();
brokerRouter.get("/status", async (_req,res)=>{
  const A = await getBrokerAdapter();
  const ok = await A.isAuthenticated?.("default");
  res.json({ name: getBrokerName(), connected: !!ok });
});
