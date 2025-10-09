// Server/src/adapters/market/mockFeed.js
export function makeMockFeed() {
  let symbols = [];
  let timer = null;
  const subs = new Set();

  const next = (p) => {
    const drift = (Math.random() - 0.5) * 6;
    const revert = (1000 - p) * 0.0005;
    const n = Math.max(50, p + drift + revert);
    return Number(n.toFixed(2));
  };

  // symbol -> price
  const px = new Map();

  function emit() {
    symbols.forEach((s) => {
      const last = px.get(s) ?? 1000 + Math.random() * 1000;
      const ltp = next(last);
      px.set(s, ltp);
      subs.forEach((cb) => cb({ symbol: s, ltp }));
    });
  }

  return {
    subscribe(initSymbols, onTick) {
      symbols = [...initSymbols];
      symbols.forEach((s) => px.set(s, px.get(s) ?? 1000 + Math.random() * 1000));
      subs.add(onTick);
      if (!timer) timer = setInterval(emit, 900);
    },
    resubscribe(newSymbols) { symbols = [...newSymbols]; },
    close() { if (timer) clearInterval(timer); timer = null; subs.clear(); },
  };
}
