// Server/src/routes/stream.js
import { Router } from "express";
import { marketBus } from "../services/marketHub.js";
import { getSnapshotRows } from "../services/marketDataService.js";

export const streamRouter = Router();

/**
 * GET /api/market/stream
 * Server-Sent Events (SSE). Streams JSON snapshots like: { rows: [...] }
 */
streamRouter.get("/market/stream", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const push = () => {
    const payload = JSON.stringify({ rows: getSnapshotRows() });
    res.write(`event: market\ndata: ${payload}\n\n`);
  };

  // initial
  push();

  const onSnap = () => push();
  marketBus.on("snapshot", onSnap);

  req.on("close", () => {
    marketBus.off("snapshot", onSnap);
    res.end();
  });
});
