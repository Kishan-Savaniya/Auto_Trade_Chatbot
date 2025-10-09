import mongoose from "mongoose";

const ReportSchema = new mongoose.Schema(
  {
    dayKey: String, // yyyy-mm-dd (IST)
    net: Number,
    trades: Number,
    winRate: Number,
    summary: Object
  },
  { timestamps: true }
);

export const Report = mongoose.model("Report", ReportSchema);
