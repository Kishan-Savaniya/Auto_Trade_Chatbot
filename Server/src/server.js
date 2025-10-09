import dotenv from "dotenv";
dotenv.config();
import mongoose from "mongoose";
import { buildApp } from "./app.js";

const PORT = process.env.PORT || 4000;
const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/auto_trade";

async function start(){
  await mongoose.connect(MONGO_URI);
  console.log("[DB] Connected:", MONGO_URI);
  const app = buildApp();
  app.listen(PORT, ()=> console.log("[HTTP] Listening on", PORT));
}
start().catch(e=>{ console.error(e); process.exit(1); });
