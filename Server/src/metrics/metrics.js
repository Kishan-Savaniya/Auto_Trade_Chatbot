import client from "prom-client";
export const registry = new client.Registry();
client.collectDefaultMetrics({ register: registry });

export const wsLatency = new client.Histogram({
  name: "ws_pipeline_latency_ms",
  help: "Tick ingest -> SSE emit latency",
  buckets: [10,25,50,75,100,150,200,300,500]
});
export const wsDisconnects = new client.Counter({ name: "ws_disconnects_total", help: "WS disconnects" });
export const ordersPlaced = new client.Counter({ name: "orders_placed_total", help: "Orders placed" });

registry.registerMetric(wsLatency);
registry.registerMetric(wsDisconnects);
registry.registerMetric(ordersPlaced);
