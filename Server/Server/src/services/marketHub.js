// Server/src/services/marketHub.js
import EventEmitter from "events";
import { getBrokerAdapter, getBrokerName } from "./providers.js";

export const marketBus = new EventEmitter();

let _stopFeed = null;

export async function startMarketFeed(symbols = []) {
  if (_stopFeed) { try { _stopFeed(); } catch {} _stopFeed = null; }
  const A = await getBrokerAdapter();
  const unsub = A.connectMarketWS({
    instruments: symbols,
    onTick: (t) => marketBus.emit("tick", t),
    onStatus: (st, err) => marketBus.emit("feed:status", { broker: getBrokerName(), st, err: err?.message })
  });
  _stopFeed = () => unsub && unsub();
  return _stopFeed;
}

export function stopMarketFeed() {
  if (_stopFeed) { try { _stopFeed(); } catch {} _stopFeed = null; }
}
