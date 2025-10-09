// Server/src/middleware/auth.js
import jwt from "jsonwebtoken";

export function authRequired(req, res, next) {
  try {
    const token = req.cookies?.at;
    if (!token) return res.status(401).json({ error: "Unauthorized" });
    const payload = jwt.verify(token, process.env.JWT_SECRET || "dev_secret");
    req.user = { id: payload.sub, username: payload.username, role: payload.role || "user" };
    next();
  } catch (e) {
    return res.status(401).json({ error: "Unauthorized" });
  }
}
