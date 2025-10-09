import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import cookieParser from "cookie-parser";

import correlation from "./middleware/correlation.js";
import { healthRouter } from "./routes/health.js";
import { authRouter } from "./routes/auth.js";
import { brokerRouter } from "./routes/broker.js";
import { marketRouter } from "./routes/market.js";
import { engineRouter } from "./routes/engine.js";
import { ordersRouter } from "./routes/orders.js";
import { positionsRouter } from "./routes/positions.js";
import { reportsRouter } from "./routes/reports.js";
import { streamRouter } from "./routes/stream.js";
import { authRequired } from "./middleware/auth.js";
import { registry, counters } from "./metrics/metrics.js";
import { bootSchedulers } from "./services/scheduler.js";
import { startStrategyLoop } from "./services/strategy.js";

export function buildApp(){
  const app = express();
  app.use(helmet());
  app.use(morgan("dev"));
  app.use(express.json());
  app.use(cookieParser());
  app.use(correlation());

  const ALLOW = new Set([
    "http://localhost:5173","http://127.0.0.1:5173",
    "http://localhost:5500","http://127.0.0.1:5500"
  ]);
  app.use(cors({
    origin: (origin, cb)=>{ if(!origin||ALLOW.has(origin)) return cb(null,true); return cb(new Error("CORS: "+origin), false); },
    credentials:true
  }));

  /* Public */
  app.get("/", (_req,res)=>res.json({ ok:true, name:"Auto Trade Backend" }));
  app.use("/api/health", healthRouter);
  app.use("/api/auth", authRouter);
  app.use("/api/broker", brokerRouter);
  app.use("/api/market", marketRouter);

  /* Protected */
  app.use("/api/engine", authRequired, engineRouter);
  app.use("/api/orders", authRequired, ordersRouter);
  app.use("/api/positions", authRequired, positionsRouter);
  app.use("/api/reports", authRequired, reportsRouter);
  app.use("/api/stream", authRequired, streamRouter);

  app.get("/metrics", async (_req,res)=>{
    res.set("Content-Type", registry.contentType);
    res.end(await registry.metrics());
  });

  app.use((req,res)=>res.status(404).json({ error:"Not found", path:req.path }));
  // eslint-disable-next-line no-unused-vars
  app.use((err,_req,res,_next)=>{ console.error(err); counters.http_errors.inc(); res.status(500).json({ error:"Internal error" }); });

  bootSchedulers(); // reconciler + EOD
  startStrategyLoop(); // strategy: RSI/MACD + risk checks into OMS
  return app;
}
