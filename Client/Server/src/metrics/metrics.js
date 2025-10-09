// Server/src/metrics/metrics.js
// Prometheus metrics with optional dependency.
// If 'prom-client' is available, use it; otherwise provide a stub that
// preserves the same API so the app never crashes.

let client = null;
try {
  client = await import("prom-client").then(m => m.default || m);
} catch {
  client = null; // dependency not installed -> fallback stub
}

/* --------------------------- Registry (real or stub) --------------------------- */

function makeStubRegistry() {
  const lines = [];
  return {
    contentType: "text/plain; version=0.0.4; charset=utf-8",
    registerMetric: () => {},
    async metrics() {
      // Return whatever we buffered (very small set)
      return lines.join("\n") + (lines.length ? "\n" : "");
    },
    _push(line) { lines.push(line); }
  };
}

export const registry = client
  ? new (client.Registry)()
  : makeStubRegistry();

// Collect default metrics if real prom-client
if (client) {
  client.collectDefaultMetrics({ register: registry });
}

/* --------------------------- Metric factories --------------------------- */

function mkCounter(name, help) {
  if (client) {
    const c = new client.Counter({ name, help });
    registry.registerMetric(c);
    return c;
  }
  // stub
  return {
    inc: () => {},
    labels: () => ({ inc: () => {} })
  };
}

function mkHistogram(name, help, buckets = [10,25,50,75,100,150,200,300,500]) {
  if (client) {
    const h = new client.Histogram({ name, help, buckets });
    registry.registerMetric(h);
    return h;
  }
  // stub
  return {
    observe: () => {},
    startTimer: () => () => {},
    labels: () => ({ observe: () => {}, startTimer: () => () => {} }),
  };
}

/* --------------------------- Exported metrics --------------------------- */

export const wsLatency = mkHistogram(
  "ws_pipeline_latency_ms",
  "Tick ingest -> SSE emit latency"
);

export const wsDisconnects = mkCounter(
  "ws_disconnects_total",
  "WebSocket disconnects"
);

export const ordersPlaced = mkCounter(
  "orders_placed_total",
  "Orders placed"
);

export const riskHalts = mkCounter(
  "risk_halts_total",
  "Hard risk halts triggered"
);
