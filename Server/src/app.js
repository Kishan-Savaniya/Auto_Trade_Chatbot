import express from "express";
import cors from "cors";
import morgan from "morgan";
import { config } from "./config.js";
import { engineRouter } from "./routes/engine.js";
import { marketRouter } from "./routes/market.js";
import { ordersRouter } from "./routes/orders.js";
import { positionsRouter } from "./routes/positions.js";
import { reportsRouter } from "./routes/reports.js";
import { settingsRouter, brokerRouter } from "./routes/settings.js";
import { healthRouter } from "./routes/health.js";
import { streamRouter } from "./routes/stream.js";
;


export function buildApp() {
  const app = express();

  const allowed = new Set([
    "http://localhost:5500",
    "http://127.0.0.1:5500",
    config.corsOrigin,
    "*"
  ]);

  app.use(cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (allowed.has("*") || allowed.has(origin)) return cb(null, true);
      // also allow if origin host matches localhost:5500 variants
      if (/^http:\/\/(localhost|127\.0\.0\.1):5500$/.test(origin)) return cb(null, true);
      return cb(null, false);
    },
    credentials: false
  }));

  app.use(express.json());
  app.use(morgan("dev"));

  app.get("/", (_req, res) => res.json({ ok: true, name: "Auto Trade Backend" }));

  app.use("/api/engine", engineRouter);
  app.use("/api/market", marketRouter);
  app.use("/api/orders", ordersRouter);
  app.use("/api/positions", positionsRouter);
  app.use("/api/reports", reportsRouter);
  app.use("/api/settings", settingsRouter);
  app.use("/api/broker", brokerRouter);
  app.use("/health", healthRouter);
  app.use("/api", streamRouter);
  

  app.use((req, res) => res.status(404).json({ error: "Not found", path: req.path }));

  app.use((err, _req, res, _next) => {
    console.error(err);
    res.status(500).json({ error: "Internal error" });
  });

  return app;
}