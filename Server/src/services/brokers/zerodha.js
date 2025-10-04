import EventEmitter from "events";
import { KiteConnect, KiteTicker } from "kiteconnect";
import fs from "fs";
import path from "path";

export default class Zerodha extends EventEmitter {
  constructor(opts = {}) {
    super();
    this.opts = {
      apiKey: process.env.KITE_API_KEY,
      apiSecret: process.env.KITE_API_SECRET,
      accessToken: process.env.KITE_ACCESS_TOKEN, // set after login
      ...opts
    };
    this.kc = null;
    this.ticker = null;
    this.map = {};
    this.quoteCache = new Map(); // symbol -> ltp
    this.connected = false;
  }

  async init() {
    if (!this.opts.apiKey || !this.opts.accessToken) {
      console.warn("[zerodha] missing apiKey/accessToken -> staying disconnected");
      return;
    }

    // Load instrument map
    const p = path.join(process.cwd(), "data", "kite-map.json");
    if (fs.existsSync(p)) this.map = JSON.parse(fs.readFileSync(p, "utf8"));

    // REST client
    this.kc = new KiteConnect({ api_key: this.opts.apiKey });
    this.kc.setAccessToken(this.opts.accessToken);

    // WS ticker
    this.ticker = new KiteTicker({
      api_key: this.opts.apiKey,
      access_token: this.opts.accessToken,
    });

    this.ticker.on("ticks", (ticks) => {
      for (const t of ticks || []) {
        const ltp = t.last_price;
        const token = t.instrument_token;
        const symbol = this.symbolFromToken(token);
        if (symbol && Number.isFinite(ltp)) {
          this.quoteCache.set(symbol, ltp);
        }
      }
      this.emit("ticks");
    });

    this.ticker.on("connect", () => {
      this.connected = true;
      // If already asked to subscribe, re-subscribe on reconnect
      if (this._pendingSubs?.length) this._subscribeTokens(this._pendingSubs);
    });

    this.ticker.on("disconnect", () => { this.connected = false; });
    this.ticker.connect();
  }

  /** Resolve app symbol -> { token, exchange } */
  lookup(symbol) {
    const e = this.map[symbol];
    return e ? { token: e.token, exchange: e.exchange } : null;
  }

  symbolFromToken(token) {
    // reverse search once & cache
    if (!this._rev) {
      this._rev = {};
      for (const [sym, v] of Object.entries(this.map)) this._rev[v.token] = sym;
    }
    return this._rev[token] || null;
  }

  ltpOf(symbol) {
    const v = this.quoteCache.get(symbol);
    return Number.isFinite(v) ? v : null;
  }

  async subscribe(symbols = []) {
    const toks = symbols
      .map((s) => this.lookup(s)?.token)
      .filter(Boolean);
    this._pendingSubs = toks;
    if (this.connected) this._subscribeTokens(toks);
  }
  _subscribeTokens(tokens) {
    try {
      if (!this.ticker) return;
      this.ticker.subscribe(tokens);
      this.ticker.setMode(this.ticker.modeLTP, tokens);
    } catch (e) {
      console.error("[zerodha] subscribe failed:", e?.message || e);
    }
  }

  // --- Orders ---
  async placeOrder({ symbol, side, qty, product = "MIS", priceType = "MARKET" }) {
    const m = this.lookup(symbol);
    if (!m) throw new Error(`Unknown symbol: ${symbol} (map missing)`);
    const tx = side === "BUY" ? "BUY" : "SELL";
    const order = await this.kc.placeOrder("regular", {
      exchange: m.exchange,           // "NSE"
      tradingsymbol: symbol,          // "RELIANCE"
      transaction_type: tx,           // BUY/SELL
      quantity: qty,
      product,                        // MIS/CNC
      order_type: priceType,          // MARKET/LIMIT
      validity: "DAY",
    });
    return { ok: true, id: order?.order_id || "" };
  }

  async positions() {
    const r = await this.kc.getPositions(); // { net: [...] }
    return (r?.net || []).map((p) => ({
      symbol: p.tradingsymbol,
      type: Number(p.quantity) >= 0 ? "LONG" : "SHORT",
      qty: Math.abs(Number(p.quantity || 0)),
      avgPrice: Number(p.average_price || 0),
      ltp: Number(p.last_price || 0),
      pnl: Number(p.pnl || 0),
    }));
  }

  async orders() {
    const r = await this.kc.getOrders();
    return (r || []).map((o) => ({
      _id: o.order_id,
      symbol: o.tradingsymbol,
      side: o.transaction_type,
      qty: Number(o.quantity || 0),
      price: Number(o.average_price || o.price || 0),
      status: o.status, // COMPLETE, REJECTED, OPEN, etc.
      createdAt: new Date(o.order_timestamp || Date.now()),
    }));
  }
}
