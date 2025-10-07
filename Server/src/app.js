// Server/src/app.js
import express from "express";
import cors from "cors";
import morgan from "morgan";
import cookieParser from "cookie-parser";
import { config } from "./config.js";

import { authRouter } from "./routes/auth.js";
import { authRequired } from "./middleware/auth.js";

import { engineRouter } from "./routes/engine.js";
import { marketRouter } from "./routes/market.js";
import { ordersRouter } from "./routes/orders.js";
import { positionsRouter } from "./routes/positions.js";
import { reportsRouter } from "./routes/reports.js";
import { settingsRouter } from "./routes/settings.js";
import { brokerRouter } from "./routes/broker.js";
import { healthRouter } from "./routes/health.js";
import { streamRouter } from "./routes/stream.js";
import { registry } from "./metrics/metrics.js";

function buildAllowOrigins() {
  const set = new Set([
    "http://localhost:5500",
    "http://127.0.0.1:5500",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
  ]);
  if (config.corsOrigin && config.corsOrigin !== "*") set.add(config.corsOrigin);
  if (process.env.CORS_ALLOW_ORIGINS) {
    String(process.env.CORS_ALLOW_ORIGINS)
      .split(",")
      .map(s => s.trim())
      .filter(Boolean)
      .forEach((o) => set.add(o));
  }
  return set;
}

export function buildApp() {
  const app = express();

  // --------------------------- CORS (cookies-safe, single) ---------------------------
  const ALLOW_ORIGINS = buildAllowOrigins();
  app.use(cors({
    origin: (origin, cb) => {
      if (!origin || ALLOW_ORIGINS.has(origin)) return cb(null, true);
      return cb(new Error(`CORS blocked origin: ${origin}`), false);
    },
    credentials: true,
  }));

  app.use(cookieParser());
  app.use(express.json());
  app.use(morgan("dev"));

  // ----------------------------------- Public -----------------------------------
  app.get("/", (_req, res) => res.json({ ok: true, name: "Auto Trade Backend" }));
  app.use("/api", healthRouter);        // /api/health, /api/ready
  app.get("/metrics", async (_req, res) => {
    res.set("Content-Type", registry.contentType);
    res.end(await registry.metrics());
  });

  app.use("/api/auth", authRouter);
  app.use("/api/broker", brokerRouter); // OAuth redirects/callbacks

  // Optional: keep market public or protect it as you prefer
  app.use("/api/market", marketRouter);

  // --------------------------------- Protected ----------------------------------
  app.use("/api/engine", authRequired, engineRouter);
  app.use("/api/orders", authRequired, ordersRouter);
  app.use("/api/positions", authRequired, positionsRouter);
  app.use("/api/reports", authRequired, reportsRouter);
  app.use("/api/settings", authRequired, settingsRouter);
  app.use("/api", authRequired, streamRouter); // SSE stream protected

  // ---------------------------------- Fallback ----------------------------------
  app.use((req, res) => res.status(404).json({ error: "Not found", path: req.path }));

  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    console.error(err);
    res.status(500).json({ error: "Internal error" });
  });

  return app;
}
