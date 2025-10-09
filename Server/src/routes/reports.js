import { Router } from "express";
import { buildDailyReport, storeReport, emailReport } from "../services/reporting.js";

export const reportsRouter = Router();

reportsRouter.get("/today", async (_req,res)=>{
  try{
    const r = await buildDailyReport();
    await storeReport(r).catch(()=>({}));
    await emailReport(r).catch(()=>({}));
    res.json({ ok:true, date:r.date, sizeHtml:r.html.length, sizeJson:r.json.length });
  }catch(e){
    res.status(500).json({ ok:false, error: e?.message || "failed" });
  }
});
