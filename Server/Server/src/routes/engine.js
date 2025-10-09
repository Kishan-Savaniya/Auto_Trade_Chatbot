// Server/src/routes/engine.js
import { Router } from "express";
import { startLoop, stopLoop, getEngineState, emergencyStop } from "../services/engineLoop.js";

export const engineRouter = Router();

engineRouter.get("/state", async (_req, res) => {
  const st = await getEngineState();
  res.json(st);
});

engineRouter.post("/start", async (_req, res) => {
  console.log("[Engine] START requested");
  const st = await startLoop();
  res.json({ ok: true, running: !!st?.running });
});

engineRouter.post("/stop", async (_req, res) => {
  console.log("[Engine] STOP requested");
  const st = await stopLoop();
  res.json({ ok: true, running: !!st?.running });
});

engineRouter.post("/emergency-stop", async (_req, res) => {
  console.log("[Engine] EMERGENCY STOP");
  await emergencyStop();
  const st = await getEngineState();
  res.json({ ok: true, running: !!st?.running });
});
