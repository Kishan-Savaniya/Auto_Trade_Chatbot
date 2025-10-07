// Server/src/services/scheduler.js
// Zero-dependency daily scheduler for IST market times (Mon–Fri).
// Schedules:
//   15:23 IST -> eodWarn
//   15:25 IST -> eodSquareOff
//   15:26 IST -> eodVerifyFlat
//
// No external packages (like node-cron) required.

import { eodWarn, eodSquareOff, eodVerifyFlat } from "./eodService.js";

// IST is UTC+5:30 (no DST)
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

// Weekdays: Mon=1 ... Fri=5 (JS Date: Sun=0..Sat=6)
function isWeekdayIST(dUtc) {
  const dow = dayOfWeekIST(dUtc); // 0..6 in IST
  return dow >= 1 && dow <= 5;
}

function dayOfWeekIST(dUtc) {
  const istMs = dUtc.getTime() + IST_OFFSET_MS;
  const istDate = new Date(istMs);
  return istDate.getUTCDay(); // 0..6 but representing IST local weekday
}

/**
 * Compute the next UTC timestamp for a given IST time (hh:mm) on a weekday (Mon–Fri).
 * If today's target time has passed (in IST), schedule for the next weekday.
 */
function nextUtcForIstTime(targetHH, targetMM, nowUtc = new Date()) {
  // Convert now to IST components
  const nowIstMs = nowUtc.getTime() + IST_OFFSET_MS;
  const nowIst = new Date(nowIstMs);

  let Y = nowIst.getUTCFullYear();
  let M = nowIst.getUTCMonth();
  let D = nowIst.getUTCDate();

  // Build target IST time for "today"
  let targetIst = new Date(Date.UTC(Y, M, D, targetHH, targetMM, 0, 0));

  // Has target time (in IST) already passed today?
  const passed = nowIst.getTime() > targetIst.getTime();

  // Advance to the next valid weekday if passed or today is weekend
  let attempts = 0;
  while (attempts < 8) {
    // If passed OR not a weekday, move to next day at same time
    if (passed || !isWeekdayIST(new Date(targetIst.getTime() - IST_OFFSET_MS))) {
      targetIst = new Date(targetIst.getTime() + 24 * 60 * 60 * 1000);
      attempts++;
      continue;
    }
    break;
  }

  // Convert the target IST date/time back to UTC milliseconds
  const targetUtcMs = targetIst.getTime() - IST_OFFSET_MS;
  return new Date(targetUtcMs);
}

function scheduleOne(name, userId, hh, mm, job) {
  const now = new Date();
  const when = nextUtcForIstTime(hh, mm, now);
  const delay = Math.max(0, when.getTime() - now.getTime());

  const t = setTimeout(async () => {
    try {
      await job(userId);
    } catch (e) {
      console.error(`[SCHED] job ${name} failed:`, e?.message || e);
    } finally {
      // Reschedule the next occurrence
      timers[name] = scheduleOne(name, userId, hh, mm, job);
    }
  }, delay);

  return t;
}

const timers = Object.create(null);

/**
 * Start EOD scheduler for a given user (default "default").
 * Returns a stop() function to clear timers.
 */
export function startScheduler(userId = "default") {
  // Clear any existing timers before starting
  stopScheduler();

  // 15:23 IST warn
  timers.warn = scheduleOne("warn", userId, 15, 23, eodWarn);
  // 15:25 IST square-off
  timers.square = scheduleOne("square", userId, 15, 25, eodSquareOff);
  // 15:26 IST verify flat
  timers.verify = scheduleOne("verify", userId, 15, 26, eodVerifyFlat);

  return stopScheduler;
}

export function stopScheduler() {
  for (const k of Object.keys(timers)) {
    try { clearTimeout(timers[k]); } catch {}
    delete timers[k];
  }
}
