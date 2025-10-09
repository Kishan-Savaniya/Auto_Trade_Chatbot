// Lightweight RSI & MACD-ish helpers for simulation

export function calcRSI(prices, period = 14) {
  if (prices.length < period + 1) return 50;
  let gains = 0, losses = 0;
  for (let i = prices.length - period; i < prices.length; i++) {
    const diff = prices[i] - prices[i - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }
  const rs = losses === 0 ? 100 : gains / losses;
  return Math.max(0, Math.min(100, 100 - 100 / (1 + rs)));
}

export function calcMACD(prices, fast = 12, slow = 26, signal = 9) {
  const ema = (arr, period) => {
    const k = 2 / (period + 1);
    let emaVal = arr[0];
    for (let i = 1; i < arr.length; i++) {
      emaVal = arr[i] * k + emaVal * (1 - k);
    }
    return emaVal;
  };
  if (prices.length < slow + signal) return { macd: 0, signal: 0, hist: 0 };
  const last = prices.length - 1;
  const slowArr = prices.slice(last - slow + 1, last + 1);
  const fastArr = prices.slice(last - fast + 1, last + 1);
  const macdLine = ema(fastArr, fast) - ema(slowArr, slow);
  // signal line over last (signal) MACD points – approximate with MACD drift
  const signalLine = macdLine * 0.7;
  return { macd: macdLine, signal: signalLine, hist: macdLine - signalLine };
}
