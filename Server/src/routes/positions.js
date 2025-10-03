import { Router } from "express";
import { Position } from "../models/Position.js";

export const positionsRouter = Router();

// Used by your UI: GET /api/positions
positionsRouter.get("/", async (_req, res) => {
  const list = await Position.find({}).sort({ updatedAt: -1 });
  res.json(list);
});
