import { getBrokerAdapter, getBrokerName } from "./providers.js";
import { Order } from "../models/Order.js";
import { PositionSnapshot } from "../models/PositionSnapshot.js";
import { counters } from "../metrics/metrics.js";

async function localPnLToday() {
  const start = new Date(); start.setHours(0,0,0,0);
  const end = new Date(); end.setHours(23,59,59,999);
  const orders = await Order.find({ createdAt:{ $gte:start, $lte:end } }).lean();
  const by = new Map();
  for (const o of orders) {
    const v = by.get(o.symbol) || { buy:0, sell:0 };
    if (o.side === "BUY") v.buy += (o.price||0)*(o.qty||0);
    else v.sell += (o.price||0)*(o.qty||0);
    by.set(o.symbol, v);
  }
  let net = 0; for (const v of by.values()) net += (v.sell - v.buy);
  return Number(net.toFixed(2));
}

export async function reconcile(userId="default"){
  const A = await getBrokerAdapter();
  const [orders, positions] = await Promise.all([
    A.getOrders?.(userId).catch(()=>[]),
    A.getPositions?.(userId).catch(()=>[])
  ]);

  for (const o of orders){
    if (!o?.brokerOrderId) continue;
    await Order.updateOne(
      { brokerOrderId: o.brokerOrderId },
      { $set: { status: o.status || "OPEN", price: o.price ?? undefined } }
    );
  }

  const netBroker = Number((positions||[]).reduce((s,p)=> s + Number(p.pnl||0), 0).toFixed(2));
  await PositionSnapshot.create({ userId, positions, netPnl: netBroker });
  counters.reconciles.inc();

  const netLocal = await localPnLToday();
  const drift = Number(Math.abs(netLocal - netBroker).toFixed(2));
  if (drift > 0.01) {
    console.warn(`[PARITY] Drift detected: local=${netLocal} vs broker=${netBroker} (drift=${drift})`);
  }

  return { broker:getBrokerName(), orders:orders?.length||0, positions:positions?.length||0, netBrokerPnl: netBroker, netLocalPnl: netLocal, drift };
}

export function startReconciler(userId="default"){
  const iv = setInterval(()=> reconcile(userId).catch(console.error), 30_000);
  return ()=> clearInterval(iv);
}
