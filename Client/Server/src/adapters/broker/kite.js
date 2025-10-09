export const kiteBroker = {
  async placeOrder({ symbol, side, qty }) {
    // TODO: map to Kite order API
    throw new Error("Kite broker not configured");
  },
  async positions() { return []; },
  async closeAll() { /* iterate positions -> opposite orders */ },
};
