// Server/src/services/scheduler.js
let cron = null;
try { cron = await import("node-cron"); } catch {}
import { eodWarn, eodSquareOff, eodVerifyFlat } from "./eodService.js";

export function startScheduler(userId = "default") {
  if (cron?.default?.schedule) {
    // 15:23 IST warn
    cron.default.schedule("23 15 * * 1-5", () => eodWarn(userId), { timezone: "Asia/Kolkata" });
    // 15:25 IST square off
    cron.default.schedule("25 15 * * 1-5", () => eodSquareOff(userId), { timezone: "Asia/Kolkata" });
    // 15:26 IST verify flat
    cron.default.schedule("26 15 * * 1-5", () => eodVerifyFlat(userId), { timezone: "Asia/Kolkata" });
  } else {
    // fallback: interval guard every minute
    const iv = setInterval(() => {
      const now = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
      const hhmm = now.slice(-8, -3); // crude HH:MM:SS -> then slice to "HH:MM"
      if (hhmm.startsWith("15:23")) eodWarn(userId);
      if (hhmm.startsWith("15:25")) eodSquareOff(userId);
      if (hhmm.startsWith("15:26")) eodVerifyFlat(userId);
    }, 60_000);
    return () => clearInterval(iv);
  }
  return () => {};
}
