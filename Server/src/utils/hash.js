import crypto from "node:crypto";
export function hashPassword(p){ return crypto.createHash("sha256").update(p).digest("hex"); }
export function comparePassword(p, h){ return hashPassword(p) === h; }
