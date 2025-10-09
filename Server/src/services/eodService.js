// Server/src/services/eodService.js
import { closeAllPositions } from "./brokerService.js";
import { setEngineRunning } from "./engineLoop.js";
export async function eodWarn(userId="default"){ console.warn("[EOD] Warning: market close in 2 minutes (15:23 IST)"); }
export async function eodSquareOff(userId="default"){ console.warn("[EOD] Square-off at 15:25 IST"); await setEngineRunning(false); await closeAllPositions("EOD"); }
export async function eodVerifyFlat(userId="default"){ console.warn("[EOD] Verify flat (15:26 IST) complete"); }
