export function renderDailyHtml({ date, pnl=0, orders=[], risk={} }){
  return `<!doctype html><html><head><meta charset="utf-8"><title>Daily Report</title></head>
  <body><h1>Daily Report - ${date}</h1>
  <p>Net PnL: <b>${(Number(pnl)||0).toFixed(2)}</b></p>
  <h2>Orders</h2>
  <table border="1" cellpadding="6"><tr><th>Time</th><th>Symbol</th><th>Side</th><th>Qty</th><th>Price</th><th>Status</th></tr>
  ${orders.map(o=>`<tr><td>${o.createdAt?new Date(o.createdAt).toLocaleTimeString():"-"}</td><td>${o.symbol||""}</td><td>${o.side||""}</td><td>${o.qty||""}</td><td>${o.price??""}</td><td>${o.status||""}</td></tr>`).join("")}
  </table></body></html>`;
}
