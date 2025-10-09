// Server/src/db.js
import mongoose from "mongoose";

const DEFAULT_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/auto_trade";

/** Connect with retries so the app won't crash if Mongo isn't up yet. */
export async function connectDB(
  uri = DEFAULT_URI,
  { retries = 20, baseDelayMs = 1000 } = {}
) {
  mongoose.set("strictQuery", true);

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await mongoose.connect(uri, {
        serverSelectionTimeoutMS: 3000,
        connectTimeoutMS: 3000,
      });
      console.log(`[DB] Connected: ${uri}`);
      wireConnLogs();
      return;
    } catch (err) {
      const msg = err?.code || err?.message || String(err);
      console.error(`[DB] connect attempt ${attempt}/${retries} failed: ${msg}`);
      if (attempt === retries) throw err;
      const wait = Math.min(15000, baseDelayMs * attempt);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
}

function wireConnLogs() {
  const c = mongoose.connection;
  c.on("disconnected", () => console.warn("[DB] disconnected"));
  c.on("reconnected", () => console.log("[DB] reconnected"));
  c.on("error", (e) => console.error("[DB] error", e?.message || e));
}

export function isDbConnected() {
  // 1 = connected; 2 = connecting
  return mongoose.connection.readyState === 1;
}
