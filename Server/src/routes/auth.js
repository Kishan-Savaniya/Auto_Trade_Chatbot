// Server/src/routes/auth.js
import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { User } from "../models/User.js";

export const authRouter = Router();

// Registration
authRouter.post("/register", async (req, res) => {
  try {
    const { username, password, email, fullName, gender, birthdate, address, phone } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ error: "username & password required" });
    }
    const exists = await User.findOne({ username: username.toLowerCase().trim() });
    if (exists) return res.status(409).json({ error: "username already exists" });
    const passwordHash = await bcrypt.hash(password, 10);
    const doc = await User.create({
      username: username.toLowerCase().trim(),
      passwordHash,
      email: email?.trim(),
      fullName: fullName?.trim(),
      gender: gender?.trim(),
      birthdate: birthdate ? new Date(birthdate) : undefined,
      address: address?.trim(),
      phone: phone?.trim(),
    });
    setAuthCookie(res, doc);
    res.json({ ok: true, user: { username: doc.username, role: doc.role } });
  } catch (e) {
    res.status(500).json({ error: "registration failed" });
  }
});


function setAuthCookie(res, user) {
  const token = jwt.sign(
    { sub: user._id.toString(), username: user.username, role: user.role || "user" },
    process.env.JWT_SECRET || "dev_secret",
    { expiresIn: "7d" }
  );
  res.cookie("at", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 7 * 24 * 60 * 60 * 1000
  });
}

authRouter.post("/signup", async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) return res.status(400).json({ error: "username & password required" });
    const exists = await User.findOne({ username: username.toLowerCase().trim() });
    if (exists) return res.status(409).json({ error: "username already exists" });

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({ username: username.toLowerCase().trim(), passwordHash, role: "user" });
    setAuthCookie(res, user);
    res.json({ ok: true, user: { username: user.username, role: user.role } });
  } catch (e) {
    res.status(500).json({ error: "signup failed" });
  }
});

authRouter.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) return res.status(400).json({ error: "username & password required" });
    const user = await User.findOne({ username: username.toLowerCase().trim() });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(401).json({ error: "invalid credentials" });
    }
    setAuthCookie(res, user);
    res.json({ ok: true, user: { username: user.username, role: user.role } });
  } catch (e) {
    res.status(500).json({ error: "login failed" });
  }
});

authRouter.post("/logout", async (_req, res) => {
  res.clearCookie("at", { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production" });
  res.json({ ok: true });
});

authRouter.get("/me", async (req, res) => {
  try {
    // if cookie invalid, middleware in app.js will not run; we use a soft check here
    const token = req.cookies?.at;
    if (!token) return res.status(401).json({ error: "unauthorized" });
    const payload = jwt.verify(token, process.env.JWT_SECRET || "dev_secret");
    res.json({ ok: true, user: { id: payload.sub, username: payload.username, role: payload.role || "user" } });
  } catch {
    res.status(401).json({ error: "unauthorized" });
  }
});
