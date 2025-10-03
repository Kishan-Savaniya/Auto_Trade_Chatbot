// Server/src/models/Order.js
import mongoose from "mongoose";

const OrderSchema = new mongoose.Schema(
  {
    symbol: { type: String, required: true },
    side:   { type: String, enum: ["BUY", "SELL"], required: true },
    qty:    { type: Number, required: true },
    price:  { type: Number, required: true },
    status: { type: String, default: "FILLED" },
    realizedPnl: { type: Number, default: 0 }   // <-- add this
  },
  { timestamps: true }
);

export const Order = mongoose.model("Order", OrderSchema);
