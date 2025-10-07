// Server/src/services/marketHub.js
import { config } from "../config.js";
import { getFeed } from "../adapters/market/index.js";
import EventEmitter from "eventemitter3";
import { getBrokerAdapter } from "./providers.js";
export const marketHub = new EventEmitter();

let currentProvider = config.market.provider || "mock";
let closeCurrentFeed = null;

export function getProvider() { return currentProvider; }

export async function startMarketFeed(instruments) {
  const adapter = await getBrokerAdapter();
  let stop = adapter.connectMarketWS(/* token doc resolved inside */ instruments, (tick) => {
    marketBus.emit("tick", tick);
  });
  return () => { try { stop && stop(); } catch {} };
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


