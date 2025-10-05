// Server/src/app.js
import express from "express";
import cors from "cors";
import morgan from "morgan";
import cookieParser from "cookie-parser";              // ✅ NEW: read HTTP-only auth cookie
import { config } from "./config.js";

import { authRouter } from "./routes/auth.js";         // ✅ NEW: public auth routes (login/signup/me/logout)
import { authRequired } from "./middleware/auth.js";   // ✅ NEW: guard for protected APIs

import { engineRouter } from "./routes/engine.js";
import { marketRouter } from "./routes/market.js";
import { ordersRouter } from "./routes/orders.js";
import { positionsRouter } from "./routes/positions.js";
import { reportsRouter } from "./routes/reports.js";
import { settingsRouter, brokerRouter } from "./routes/settings.js";
import { healthRouter } from "./routes/health.js";
import { streamRouter } from "./routes/stream.js";

export function buildApp() {
  const app = express();

  /* ----------------------------- CORS (with cookies) ----------------------------- */
  // NOTE: When sending cookies, origin cannot be "*".
  const allowList = new Set([
    "http://localhost:5500",
    "http://127.0.0.1:5500",
  ]);
  // include configured origin if present and not wildcard
  if (config.corsOrigin && config.corsOrigin !== "*") {
    allowList.add(config.corsOrigin);
  }

 app.use(cors({
  origin: (origin, cb) => {
    const allow = new Set([
      "http://localhost:5500",  // or your actual UI origin/port
      "http://127.0.0.1:5500"
    ]);
    if (!origin || allow.has(origin)) return cb(null, true);
    return cb(null, false);
  },
  credentials: true
}));


  app.use(cookieParser()); // ✅ needed for auth cookie
  app.use(express.json());
  app.use(morgan("dev"));

  /* ----------------------------------- Public ----------------------------------- */
  app.get("/", (_req, res) => res.json({ ok: true, name: "Auto Trade Backend" }));
  app.use("/health", healthRouter);

  app.use("/api/auth", authRouter);        // ✅ login / signup / logout / me (public)
  app.use("/api/broker", brokerRouter);    // public OAuth redirects if you wire real brokers

  // Keep market table public so the login screen can show something (make it protected if you prefer)
  app.use("/api/market", marketRouter);

  /* --------------------------------- Protected ---------------------------------- */
  // Everything below requires a valid auth cookie (set by /api/auth/login or /api/auth/signup)
  app.use("/api/engine", authRequired, engineRouter);
  app.use("/api/orders", authRequired, ordersRouter);
  app.use("/api/positions", authRequired, positionsRouter);
  app.use("/api/reports", authRequired, reportsRouter);
  app.use("/api/settings", authRequired, settingsRouter);

  // Your stream router was previously mounted at "/api"; keep same path but protect it
  app.use("/api", authRequired, streamRouter);

  /* ---------------------------------- Fallback ---------------------------------- */
  app.use((req, res) => res.status(404).json({ error: "Not found", path: req.path }));

  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    console.error(err);
    res.status(500).json({ error: "Internal error" });
  });

  return app;
}
