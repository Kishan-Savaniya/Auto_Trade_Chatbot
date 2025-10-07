// Server/src/services/marketHub.js
// Normalized feed entrypoint: choose adapter, connect WS, emit tick/status.

import EventEmitter from "events";
import { getBrokerAdapter, getBrokerName } from "./providers.js";

export const marketBus = new EventEmitter();

/**
 * Start a market feed for the active broker.
 * @param {Object} opts
 * @param {string[]} opts.instruments - symbols or tokens depending on adapter
 * @param {string}   opts.userId
 * @returns {Function} stop function
 */
export function startMarketFeed({ instruments = [], userId = "default" } = {}) {
  const adapter = getBrokerAdapter();
  let stop = null;
  try {
    stop = adapter.connectMarketWS({
      userId,
      instruments,
      onTick: (t) => marketBus.emit("tick", t),
      onStatus: (s, d) => marketBus.emit("feed:status", { state: s, details: d, broker: getBrokerName() }),
    });
  } catch (e) {
    marketBus.emit("feed:status", { state: "error", details: e, broker: getBrokerName() });
  }
  return () => { try { stop && stop(); } catch {} };
}
