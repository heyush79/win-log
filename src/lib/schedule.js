'use strict';

// The one rule that decides whether to show the daily reminder (see CLAUDE.md).
// There is no timer set for the reminder time. The app checks this rule on start,
// every 30 s, on wake, on unlock and after a settings change, so a reminder missed
// while the machine was asleep or off is shown at the next check on the same day.

const { localDate } = require('./dates');

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** True for "HH:MM" in 24-hour time, e.g. "18:00". */
function isValidTime(value) {
  return typeof value === 'string' && TIME_RE.test(value);
}

/** True for a list of distinct weekday numbers 0–6 (Sunday = 0). An empty list means "off". */
function isValidDays(days) {
  return (
    Array.isArray(days) &&
    days.length <= 7 &&
    days.every((d) => Number.isInteger(d) && d >= 0 && d <= 6) &&
    new Set(days).size === days.length
  );
}

/**
 * Whether to show the reminder now:
 * enabled day AND now >= reminderTime AND lastPromptedDate != today AND no win dated today.
 * Only today is ever considered, so a day that was missed completely is never asked about later.
 * winsToday is the number of wins dated today; if you already added one, there is nothing to ask.
 */
function shouldPrompt(now, { reminderTime, reminderDays, lastPromptedDate }, winsToday = 0) {
  if (!isValidTime(reminderTime) || !Array.isArray(reminderDays)) return false;
  if (!reminderDays.includes(now.getDay())) return false;
  const [hours, minutes] = reminderTime.split(':').map(Number);
  if (now.getHours() * 60 + now.getMinutes() < hours * 60 + minutes) return false;
  if (winsToday > 0) return false;
  return lastPromptedDate !== localDate(now);
}

module.exports = { isValidTime, isValidDays, shouldPrompt };
