'use strict';

/**
 * Shared date-range resolver for dashboard/analytics endpoints.
 *
 * Accepts either a named preset (?range=today|7d|30d|60d) or an explicit
 * custom range (?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD, both required —
 * a lone start_date or end_date is ignored and falls back to the default).
 * Also computes the immediately-preceding period of equal length, so callers
 * can show a trend ("+12% vs previous period") without duplicating the
 * day-math in every controller.
 *
 * Deliberately NOT used for "current state" counts (e.g. "reports currently
 * pending", "reports currently escalated") — those are point-in-time queue
 * depth, not period activity, and stay unfiltered by date range everywhere
 * they're used.
 *
 * Timezone: the DB stores UTC (Cloud SQL NOW() is UTC) but ParkWatch is a
 * Manila system (credit: Ryan, 9f7b6a7) — a report submitted 2am PHT is
 * 18:00 UTC the *previous* day. Cutting "today" at UTC midnight would
 * misfile every early-morning report and make a "Today" filter show
 * yesterday's data until 8am. "today" here is always computed in Asia/Manila
 * (UTC+8, no DST); callers must match it on the SQL side with
 * DATE(CONVERT_TZ(col, '+00:00', '+08:00')) BETWEEN ? AND ? rather than
 * DATE(col), or the app-side and DB-side "today" will disagree.
 */

const PRESET_DAYS = { today: 0, '7d': 6, '30d': 29, '60d': 59 };
const DEFAULT_PRESET = '30d';
const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const toISODate = (d) => d.toISOString().slice(0, 10);

// "Today" in Asia/Manila, not the server/container's local time.
const manilaToday = () => toISODate(new Date(Date.now() + MANILA_OFFSET_MS));

const addDays = (isoDate, days) => {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return toISODate(d);
};

// A malformed or reversed custom range (bad client input, not a bug) should
// fall back to the default preset rather than produce a nonsense/500 query.
const isValidCustomRange = (start, end) =>
  ISO_DATE_RE.test(start ?? '') && ISO_DATE_RE.test(end ?? '') && start <= end;

/** @returns {{startDate: string, endDate: string, prevStartDate: string, prevEndDate: string, label: string, preset: string|null}} */
function resolveDateRange(query = {}) {
  const { range, start_date, end_date } = query;
  const today = manilaToday();

  let startDate;
  let endDate;
  let preset = null;

  if (isValidCustomRange(start_date, end_date)) {
    startDate = start_date;
    endDate = end_date;
  } else {
    preset = PRESET_DAYS[range] != null ? range : DEFAULT_PRESET;
    startDate = addDays(today, -PRESET_DAYS[preset]);
    endDate = today;
  }

  const spanDays = Math.round((new Date(`${endDate}T00:00:00Z`) - new Date(`${startDate}T00:00:00Z`)) / 86400000) + 1;
  const prevEndDate = addDays(startDate, -1);
  const prevStartDate = addDays(prevEndDate, -(spanDays - 1));

  const label = startDate === endDate ? startDate : `${startDate} to ${endDate}`;

  return { startDate, endDate, prevStartDate, prevEndDate, label, preset };
}

/** Percentage change from prev -> current, rounded to a whole number. Null if prev is 0 (undefined direction, not "infinite"). */
function trendPct(current, previous) {
  const cur = Number(current) || 0;
  const prev = Number(previous) || 0;
  if (prev === 0) return cur === 0 ? 0 : null;
  return Math.round(((cur - prev) / prev) * 100);
}

/**
 * Wraps a SQL column expression to convert its stored UTC datetime to
 * Asia/Manila before taking DATE() of it, so `DATE(mnl('r.submitted_at'))
 * BETWEEN ? AND ?` lines up with the Manila-local startDate/endDate this
 * module produces. Always use this instead of a bare DATE(col) in any query
 * filtered by a resolveDateRange() result.
 */
const mnl = (col) => `CONVERT_TZ(${col}, '+00:00', '+08:00')`;

module.exports = { resolveDateRange, trendPct, mnl };
