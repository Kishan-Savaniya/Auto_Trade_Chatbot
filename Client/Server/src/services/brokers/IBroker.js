// src/brokers/IBroker.js
export class IBroker {
  // OAuth or API-key session init; returns { loggedIn, userId }
  async connect() { throw new Error('not impl'); }

  // Symbols -> broker tokens; subscribe to LTP stream
  async subscribe(symbols = [], onTick = () => {}) { throw new Error('not impl'); }
  // Get latest LTP synchronously if needed
  async ltp(symbol) { throw new Error('not impl'); }

  // Order lifecycle
  async placeOrder({ symbol, side, qty, type='MARKET', product='MIS' }) { throw new Error('not impl'); }
  async positions() { throw new Error('not impl'); }
  async orders() { throw new Error('not impl'); }
  async closeAll() { throw new Error('not impl'); }

  // Cleanup
  async disconnect() {}
}
