export function makeAngelFeed() {
  let unsubscribe = () => {};
  return {
    subscribe(symbols, onTick) {
      // TODO: connect Angel One SmartAPI WS; map tick -> onTick({ symbol, ltp })
      unsubscribe = () => {};
    },
    resubscribe(_symbols) { /* re-subscribe */ },
    close() { unsubscribe(); },
  };
}
