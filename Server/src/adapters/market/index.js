// Server/src/adapters/market/index.js
import { makeMockFeed } from "./mockFeed.js";
// Stubs: you’ll flesh these out when you have real keys
import { makeKiteFeed } from "./kiteFeed.js";
import { makeUpstoxFeed } from "./upstoxFeed.js";
import { makeAngelFeed } from "./angelFeed.js";

export function getFeed(name) {
  switch (name) {
    case "kite":   return makeKiteFeed();
    case "upstox": return makeUpstoxFeed();
    case "angel":  return makeAngelFeed();
    default:       return makeMockFeed();
  }
}
