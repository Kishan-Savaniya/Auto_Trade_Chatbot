// Server/src/routes/market.js
// Purpose: market data routes (table for grid, per-symbol snapshot for RSI/MACD),
// and watchlist (symbols) read/write.

import { Router } from "express";
import { getSnapshotRows } from "../services/marketDataService.js";
import { Settings } from "../models/Settings.js";
import { config } from "../config.js";

export const marketRouter = Router();

/**
 * GET /api/market/table
 * Returns the full market snapshot for the current watchlist.
 */
marketRouter.get("/table", (_req, res) => {
  const rows = getSnapshotRows();
  res.json(rows);
});

/**
 * GET /api/market/snapshot?symbol=RELIANCE
 * Returns a single row (ltp/change/rsi/macd/signal) for one symbol.
 * Use this for the “Technical Snapshot” (RSI/MACD) on the Market page.
 */
marketRouter.get("/snapshot", (req, res) => {
  const symbol = String(req.query.symbol || "").trim().toUpperCase();
  if (!symbol) return res.status(400).json({ error: "symbol query required" });

  const rows = getSnapshotRows();
  const row = rows.find(r => r.symbol === symbol);
  if (!row) {
    return res
      .status(404)
      .json({ error: "Symbol not found in watchlist", watchlist: config.symbols });
  }
  res.json(row);
});

/**
 * GET /api/market/symbols
 * Returns current runtime symbols + persisted CSV (if present).
 */
marketRouter.get("/symbols", async (_req, res) => {
  const s = await Settings.findOne({});
  res.json({ symbols: config.symbols, persisted: s?.algo?.symbolsCsv || "" });
});

/**
 * POST /api/market/symbols
 * Body: { "symbols": "RELIANCE,TCS,..." }
 * Persists to Settings and applies to runtime (no server restart needed).
 */
marketRouter.post("/symbols", async (req, res) => {
  const { symbols } = req.body || {};
  if (typeof symbols !== "string") {
    return res.status(400).json({ error: "symbols (CSV) required" });
  }

  // Normalize: split, trim, uppercase, dedupe
  const list = symbols
    .split(",")
    .map(s => s.trim().toUpperCase())
    .filter(Boolean);

  const deduped = [...new Set(list)];

  // Light validation to avoid junk entries
  const bad = deduped.filter(s => !/^[A-Z0-9_:-]+$/.test(s));
  if (bad.length) {
    return res.status(400).json({ error: `Invalid symbols: ${bad.join(", ")}` });
  }

  // Persist
  let s = await Settings.findOne({});
  if (!s) s = await Settings.create({});
  s.algo = s.algo || {};
  s.algo.symbolsCsv = deduped.join(",");
  await s.save();

  // Apply to runtime
  config.symbols = deduped;

  res.json({ ok: true, symbols: deduped });
});
