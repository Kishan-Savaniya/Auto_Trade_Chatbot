import mongoose from "mongoose";
const schema = new mongoose.Schema({
  ts: { type: Date, index: true, default: () => new Date() },
  userId: { type:String, index:true },
  positions: { type: Array, default: [] },
  netPnl: { type: Number, default: 0 }
}, { timestamps: false });
export const PositionSnapshot = mongoose.model("PositionSnapshot", schema);
