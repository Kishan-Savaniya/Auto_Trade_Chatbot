export const upstoxBroker = {
  async placeOrder({ symbol, side, qty }) { throw new Error("Upstox broker not configured"); },
  async positions() { return []; },
  async closeAll() {},
};
