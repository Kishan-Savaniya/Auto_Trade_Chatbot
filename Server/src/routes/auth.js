import { Router } from "express";
import { User } from "../models/User.js";
import { hashPassword, comparePassword } from "../utils/hash.js";
import { issueCookie } from "../middleware/auth.js";
export const authRouter = Router();
authRouter.get("/me",(req,res)=> res.json({ ok: !!req.cookies?.token }));
authRouter.post("/login", async (req,res)=>{
  const { username, password } = req.body||{};
  const u = await User.findOne({ username });
  if(!u || !comparePassword(password||"", u.passwordHash||"")) return res.status(401).json({ error:"invalid credentials" });
  issueCookie(res, { id:u._id, username:u.username }); res.json({ ok:true, user:{ id:u._id, username:u.username } });
});
authRouter.post("/signup", async (req,res)=>{
  try{
    const { username, password, email, fullName, gender, birthdate, address, phone } = req.body||{};
    if(!username || !password) return res.status(400).json({ error:"username & password required" });
    const exists = await User.findOne({ username }); if(exists) return res.status(409).json({ error:"username exists" });
    const user = await User.create({ username, passwordHash: hashPassword(password), email, fullName, gender, birthdate, address, phone });
    issueCookie(res, { id:user._id, username:user.username }); res.json({ ok:true, user:{ id:user._id, username:user.username } });
  }catch{ res.status(500).json({ error:"signup failed" }); }
});
authRouter.post("/logout",(req,res)=>{ res.clearCookie("token"); res.json({ ok:true }); });
