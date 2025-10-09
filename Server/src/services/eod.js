import { getBrokerAdapter } from "./providers.js";
import { counters } from "../metrics/metrics.js";

export async function cancelAllOpenOrders(userId="default"){
  const A = await getBrokerAdapter();
  const orders = await A.getOrders?.(userId).catch(()=>[]) || [];
  let cancelled = 0;
  for (const o of orders){
    if (!o?.brokerOrderId) continue;
    const st = (o.status || "").toUpperCase();
    if (st === "OPEN" || st === "TRIGGER PENDING" || st === "PENDING") {
      try { const r = await A.cancelOrder?.(userId, o.brokerOrderId); if (r?.ok) cancelled++; } catch {}
    }
  }
  return { cancelled };
}

export async function closeAllPositions(userId="default"){
  const A = await getBrokerAdapter();
  const ps = await A.getPositions?.(userId).catch(()=>[]) || [];
  let closed = 0;
  for (const p of ps){
    if (!p?.qty) continue;
    const side = (p.type === "LONG" ? "SELL" : "BUY");
    try { await A.placeOrder?.(userId, { symbol:p.symbol, side, qty:p.qty, type:"MARKET" }); closed++; } catch {}
  }
  counters.eod_runs.inc();
  return { closed };
}

export async function verifyFlat(userId="default"){
  const A = await getBrokerAdapter();
  const ps = await A.getPositions?.(userId).catch(()=>[]) || [];
  const open = ps.filter(x => Number(x.qty||0) !== 0);
  return { flat: open.length === 0, openCount: open.length };
}
