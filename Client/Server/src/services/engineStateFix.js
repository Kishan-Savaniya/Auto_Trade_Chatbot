import { EngineState } from "../models/EngineState.js";

/**
 * Ensure only one EngineState doc exists with id "engine".
 * If duplicates exist, keep the newest values and remove the rest.
 */
export async function normalizeEngineState() {
  const docs = await EngineState.find({}).sort({ updatedAt: -1 });

  if (!docs.length) {
    await EngineState.create({ _id: "engine", running: false, riskLevel: "Medium" });
    return;
  }

  const freshest = docs[0];

  // Create canonical singleton with freshest values
  await EngineState.deleteOne({ _id: "engine" }).catch(() => {});
  await EngineState.create({
    _id: "engine",
    running: !!freshest.running,
    riskLevel: freshest.riskLevel || "Medium",
    startedAt: freshest.startedAt || null,
  });

  // Remove all others (including the original freshest)
  await EngineState.deleteMany({ _id: { $ne: "engine" } });
}
