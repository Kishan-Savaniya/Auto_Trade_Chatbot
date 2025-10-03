// Server/src/utils/istTime.js
// Single source of truth for IST time & market window helpers.
// Make sure this file contains these functions ONLY ONCE.

const IST_OFFSET_MINUTES = 5 * 60 + 30; // 330

/** Current time in IST as a Date object */
export function nowIST() {
  const now = new Date();
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60_000;
  return new Date(utcMs + IST_OFFSET_MINUTES * 60_000);
}

/** NSE timings: 09:15 — 15:10 IST, Mon–Fri */
export function isMarketOpenIST(date = nowIST()) {
  const day = date.getDay(); // 0 Sun ... 6 Sat
  if (day === 0 || day === 6) return false;
  const mins = date.getHours() * 60 + date.getMinutes();
  return mins >= (9 * 60 + 15) && mins <= (15 * 60 + 10);
}

/** Square-off window (>= 15:10 IST) */
export function isSquareOffWindowIST(date = nowIST()) {
  const mins = date.getHours() * 60 + date.getMinutes();
  return mins >= (15 * 60 + 10);
}

/** "yyyy-mm-dd" for IST day */
export function todayKeyIST(date = nowIST()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * UTC [startUTC, endUTC) corresponding to the IST day containing `refDate`.
 * Start = 00:00 IST; End = next-day 00:00 IST (exclusive).
 */
export function istDayRangeUTC(refDate = nowIST()) {
  const y = refDate.getFullYear();
  const m = refDate.getMonth();
  const d = refDate.getDate();
  // 00:00 IST converted to UTC by subtracting 05:30
  const startUTC = new Date(Date.UTC(y, m, d, -5, -30, 0, 0));
  const endUTC = new Date(startUTC.getTime() + 24 * 60 * 60 * 1000);
  return { startUTC, endUTC };
}

/** Returns a new Date moved by `days` (preserves time-of-day). */
export function shiftISTDays(date, days) {
  const copy = new Date(date.getTime());
  copy.setDate(copy.getDate() + days);
  return copy;
}

export default {
  nowIST,
  isMarketOpenIST,
  isSquareOffWindowIST,
  todayKeyIST,
  istDayRangeUTC,
  shiftISTDays,
};
