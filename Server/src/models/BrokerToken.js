import mongoose from "mongoose";

const schema = new mongoose.Schema({
  userId: { type: String, required: true },
  broker: { type: String, enum: ["zerodha", "upstox", "angelone"], required: true },
  accessToken: String,
  refreshToken: String,
  publicToken: String,
  meta: mongoose.Schema.Types.Mixed,
  expiresAt: Date
}, { timestamps: true });

schema.index({ userId: 1, broker: 1 }, { unique: true });

export const BrokerToken = mongoose.model("BrokerToken", schema);
