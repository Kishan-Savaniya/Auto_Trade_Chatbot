import mongoose from "mongoose";

const SettingsSchema = new mongoose.Schema(
  {
    broker: {
      name: { type: String, default: "" },
      apiKey: { type: String, default: "" },
      apiSecret: { type: String, default: "" },
      userId: { type: String, default: "" },
      // tokens will live here when using real OAuth brokers
      accessToken: { type: String, default: "" },
      refreshToken: { type: String, default: "" },
      accessTokenExp: { type: Date }
    },
    notifications: {
      emailEnabled: { type: Boolean, default: false },
      tradeAlerts: { type: Boolean, default: true },
      dailyReports: { type: Boolean, default: true },
      email: { type: String, default: "" }
    },
    risk: {
      dailyLossLimit: { type: Number, default: 5000 },
      maxCapitalUsage: { type: Number, default: 50000 }
    },
    prefs: {
      darkMode: { type: Boolean, default: true },
      sound: { type: Boolean, default: false },
      refreshRateSec: { type: Number, default: 5 },
      autoStart: { type: Boolean, default: true } // <— NEW
    },
    algo: {
      capitalPerTrade: { type: Number, default: 10000 },
      maxPositions: { type: Number, default: 5 },
      stopLossPct: { type: Number, default: 2 },
      targetPct: { type: Number, default: 5 },
      symbolsCsv: { type: String, default: "RELIANCE,TCS,INFY,HDFC,ITC,WIPRO" }
    }
  },
  { timestamps: true }
);

export const Settings = mongoose.model("Settings", SettingsSchema);
