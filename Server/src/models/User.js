// Server/src/models/User.js
import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    email: { type: String, required: false, trim: true, lowercase: true },
    fullName: { type: String, required: false, trim: true },
    gender: { type: String, required: false, trim: true },
    birthdate: { type: Date, required: false },
    address: { type: String, required: false, trim: true },
    phone: { type: String, required: false, trim: true },

    username: { type: String, unique: true, required: true, trim: true, lowercase: true },
    passwordHash: { type: String, required: true },
    role: { type: String, default: "user" } // "user" | "admin"
  },
  { timestamps: true }
);

export const User = mongoose.model("User", userSchema);
