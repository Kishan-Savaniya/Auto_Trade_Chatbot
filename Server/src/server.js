// Server/src/server.js
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
    await connectDB(); // will retry instead of crashing
  } catch (err) {
    console.error("Fatal: could not connect to MongoDB after retries:", err?.message || err);
  }

  const app = buildApp();

  // Extra health for DB readiness
  app.get("/health/db", (_req, res) => {
    res.json({ mongo: isDbConnected() ? "up" : "down" });
  });

  app.listen(config.port, () => {
    console.log(`[HTTP] Listening on port ${config.port}`);
  });

  // Start engine loop once server is up (loop itself checks market hours)
  try {
    startLoop();
    await getEngineState();
  } catch (e) {
    console.error("[Engine] failed to start:", e?.message || e);
  }
}

start();
