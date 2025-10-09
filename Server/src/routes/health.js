import { Router } from "express";
import mongoose from "mongoose";
export const healthRouter = Router();
healthRouter.get("/", (_req,res)=> res.json({ ok:true, db: mongoose.connection.readyState===1?"up":"down", ts: Date.now() }));
