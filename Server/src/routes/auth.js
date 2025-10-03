import { Router } from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { User } from "../models/User.js";
export const authRouter = Router();

authRouter.post("/register", async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: "email/password required" });
  const passHash = await bcrypt.hash(password, 10);
  const u = await User.create({ email, passHash });
  res.json({ ok: true, id: u._id });
});
authRouter.post("/login", async (req, res) => {
  const { email, password } = req.body || {};
  const u = await User.findOne({ email });
  if (!u || !(await bcrypt.compare(password, u.passHash))) return res.status(401).json({ error: "invalid" });
  const token = jwt.sign({ uid: String(u._id) }, process.env.JWT_SECRET || "dev", { expiresIn: "2d" });
  res.json({ token });
});
