import { randomUUID } from "node:crypto";
export default function correlation(){
  return (req,res,next)=>{
    const id = String(req.headers["x-correlation-id"]||"").trim() || randomUUID();
    req.correlationId = id; res.locals.correlationId = id;
    res.setHeader("X-Correlation-Id", id); next();
  };
}
