import { v4 as uuid } from "uuid";

export function correlation() {
  return (req, res, next) => {
    const cid = req.headers["x-correlation-id"] || uuid();
    req.correlationId = cid;
    res.setHeader("X-Correlation-Id", cid);
    next();
  };
}
