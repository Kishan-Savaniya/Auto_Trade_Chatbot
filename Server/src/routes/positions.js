import { Router } from "express";
import { getBrokerAdapter } from "../services/providers.js";
export const positionsRouter = Router();
positionsRouter.get("/", async (_req,res)=>{
  const A = await getBrokerAdapter();
  const ps = await A.getPositions?.("default").catch(()=>[]);
  res.json(ps);
});
