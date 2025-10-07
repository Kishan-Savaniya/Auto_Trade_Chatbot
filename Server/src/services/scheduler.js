import cron from "node-cron";
import { eodWarn, eodSquareOff, eodVerifyFlat } from "./eodService.js";

export function startScheduler() {
  // IST times; ensure TZ=Asia/Kolkata in env or pass tz option
  cron.schedule("23 15 * * 1-5", eodWarn, { timezone: "Asia/Kolkata" });
  cron.schedule("25 15 * * 1-5", eodSquareOff, { timezone: "Asia/Kolkata" });
  cron.schedule("26 15 * * 1-5", eodVerifyFlat, { timezone: "Asia/Kolkata" });
}
