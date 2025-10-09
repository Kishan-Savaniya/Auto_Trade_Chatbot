// Server/src/services/marketScheduler.js
// Auto-toggles engine on at 09:15 IST and off at 15:10 IST.
// Uses your existing engineLoop & IST helpers.

import { isMarketOpenIST, nowIST } from "../utils/istTime.js";
import { startLoop, stopLoop } from "./engineLoop.js";
import { closeAllPositions } from "./brokerService.js";
import { sendDailyEodReportIfEnabled } from "./notifyService.js";

let TIMER = null;
let lastOpen = null;

export function enableMarketScheduler() {
  if (process.env.AUTO_MARKET_SCHEDULE === "0") {
    console.log("[Scheduler] disabled via AUTO_MARKET_SCHEDULE=0");
    return;
  }
  if (TIMER) return;

  console.log("[Scheduler] enabled (IST market hours)");

  const tick = async () => {
    try {
      const open = isMarketOpenIST(nowIST());

      // rising edge: market just opened
      if (lastOpen === false && open === true) {
        console.log("[Scheduler] Market open → start engine");
        await startLoop();
      }

      // falling edge: market just closed
      if (lastOpen === true && open === false) {
        console.log("[Scheduler] Market closed → square off & stop engine");
        try {
          await closeAllPositions("SCHEDULER_CLOSE");
        } catch (e) {
          console.warn("[Scheduler] square-off failed:", e?.message || e);
        }
        await stopLoop();

        // Optional: send EOD email if you’ve enabled it in settings
        try {
          await sendDailyEodReportIfEnabled();
        } catch (e) {
          console.warn("[Scheduler] EOD email failed:", e?.message || e);
        }
      }

      lastOpen = open;
      if (lastOpen === null) lastOpen = open; // initialize on first tick
    } catch (e) {
      console.error("[Scheduler] tick error:", e?.message || e);
    }
  };

  // run immediately, then every 20s
  tick();
  TIMER = setInterval(tick, 20_000);
}

export function disableMarketScheduler() {
  if (TIMER) clearInterval(TIMER);
  TIMER = null;
}
