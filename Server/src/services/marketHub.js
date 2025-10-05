// Server/src/services/marketHub.js
import { config } from "../config.js";
import { getFeed } from "../adapters/market/index.js";
import EventEmitter from "eventemitter3";
export const marketHub = new EventEmitter();

let currentProvider = config.market.provider || "mock";
let closeCurrentFeed = null;

export function getProvider() { return currentProvider; }

export function startMarketFeed() {
  // start once with initial provider
  switchProvider(currentProvider);
}

export function switchProvider(provider) {
  if (provider === currentProvider) return;
  if (closeCurrentFeed) { try { closeCurrentFeed(); } catch {} }
  currentProvider = provider;

  // boot new feed
  const feed = getFeed(provider);
  // your existing subscription -> history update
  // ...
  // at the end, assign closer:
  closeCurrentFeed = () => feed.close?.();
}

export const marketBus = marketHub; // re-export alias as before
