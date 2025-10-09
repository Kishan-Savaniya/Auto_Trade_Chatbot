import jwt from "jsonwebtoken";
const SECRET = process.env.JWT_SECRET || "dev_secret";

export function authRequired(req,res,next){
  const token = req.cookies?.token;
  if(!token) return res.status(401).json({ error:"unauthorized" });
  try{ req.user = jwt.verify(token, SECRET); next(); }
  catch{ res.status(401).json({ error:"unauthorized" }); }
}
export function issueCookie(res, payload){
  const token = jwt.sign(payload, SECRET, { expiresIn:"7d" });
  res.cookie("token", token, { httpOnly:true, sameSite:"lax", secure:false, maxAge:7*24*60*60*1000 });
  return token;
}
