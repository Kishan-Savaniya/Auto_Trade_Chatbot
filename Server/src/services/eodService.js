import { getBrokerAdapter } from "./providers.js";
// You will square-off positions using broker-specific API (cancel/market exit).

export async function eodWarn(userId) {
  console.log("[EOD] Warning: 15:23 IST");
  // Optionally send notification via notifyService
}
export async function eodSquareOff(userId) {
  console.log("[EOD] Square-off at 15:25 IST");
  const A = getBrokerAdapter();
  const positions = await A.getPositions?.(userId) || [];
  // TODO: for each non-zero position, place opposite MARKET order to flatten
}
export async function eodVerifyFlat(userId) {
  const A = getBrokerAdapter();
  const positions = await A.getPositions?.(userId) || [];
  const open = positions.filter(p => (p.qty || 0) > 0);
  if (open.length) {
    console.error("[EOD] Not flat after 15:26 IST", open);
    // optionally alert + try again
  } else {
    console.log("[EOD] Flat verified");
  }
}
