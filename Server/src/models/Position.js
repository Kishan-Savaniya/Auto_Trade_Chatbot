import mongoose from "mongoose";

const PositionSchema = new mongoose.Schema(
  {
    symbol: String,
    type: { type: String, enum: ["LONG", "SHORT"] },
    qty: Number,
    avgPrice: Number,
    ltp: Number,
    pnl: Number
  },
  { timestamps: true }
);

export const Position = mongoose.model("Position", PositionSchema);
