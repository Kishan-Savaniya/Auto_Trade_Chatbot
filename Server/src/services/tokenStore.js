import { BrokerToken } from "../models/BrokerToken.js";

export async function setTokens({ userId, broker, accessToken, refreshToken, expiresAt, meta }) {
  return BrokerToken.findOneAndUpdate(
    { userId, broker },
    { accessToken, refreshToken, expiresAt, meta },
    { upsert: true, new: true }
  );
}

export async function getTokens({ userId, broker }) {
  return BrokerToken.findOne({ userId, broker });
}
