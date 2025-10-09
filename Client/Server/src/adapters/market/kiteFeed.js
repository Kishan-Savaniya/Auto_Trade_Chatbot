// Wire to Zerodha Kite Ticker when keys are ready
export function makeKiteFeed() {
  let symbols = [];
  let unsubscribe = () => {};
  return {
    subscribe(initSymbols, onTick) {
      symbols = [...initSymbols];
      // TODO: use Kite Connect Ticker here. Map ticks -> onTick({symbol, ltp})
      // ticker.on('ticks', (arr) => arr.forEach(t => onTick({ symbol: mapToken(t.instrument_token), ltp: t.last_price })));
      // ticker.subscribe(tokens); ticker.setMode(ticker.modeLTP, tokens);
      unsubscribe = () => { /* ticker.unsubscribe(tokens) */ };
    },
    resubscribe(newSymbols) { symbols = [...newSymbols]; /* re-subscribe with tokens */ },
    close() { unsubscribe(); },
  };
}
