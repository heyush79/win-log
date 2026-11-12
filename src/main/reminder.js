'use strict';

// Shows the daily reminder. There is deliberately no setTimeout to the reminder time:
// a long timer drifts or is lost across sleep. Instead the rule in lib/schedule.js is
// checked often, and the reminder is shown the first time it says yes on a given day.

const { powerMonitor } = require('electron');
const { shouldPrompt } = require('../lib/schedule');
const { localDate } = require('../lib/dates');
const { isUsableEntry } = require('../lib/entries');
const { countOnDate } = require('../lib/group');

const CHECK_EVERY_MS = 30 * 1000;

/**
 * Starts checking. Call after app 'ready' (powerMonitor needs it).
 * @param {object} options
 * @param {object} options.store
 * @param {() => void} options.showReminder
 * @param {() => boolean} [options.isBlocked]  true while the reminder must wait,
 *   e.g. while the first-run welcome window is open
 * @param {() => void} [options.onTick]  called on every check, e.g. to notice a new day
 * @returns {{ check: () => void }} call check() after the settings change
 */
function startReminder({ store, showReminder, isBlocked = () => false, onTick = () => {} }) {
  // Also remembered in memory, so a slow or failed save of lastPromptedDate can
  // never cause a second reminder on the same day.
  let shownOn = null;

  function check() {
    onTick();
    const now = new Date();
    const today = localDate(now);
    if (shownOn === today || isBlocked()) return;
    const winsToday = countOnDate(store.getEntries().filter(isUsableEntry), today);
    if (!shouldPrompt(now, store.getSettings(), winsToday)) return;
    shownOn = today;
    store
      .updateSettings({ lastPromptedDate: today })
      .catch((err) => console.error('Could not save lastPromptedDate:', err));
    showReminder();
  }

  check(); // covers app start, including launch at login after the machine was off
  setInterval(check, CHECK_EVERY_MS);
  powerMonitor.on('resume', check); // woke from sleep
  powerMonitor.on('unlock-screen', check);
  return { check };
}

module.exports = { startReminder };
