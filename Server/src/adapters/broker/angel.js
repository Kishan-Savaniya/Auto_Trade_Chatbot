export const angelBroker = {
  async placeOrder({ symbol, side, qty }) { throw new Error("Angel broker not configured"); },
  async positions() { return []; },
  async closeAll() {},
};
