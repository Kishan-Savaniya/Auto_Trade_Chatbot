import mongoose from "mongoose";

const schema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, index: true },
  symbol: { type: String, index: true },
  side: { type: String, enum: ["BUY","SELL"] },
  qty: Number,
  type: { type: String, enum: ["MARKET","LIMIT"], default: "MARKET" },
  limitPrice: Number,
  idemKey: { type: String, index: true, unique: true },
  broker: { type: String, index: true },
  brokerOrderId: { type: String, index: true },
  status: { type: String, default: "PENDING" }, // PENDING/OPEN/COMPLETE/CANCELLED/REJECTED
  slippage: Number,
  correlationId: String
}, { timestamps: true });

export const Order = mongoose.model("Order", schema);
