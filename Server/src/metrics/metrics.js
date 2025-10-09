import client from "prom-client";
export const registry = new client.Registry();
client.collectDefaultMetrics({ register: registry });

export const counters = {
  ticks: new client.Counter({ name:"at_ticks_total", help:"Market ticks received" }),
  http_errors: new client.Counter({ name:"at_http_errors_total", help:"HTTP 500s" }),
  orders_placed: new client.Counter({ name:"at_orders_placed_total", help:"Orders placed" }),
  reconciles: new client.Counter({ name:"at_reconcile_runs_total", help:"Reconciler runs" }),
  eod_runs: new client.Counter({ name:"at_eod_runs_total", help:"EOD square-off runs" }),
};
registry.registerMetric(counters.ticks);
registry.registerMetric(counters.http_errors);
registry.registerMetric(counters.orders_placed);
registry.registerMetric(counters.reconciles);
registry.registerMetric(counters.eod_runs);
