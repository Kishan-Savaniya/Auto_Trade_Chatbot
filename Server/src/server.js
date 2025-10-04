// Server/src/server.js
import mongoose from "mongoose";
import { buildApp } from "./app.js";
import { connectDB, isDbConnected } from "./db.js";
import { config } from "./config.js";
import { startLoop, getEngineState } from "./services/engineLoop.js";

process.on("unhandledRejection", (e) => {
  console.error("[unhandledRejection]", e?.message || e);
});
process.on("uncaughtException", (e) => {
  console.error("[uncaughtException]", e?.message || e);
});

async function start() {
  try {
    await connectDB(); // has retry logic
  } catch (err) {
    console.error("Fatal: could not connect to MongoDB after retries:", err?.message || err);
  }

  const app = buildApp();

  // DB health endpoint
  app.get("/health/db", (_req, res) => {
    res.json({ mongo: isDbConnected() ? "up" : "down" });
  });

  app.listen(config.port, () => {
    console.log(`[HTTP] Listening on port ${config.port}`);
  });

  // Start engine ONLY when DB is connected
  const kickEngine = async () => {
    try {
      console.log("[Engine] DB up, starting loop…");
      await startLoop();
      await getEngineState();
    } catch (e) {
      console.error("[Engine] failed to start:", e?.message || e);
    }
  };

  if (isDbConnected()) {
    kickEngine();
  } else {
    console.warn("[Engine] Deferring start until DB connects…");
    mongoose.connection.once("open", kickEngine);
  }
}

start();
