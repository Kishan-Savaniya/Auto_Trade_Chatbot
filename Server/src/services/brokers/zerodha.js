// Server/src/services/brokers/zerodha.js
// Zerodha trading adapter with minimal methods your routes expect.
// Adds loginUrl / handleCallback / isAuthenticated helpers so broker routes work.

import EventEmitter from "events";
import { KiteConnect, KiteTicker } from "kiteconnect";
import fs from "fs";
import path from "path";

export class ZerodhaAdapter extends EventEmitter {
  constructor(opts = {}) {
    super();
    this.opts = {
      apiKey: process.env.KITE_API_KEY,
      apiSecret: process.env.KITE_API_SECRET,
      accessToken: process.env.KITE_ACCESS_TOKEN, // set after OAuth
      ...opts
    };
    this.kc = null;
    this.ticker = null;
    this.map = {};                      // { "RELIANCE": { token, exchange } }
    this.quoteCache = new Map();        // symbol -> ltp
    this.connected = false;
    this._pendingSubs = [];
    this._rev = null;                   // token -> symbol map
  }

  async init() {
    // Load instrument map (optional but recommended)
    try {
      const p = path.join(process.cwd(), "data", "kite-map.json");
      if (fs.existsSync(p)) this.map = JSON.parse(fs.readFileSync(p, "utf8"));
    } catch (e) {
      console.warn("[zerodha] failed to load instrument map:", e?.message || e);
    }

    // If we don't have API key yet, we can still respond to loginUrl().
    if (!this.opts.apiKey) {
      console.warn("[zerodha] missing KITE_API_KEY");
      return;
    }

    // REST client (without accessToken we can still do loginUrl)
    this.kc = new KiteConnect({ api_key: this.opts.apiKey });

    if (this.opts.accessToken) {
      this.kc.setAccessToken(this.opts.accessToken);
      await this._startTicker();
    }
  }

  /** OAuth: return login URL (append state=userId for round-trip) */
  async loginUrl(userId = "default") {
    if (!this.kc) this.kc = new KiteConnect({ api_key: this.opts.apiKey });
    const url = this.kc.getLoginURL();
    // add a state param so we know the user later
    const sep = url.includes("?") ? "&" : "?";
    return `${url}${sep}state=${encodeURIComponent(userId)}`;
  }

  /** OAuth callback: expects ?request_token=xxx. Exchanges for access_token. */
  async handleCallback(_userId = "default", query = {}) {
    const requestToken = query.request_token;
    if (!requestToken) throw new Error("request_token missing in callback");
    if (!this.kc) this.kc = new KiteConnect({ api_key: this.opts.apiKey });

    const sess = await this.kc.generateSession(requestToken, this.opts.apiSecret);
    const accessToken = sess?.access_token;
    if (!accessToken) throw new Error("Failed to exchange request_token");

    this.opts.accessToken = accessToken;
    this.kc.setAccessToken(accessToken);

    // start ticker now that we have a token
    await this._startTicker();
  }

  isAuthenticated() {
    return !!this.opts.accessToken;
  }

  async _startTicker() {
    if (!this.opts.apiKey || !this.opts.accessToken) return;
    if (this.ticker) return; // already started

    this.ticker = new KiteTicker({
      api_key: this.opts.apiKey,
      access_token: this.opts.accessToken,
    });

    this.ticker.on("ticks", (ticks = []) => {
      for (const t of ticks) {
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
      if (this._pendingSubs?.length) this._subscribeTokens(this._pendingSubs);
    });

    this.ticker.on("disconnect", () => { this.connected = false; });
    this.ticker.connect();
  }

  /** Resolve app symbol -> { token, exchange } from map */
  lookup(symbol) {
    const e = this.map?.[symbol];
    return e ? { token: e.token, exchange: e.exchange } : null;
  }

  symbolFromToken(token) {
    if (!this._rev) {
      this._rev = {};
      for (const [sym, v] of Object.entries(this.map || {})) {
        this._rev[v.token] = sym;
      }
    }
    return this._rev?.[token] || null;
  }

  ltpOf(symbol) {
    const v = this.quoteCache.get(symbol);
    return Number.isFinite(v) ? v : null;
  }

  /** Subscribe to symbols for live LTP stream */
  async subscribe(symbols = []) {
    const toks = symbols.map((s) => this.lookup(s)?.token).filter(Boolean);
    this._pendingSubs = toks;
    if (this.connected) this._subscribeTokens(toks);
  }
  /** Called by marketHub resubscriptions too */
  resubscribe(symbols = []) {
    return this.subscribe(symbols);
  }

  _subscribeTokens(tokens) {
    try {
      if (!this.ticker || !Array.isArray(tokens) || !tokens.length) return;
      this.ticker.subscribe(tokens);
      this.ticker.setMode(this.ticker.modeLTP, tokens);
    } catch (e) {
      console.error("[zerodha] subscribe failed:", e?.message || e);
    }
  }

  // ---- Orders API expected by routes --------------------------------------

  /**
   * Place order (MARKET by default).
   * route usage: adapter.placeOrder(userId, { symbol, side, qty, product, priceType })
   */
  async placeOrder(_userId, { symbol, side, qty, product = "MIS", priceType = "MARKET" }) {
    if (!this.kc || !this.isAuthenticated()) throw new Error("Not authenticated with Zerodha");
    const meta = this.lookup(symbol);
    if (!meta) throw new Error(`Unknown symbol: ${symbol} (instrument map missing)`);

    const tx = side === "BUY" ? "BUY" : "SELL";
    const order = await this.kc.placeOrder("regular", {
      exchange: meta.exchange || "NSE",
      tradingsymbol: symbol,
      transaction_type: tx,
      quantity: qty,
      product,                 // MIS / CNC
      order_type: priceType,   // MARKET / LIMIT
      validity: "DAY",
    });

    return { id: order?.order_id || "" };
  }

  async getPositions(_userId) {
    if (!this.kc || !this.isAuthenticated()) throw new Error("Not authenticated with Zerodha");
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

  async getOrders(_userId) {
    if (!this.kc || !this.isAuthenticated()) throw new Error("Not authenticated with Zerodha");
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

// Keep backward compatibility if somewhere you import default
export default ZerodhaAdapter;
