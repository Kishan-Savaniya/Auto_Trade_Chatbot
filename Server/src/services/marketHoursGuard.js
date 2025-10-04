// Server/src/services/marketHoursGuard.js
// Auto-start/stop engine strictly by NSE market hours (IST).

import { isMarketOpenIST, isSquareOffWindowIST, nowIST } from "../utils/istTime.js";
import { startLoop, stopLoop, getEngineState } from "./engineLoop.js";
import { closeAllPositions } from "./brokerService.js";
import { getBrokerAdapter, getUserBrokerName } from "./brokers/index.js";

const GUARD_MS = 30_000; // check every 30s
let TIMER = null;

export function startMarketHoursGuard() {
  if (TIMER) return; // idempotent

  TIMER = setInterval(async () => {
    try {
      const open = isMarketOpenIST(nowIST());
      const st = await getEngineState();

      // Optional: respect broker auth before starting
      let brokerReady = true;
      try {
        const broker = getBrokerAdapter(getUserBrokerName());
        if (typeof broker.isAuthenticated === "function") {
          brokerReady = await broker.isAuthenticated("default");
        }
      } catch { /* keep brokerReady = true if adapters not wired yet */ }

      // Market OPEN → ensure engine running (only if broker is ready)
      if (open && !st.running && brokerReady) {
        await startLoop();
        return;
      }

      // Market CLOSED → ensure engine stopped & flat
      if (!open && st.running) {
        // If already in square-off window, force flatten
        if (isSquareOffWindowIST(nowIST())) {
          await closeAllPositions("MARKET_CLOSED");
        }
        await stopLoop();
      }
    } catch (e) {
      console.error("[MarketHoursGuard]", e?.message || e);
    }
  }, GUARD_MS);
}
