import cron from "node-cron";
import { setKillSwitch, setCutoffActive } from "./riskService.js";
import { startReconciler } from "./reconciler.js";
import { cancelAllOpenOrders, closeAllPositions, verifyFlat } from "./eod.js";

let stopRecon=null, jobs=[], cutoff=false;
export function isCutoffActive(){ return cutoff; }

export function bootSchedulers(){
  if (stopRecon) return;
  stopRecon = startReconciler("default");

  // 15:23 IST warn
  jobs.push(cron.schedule("23 15 * * 1-5", ()=>{
    console.log("[EOD] Warning: square-off at 15:25 IST");
  }));

  // 15:25 IST: block, cancel everything open, then reverse any remaining positions
  jobs.push(cron.schedule("25 15 * * 1-5", async ()=>{
    try{
      console.log("[EOD] Square-off started");
      setKillSwitch(true); cutoff = true; setCutoffActive(true);

      const c1 = await cancelAllOpenOrders("default");
      const c2 = await closeAllPositions("default");
      const check = await verifyFlat("default");
      console.log(`[EOD] cancelled=${c1.cancelled} closed=${c2.closed} flat=${check.flat}`);

      if (!check.flat) {
        console.warn("[EOD] Not flat after first pass. Retrying cancel/close after 10s…");
        setTimeout(async ()=>{
          await cancelAllOpenOrders("default");
          await closeAllPositions("default");
          const again = await verifyFlat("default");
          console.log("[EOD] Final flat:", again.flat);
        }, 10_000);
      }
    }catch(e){ console.error("[EOD] error:", e?.message||e); }
  }));
}

export function stopSchedulers(){
  try{ stopRecon && stopRecon(); }catch{}
  for (const j of jobs){ try{ j.stop(); }catch{} }
  jobs=[]; stopRecon=null; cutoff=false; setCutoffActive(false);
}
