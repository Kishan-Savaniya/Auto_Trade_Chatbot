// Server/src/server.js
import mongoose from "mongoose";
import { buildApp } from "./app.js";
import { connectDB, isDbConnected } from "./db.js";
import { config } from "./config.js";
import { startMarketHoursGuard } from "./services/marketHoursGuard.js"; // ← NEW guard import
import { startScheduler } from "./services/scheduler.js";

process.on("unhandledRejection", (e) => {
  console.error("[unhandledRejection]", e?.message || e);
});
process.on("uncaughtException", (e) => {
  console.error("[uncaughtException]", e?.message || e);
});

async function start() {
  // 1) DB connect (with your existing retry logic)
  try {
    await connectDB();
  } catch (err) {
    console.error("Fatal: could not connect to MongoDB after retries:", err?.message || err);
  }

  // 2) Build app & health probe
  const app = buildApp();
  app.get("/health/db", (_req, res) => {
    res.json({ mongo: isDbConnected() ? "up" : "down" });
  });

  // 3) Single HTTP listener (removed duplicate)
  app.listen(config.port, () => {
    console.log(`[HTTP] Listening on port ${config.port}`);
  });

  // 4) Start the market-hours guard once DB is up
  const bootGuards = async () => {
    try {
      console.log("[Boot] DB up, starting market-hours guard…");
      startMarketHoursGuard(); // auto start/stop engine based on IST market hours
    } catch (e) {
      console.error("[Boot] failed to start market-hours guard:", e?.message || e);
    }
  };

  if (isDbConnected()) {
    bootGuards();
  } else {
    console.warn("[Boot] Deferring guard start until DB connects…");
    mongoose.connection.once("open", bootGuards);
  }
}

start();

startScheduler(); // default user or resolve per account