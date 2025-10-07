//Scope Implement OAuth callbacks, token exchange, refresh, and encrypted persistence.

import mongoose from "mongoose";
import crypto from "crypto";

const ENC_KEY = process.env.TOKEN_ENC_KEY; // 32 bytes (prod via KMS)
function enc(plain) {
  if (!plain) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", Buffer.from(ENC_KEY, "hex"), iv);
  const ct = Buffer.concat([cipher.update(String(plain), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ct]).toString("base64");
}
function dec(b64) {
  if (!b64) return null;
  const raw = Buffer.from(b64, "base64");
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const ct  = raw.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", Buffer.from(ENC_KEY, "hex"), iv);
  decipher.setAuthTag(tag);
  const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
  return pt.toString("utf8");
}

const schema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, index: true },
  broker: { type: String, index: true }, // "zerodha" | "upstox"
  accessToken: { type: String, get: dec, set: enc },
  refreshToken: { type: String, get: dec, set: enc },
  expiresAt: Date,
  meta: Object
}, { timestamps: true, toJSON: { getters: true }, toObject: { getters: true } });

export const BrokerToken = mongoose.model("BrokerToken", schema);
