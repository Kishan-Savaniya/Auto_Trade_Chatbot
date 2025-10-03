// src/db.js
import mongoose from "mongoose";
import { config } from "./config.js";

export async function connectDB() {
  mongoose.set("strictQuery", true);
  await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 15000 });
  console.log("[DB] Connected:", config.mongoUri);
}
