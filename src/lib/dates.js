'use strict';

// Local calendar dates as "YYYY-MM-DD" strings.
// All entry dates are local calendar dates. Never use toISOString() for them:
// it is UTC and files an evening win under the wrong day in many time zones.
//
// Shared by the main process (require) and pages (<script> tag, where it becomes
// window.winlogDates), so it has no imports.

(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.winlogDates = factory();
})(typeof globalThis === 'object' ? globalThis : this, function () {
  const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

  function pad(n) {
    return String(n).padStart(2, '0');
  }

  /** Local date as YYYY-MM-DD. */
  function localDate(d = new Date()) {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  /** Local date and time that is safe in file names, e.g. 2026-11-12T18-05-09. */
  function localFileStamp(d = new Date()) {
    return `${localDate(d)}T${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
  }

  /** "YYYY-MM-DD" to a Date at local midnight, or null if it is not a real date (e.g. 2026-02-30). */
  function parseDate(value) {
    if (typeof value !== 'string') return null;
    const m = DATE_RE.exec(value);
    if (!m) return null;
    const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
    const d = new Date(year, month - 1, day);
    if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) return null;
    return d;
  }

  function isValidDate(value) {
    return parseDate(value) !== null;
  }

  /** The date n days later (or earlier, for negative n). Safe across daylight saving changes. */
  function addDays(date, n) {
    const d = parseDate(date);
    return localDate(new Date(d.getFullYear(), d.getMonth(), d.getDate() + n));
  }

  /**
   * The same day n months later (or earlier). If that month is shorter, the last day of
   * that month is used: 31 Mar minus 1 month is 28 or 29 Feb.
   */
  function addMonths(date, n) {
    const d = parseDate(date);
    const firstOfTarget = new Date(d.getFullYear(), d.getMonth() + n, 1);
    const daysInTarget = new Date(firstOfTarget.getFullYear(), firstOfTarget.getMonth() + 1, 0).getDate();
    return localDate(
      new Date(firstOfTarget.getFullYear(), firstOfTarget.getMonth(), Math.min(d.getDate(), daysInTarget))
    );
  }

  /** The Monday of the week that contains `date` (weeks start on Monday). */
  function weekStart(date) {
    const d = parseDate(date);
    const daysSinceMonday = (d.getDay() + 6) % 7; // Sunday (0) is 6 days after Monday
    return addDays(date, -daysSinceMonday);
  }

  /** First day of the month that contains `date`. */
  function monthStart(date) {
    return `${date.slice(0, 7)}-01`;
  }

  /** Last day of the month that contains `date`. */
  function monthEnd(date) {
    const d = parseDate(date);
    return localDate(new Date(d.getFullYear(), d.getMonth() + 1, 0));
  }

  return {
    localDate,
    localFileStamp,
    parseDate,
    isValidDate,
    addDays,
    addMonths,
    weekStart,
    monthStart,
    monthEnd,
  };
});
