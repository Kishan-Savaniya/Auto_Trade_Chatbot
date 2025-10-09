// Server/src/middleware/correlation.js
// Adds/propagates a correlation id for each request.
// - Reads from "x-correlation-id" if provided by client
// - Otherwise generates a new one via crypto.randomUUID()
// - Exposes id on req.correlationId and res.locals.correlationId
// - Reflects id back in "x-correlation-id" response header

import { randomUUID } from "node:crypto";

export function correlation(options = {}) {
  const headerName = (options.headerName || "x-correlation-id").toLowerCase();

  return function correlationMiddleware(req, res, next) {
    const incoming = String(req.headers[headerName] || "").trim();
    const cid = incoming || safeUUID();

    // attach to request/response for loggers & downstream
    req.correlationId = cid;
    res.locals.correlationId = cid;

    // reflect as response header (canonical header name)
    res.setHeader("X-Correlation-Id", cid);

    // optional: also mirror to request id expected by some loggers
    if (!req.id) req.id = cid;

    // make it easy for custom loggers
    req.getCorrelationId = () => cid;

    next();
  };
}

function safeUUID() {
  try {
    return randomUUID();
  } catch {
    // Extremely old Node fallback (not needed in v24+, but harmless)
    return "cid-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
  }
}

export default correlation;
