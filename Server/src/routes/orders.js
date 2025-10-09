import { Router } from "express";
import { Order } from "../models/Order.js";
import { placeNormalizedOrder, cancelNormalizedOrder } from "../services/oms.js";
export const ordersRouter = Router();

ordersRouter.post("/", async (req,res)=>{
  try{
    const o = await placeNormalizedOrder("default", req.body||{});
    res.json({ ok:true, order:o });
  }catch(e){ res.status(400).json({ error: e?.message||String(e) }); }
});

ordersRouter.post("/:id/cancel", async (req,res)=>{
  const r = await cancelNormalizedOrder("default", req.params.id);
  res.json(r);
});

ordersRouter.get("/", async (_req,res)=>{
  const list = await Order.find({}).sort({ createdAt:-1 }).limit(200).lean();
  res.json(list);
});
