// Server/src/models/User.js
import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    username: { type: String, unique: true, required: true, trim: true, lowercase: true },
    passwordHash: { type: String, required: true },
    role: { type: String, default: "user" } // "user" | "admin"
  },
  { timestamps: true }
);

export const User = mongoose.model("User", userSchema);
