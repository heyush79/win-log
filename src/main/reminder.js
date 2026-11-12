'use strict';

// Shows the daily reminder. There is deliberately no setTimeout to the reminder time:
// a long timer drifts or is lost across sleep. Instead the rule in lib/schedule.js is
// checked often, and the reminder is shown the first time it says yes on a given day.

const { powerMonitor } = require('electron');
const { shouldPrompt } = require('../lib/schedule');
const { localDate } = require('../lib/dates');

const CHECK_EVERY_MS = 30 * 1000;

/**
 * Starts checking. Call after app 'ready' (powerMonitor needs it).
 * @returns {{ check: () => void }} call check() after the settings change
 */
function startReminder({ store, showReminder }) {
  // Also remembered in memory, so a slow or failed save of lastPromptedDate can
  // never cause a second reminder on the same day.
  let shownOn = null;

  function check() {
    const now = new Date();
    const today = localDate(now);
    if (shownOn === today) return;
    const winsToday = store.getEntries().filter((entry) => entry.date === today).length;
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
