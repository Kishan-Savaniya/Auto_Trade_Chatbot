// Server/src/config.js
import dotenv from "dotenv";
dotenv.config();

// ---- helpers ---------------------------------------------------------------
const toBool = (v) =>
  v === true ||
  v === 1 ||
  String(v).trim().toLowerCase() === "true" ||
  String(v).trim() === "1";

const toNum = (v, fallback) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const toList = (v, fallback = []) =>
  (v ? String(v) : "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean).length
    ? String(v)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : fallback;

// ---- values ---------------------------------------------------------------
const corsList =
  toList(process.env.CORS_ORIGINS) // prefer list if provided
    .length
    ? toList(process.env.CORS_ORIGINS)
    : toList(process.env.CORS_ORIGIN, [
        "http://127.0.0.1:5500",
        "http://localhost:5500",
      ]);

const mongo = process.env.MONGO_URI ||
              process.env.MONGO_URL ||
              "mongodb://127.0.0.1:27017/auto_trade";

export const config = {
  brokerName: (process.env.BROKER_NAME || "mock").toLowerCase(),
  // runtime / infra
  port: toNum(process.env.PORT, 4000),
  env: process.env.NODE_ENV || "production",
  corsOrigin: corsList,                 // Express CORS accepts an array
  mongoUri: mongo,                      // preferred
  mongoUrl: mongo,                      // alias for older imports
  mustEndDayProfitable: process.env.MUST_END_DAY_PROFITABLE === "1",
  eodHardCutoffIST: process.env.EOD_HARD_CUTOFF_IST || "15:25",

  // trading defaults (mutable at runtime by your settings routes)
  symbols: toList(process.env.SYMBOLS, [
    "RELIANCE",
    "TCS",
    "INFY",
    "HDFC",
    "ITC",
    "WIPRO",
  ]),
  capitalPerTrade: toNum(process.env.CAPITAL_PER_TRADE, 10000),
  maxPositions: toNum(process.env.MAX_POSITIONS, 5),
  stopLossPct: toNum(process.env.STOP_LOSS_PCT, 2),
  targetPct: toNum(process.env.TARGET_PCT, 5),

  // risk guards (server-side)
  dailyLossLimit: toNum(process.env.DAILY_LOSS_LIMIT, 5000),
  maxCapitalUsage: toNum(process.env.MAX_CAPITAL_USAGE, 50000),

  // market feed / streaming (SSE) / broker selection
  market: {
    provider: (process.env.MARKET_PROVIDER || "mock").toLowerCase(), // mock|kite|upstox|angel
    streamPushMs: toNum(process.env.STREAM_PUSH_MS, 900),            // SSE throttle
  },
  broker: {
    provider: (process.env.BROKER_PROVIDER || "kite").toLowerCase(),   // default to Zerodha (Kite Connect)
  },

  // dev override to force market open for demo/testing
  devForceOpen: toBool(process.env.DEV_FORCE_MARKET_OPEN),

  // notifications (optional)
  mailFrom: process.env.MAIL_FROM || "AutoTrade <no-reply@autotrade.local>",
  smtp: {
    host: process.env.SMTP_HOST || "",
    port: toNum(process.env.SMTP_PORT, 587),
    user: process.env.SMTP_USER || "",
    pass: process.env.SMTP_PASS || "",
  },
  fallbackEmail: process.env.FALLBACK_EMAIL || "",
};

