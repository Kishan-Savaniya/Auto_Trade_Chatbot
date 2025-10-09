export function makeUpstoxFeed() {
  let unsubscribe = () => {};
  return {
    subscribe(symbols, onTick) {
      // TODO: connect Upstox WebSocket; map tick -> onTick({ symbol, ltp })
      unsubscribe = () => {};
    },
    resubscribe(_symbols) { /* re-subscribe */ },
    close() { unsubscribe(); },
  };
}
