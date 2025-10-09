import { Router } from "express";
import { snapshotRows } from "../services/marketDataService.js";
export const marketRouter = Router();
marketRouter.get("/table", (_req,res)=> res.json({ rows: snapshotRows() }));
