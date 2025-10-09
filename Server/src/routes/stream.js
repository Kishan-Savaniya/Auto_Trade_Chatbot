import { Router } from "express";
import { snapshotRows } from "../services/marketDataService.js";
export const streamRouter = Router();
streamRouter.get("/sse", (req,res)=>{
  res.writeHead(200, { "Content-Type":"text/event-stream","Cache-Control":"no-cache","Connection":"keep-alive" });
  const iv = setInterval(()=>{
    const data = JSON.stringify({ rows: snapshotRows(), ts: Date.now() });
    res.write("data: "+data+"\n\n");
  }, 1000);
  req.on("close", ()=> clearInterval(iv));
});
