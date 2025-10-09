// Server/src/middleware/correlation.js
import { randomUUID } from "node:crypto";
export default function correlation(options = {}) {
  const header = (options.headerName || "x-correlation-id").toLowerCase();
  return function(req, res, next) {
    const cid = String(req.headers[header] || "").trim() || randomUUID();
    req.correlationId = cid;
    res.locals.correlationId = cid;
    res.setHeader("X-Correlation-Id", cid);
    if (!req.id) req.id = cid;
    next();
  };
}
