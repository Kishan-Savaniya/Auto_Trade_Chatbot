import cron from "node-cron";
import { eodWarn, eodSquareOff, eodVerifyFlat } from "./eodService.js";

export function startScheduler(userId="default") {
  // Ensure process env TZ=Asia/Kolkata for node-cron or pass timezone explicitly:
  cron.schedule("23 15 * * 1-5", () => eodWarn(userId),     { timezone: "Asia/Kolkata" });
  cron.schedule("25 15 * * 1-5", () => eodSquareOff(userId),{ timezone: "Asia/Kolkata" });
  cron.schedule("26 15 * * 1-5", () => eodVerifyFlat(userId),{ timezone: "Asia/Kolkata" });
}
