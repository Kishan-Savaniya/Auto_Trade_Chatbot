//Brokers stream ticks; you need 1-minute candles for RSI/MACD. Add a tiny candle store that aggregates ticks.
import { calcMACD, calcRSI } from "../utils/tech.js";

class CandleStore {
  constructor() { this.series = new Map(); } // sym -> [{t,o,h,l,c}]
  onTick(symbol, ltp, ts = Date.now()) {
    const keyMin = Math.floor(ts / 60000) * 60000;
    const arr = this.series.get(symbol) || [];
    let last = arr[arr.length - 1];
    if (!last || last.t !== keyMin) { last = { t: keyMin, o: ltp, h: ltp, l: ltp, c: ltp }; arr.push(last); }
    last.c = ltp; if (ltp > last.h) last.h = ltp; if (ltp < last.l) last.l = ltp;
    if (arr.length > 600) arr.shift();
    this.series.set(symbol, arr);
  }
  snapshot(symbol) { return this.series.get(symbol) || []; }
  metrics(symbol) {
    const closes = this.snapshot(symbol).map(x => x.c);
    const rsi = Math.round(calcRSI(closes));
    const m = calcMACD(closes);
    return { rsi, macd: Number(m.macd.toFixed(2)), hist: m.hist };
  }
}

export const candleStore = new CandleStore();
