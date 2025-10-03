import jwt from "jsonwebtoken";
export function requireAuth(req, res, next) {
  const h = req.headers.authorization || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : "";
  if (!token) return res.status(401).json({ error: "missing token" });
  try {
    const { uid } = jwt.verify(token, process.env.JWT_SECRET || "dev");
    req.userId = uid;
    next();
  } catch {
    res.status(401).json({ error: "invalid token" });
  }
}
