import { Settings } from "../models/Settings.js";
import { config } from "../config.js";

/**
 * Load persisted settings (if any) and apply them to the in-memory runtime config
 * so the engine/algo immediately use the saved values without restart.
 */
export async function applySettingsToRuntime() {
  let s = await Settings.findOne({});
  if (!s) s = await Settings.create({}); // create defaults on first run

  // ---- Algorithm params ----
  if (s.algo) {
    if (typeof s.algo.capitalPerTrade === "number")
      config.capitalPerTrade = s.algo.capitalPerTrade;

    if (typeof s.algo.maxPositions === "number")
      config.maxPositions = s.algo.maxPositions;

    if (typeof s.algo.stopLossPct === "number")
      config.stopLossPct = s.algo.stopLossPct;

    if (typeof s.algo.targetPct === "number")
      config.targetPct = s.algo.targetPct;

    if (typeof s.algo.symbolsCsv === "string") {
      config.symbols = s.algo.symbolsCsv
        .split(",")
        .map(x => x.trim())
        .filter(Boolean);
    }
  }

  return s;
}
