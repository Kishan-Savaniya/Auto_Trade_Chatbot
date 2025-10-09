// Server/src/models/EngineState.js
import mongoose from "mongoose";

const EngineStateSchema = new mongoose.Schema(
  {
    // Use a fixed string id so we always read/update one document.
    _id: { type: String, default: "engine" },
    running: { type: Boolean, default: false },
    startedAt: { type: Date },
    eodDoneFor: { type: String }, // e.g. "2025-09-26"
  },
  { versionKey: false, timestamps: true }
);

// Optional: explicit collection name "engine_state"
export const EngineState = mongoose.model("EngineState", EngineStateSchema, "engine_state");
