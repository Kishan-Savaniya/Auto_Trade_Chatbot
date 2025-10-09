import mongoose from "mongoose";
const schema = new mongoose.Schema({
  userId: String,
  symbol: String, type:String, qty:Number, avgPrice:Number, ltp:Number, pnl:Number
}, { timestamps:true });
export const Position = mongoose.model("Position", schema);
