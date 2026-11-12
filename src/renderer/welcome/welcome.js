'use strict';

// Welcome: shown once, on the first run. Explains the app in a few lines, lets the
// user pick the reminder time and days, and leads straight to the first win.

const { formatAccelerator } = window.winlogAccelerator;
const isMac = window.winlog.platform === 'darwin';
const TIME_RE = /^\d{2}:\d{2}$/;

const form = document.getElementById('form');
const timeEl = document.getElementById('reminder-time');
const dayEls = [...document.querySelectorAll('input[name="day"]')];
const shortcutEl = document.getElementById('shortcut-text');
const folderEl = document.getElementById('data-folder');
const startBtn = document.getElementById('start');
const statusEl = document.getElementById('status');

let saved = null; // settings as loaded
let busy = false;

document.getElementById(isMac ? 'where-mac' : 'where-win').hidden = false;

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle('error', isError);
}

function chosenDays() {
  return dayEls
    .filter((el) => el.checked)
    .map((el) => Number(el.value))
    .sort((a, b) => a - b);
}

function update() {
  const noDays = chosenDays().length === 0;
  timeEl.disabled = noDays; // no days means no reminder, so the time does not matter
  const timeOk = noDays || TIME_RE.test(timeEl.value);
  startBtn.disabled = busy || !saved || !timeOk;
  if (!timeOk) setStatus('Enter a time for the reminder.', true);
  else if (statusEl.classList.contains('error')) setStatus('');
}

function render(settings, info) {
  saved = settings;
  timeEl.value = settings.reminderTime;
  for (const el of dayEls) el.checked = settings.reminderDays.includes(Number(el.value));
  const keys = formatAccelerator(settings.shortcut, window.winlog.platform);
  shortcutEl.textContent = settings.shortcutActive
    ? `Press ${keys} at any time to add a win. You can change the keys in Settings.`
    : `The shortcut ${keys} is used by another app. You can choose different keys in Settings.`;
  folderEl.textContent = info.dataFolder;
  // Someone who copied their wins to this computer already has wins.
  if (info.winCount > 0) startBtn.textContent = 'Add a win';
  update();
}

form.addEventListener('input', update);
form.addEventListener('change', update);

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (busy || startBtn.disabled) return;
  busy = true;
  update();
  try {
    const days = chosenDays();
    const changes = {};
    if (JSON.stringify(days) !== JSON.stringify(saved.reminderDays)) changes.reminderDays = days;
    if (days.length > 0 && timeEl.value !== saved.reminderTime) changes.reminderTime = timeEl.value;
    if (Object.keys(changes).length > 0) await window.winlog.updateSettings(changes);
    await window.winlog.openWindow('entry');
    window.close();
  } catch (err) {
    console.error(err);
    busy = false;
    setStatus('Could not save your choices. Try again.', true);
    startBtn.disabled = false;
  }
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') window.close();
});

Promise.all([window.winlog.getSettings(), window.winlog.getAppInfo()])
  .then(([settings, info]) => render(settings, info))
  .catch((err) => {
    console.error(err);
    setStatus('Could not load your settings. Close this window and open Settings from the Win Log menu.', true);
  });
