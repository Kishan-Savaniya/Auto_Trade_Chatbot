import client from "prom-client";
export const registry = new client.Registry();
client.collectDefaultMetrics({ register: registry });
export const wsLatency = new client.Histogram({
  name: "ws_pipeline_latency_ms",
  help: "Tick ingest -> SSE emit latency",
  buckets: [10,25,50,75,100,150,200,300,500]
});
registry.registerMetric(wsLatency);
