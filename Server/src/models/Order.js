import mongoose from "mongoose";
const schema = new mongoose.Schema({
  userId: String,
  idempotencyKey: { type:String, index:true },
  brokerOrderId: { type:String, index:true },
  symbol: String, side: String, qty: Number, price: Number, type: String,
  variety: { type:String, default:"regular" },
  status: String, error: String, slippageBoundBps: Number
}, { timestamps:true });
export const Order = mongoose.model("Order", schema);
