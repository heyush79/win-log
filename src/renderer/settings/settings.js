'use strict';

// Changes are collected in the form and sent with Save. Saving on every edit is not
// safe here: while a time is being typed, the field briefly holds values like 01:00,
// and the reminder rule would fire on them.

const isMac = window.winlog.platform === 'darwin';
const DEFAULT_DAYS = [1, 2, 3, 4, 5];
const TIME_RE = /^\d{2}:\d{2}$/;
const HINT = 'Click, then press the new keys.';
const RECORD_HINT = isMac
  ? 'Press a key with ⌘, ⌃ or ⌥. Esc cancels.'
  : 'Press a key with Ctrl or Alt. Esc cancels.';

const form = document.getElementById('form');
const reminderOn = document.getElementById('reminder-on');
const details = document.getElementById('reminder-details');
const timeEl = document.getElementById('reminder-time');
const dayEls = [...document.querySelectorAll('input[name="day"]')];
const shortcutBtn = document.getElementById('shortcut');
const shortcutHint = document.getElementById('shortcut-hint');
const shortcutWarning = document.getElementById('shortcut-warning');
const loginEl = document.getElementById('open-at-login');
const loginNote = document.getElementById('login-note');
const saveBtn = document.getElementById('save');
const statusEl = document.getElementById('status');

let saved = null; // settings as last loaded from or saved by the app
let shortcut = null; // shortcut shown in the form, saved or not
let recording = false;
let saving = false;

// ----- Shortcut recording and display -----

const NAMED_KEYS = {
  Space: 'Space',
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  Home: 'Home',
  End: 'End',
  PageUp: 'PageUp',
  PageDown: 'PageDown',
  Insert: 'Insert',
  Delete: 'Delete',
  Minus: '-',
  Equal: '=',
  BracketLeft: '[',
  BracketRight: ']',
  Backslash: '\\',
  Semicolon: ';',
  Quote: "'",
  Comma: ',',
  Period: '.',
  Slash: '/',
  Backquote: '`',
};

// event.code names the physical key, so Shift+1 is recorded as "Shift+1", not "!".
function keyFromCode(code) {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit\d$/.test(code)) return code.slice(5);
  if (/^F([1-9]|1\d|2[0-4])$/.test(code)) return code;
  return NAMED_KEYS[code] ?? null;
}

/** Electron accelerator for a key press, or null if it is not usable as a shortcut. */
function acceleratorFromEvent(event) {
  const key = keyFromCode(event.code);
  if (!key) return null;
  if (!isMac && event.metaKey) return null; // Windows-key shortcuts belong to Windows
  const parts = [];
  if (isMac ? event.metaKey : event.ctrlKey) parts.push('CommandOrControl');
  if (isMac && event.ctrlKey) parts.push('Control');
  if (event.altKey) parts.push('Alt');
  if (event.shiftKey) parts.push('Shift');
  if (!parts.some((p) => p !== 'Shift')) return null; // Shift alone would block typing
  return [...parts, key].join('+');
}

const MAC_SYMBOLS = { Control: '⌃', Alt: '⌥', Shift: '⇧', CommandOrControl: '⌘' };
const MAC_ORDER = ['Control', 'Alt', 'Shift', 'CommandOrControl'];
const WIN_NAMES = { CommandOrControl: 'Ctrl', Control: 'Ctrl' };

function formatAccelerator(accelerator) {
  const parts = accelerator.split('+');
  const key = parts.pop();
  if (isMac) {
    parts.sort((a, b) => MAC_ORDER.indexOf(a) - MAC_ORDER.indexOf(b));
    return parts.map((p) => MAC_SYMBOLS[p] ?? p).join('') + key;
  }
  return [...parts.map((p) => WIN_NAMES[p] ?? p), key].join('+');
}

function startRecording() {
  recording = true;
  shortcutBtn.classList.add('recording');
  shortcutBtn.textContent = 'Press keys…';
  shortcutHint.textContent = RECORD_HINT;
  update();
}

function stopRecording() {
  recording = false;
  shortcutBtn.classList.remove('recording');
  shortcutBtn.textContent = formatAccelerator(shortcut);
  shortcutHint.textContent = HINT;
  update();
}

shortcutBtn.addEventListener('click', () => (recording ? stopRecording() : startRecording()));
shortcutBtn.addEventListener('blur', () => recording && stopRecording());
shortcutBtn.addEventListener('keydown', (event) => {
  if (!recording || event.key === 'Tab') return; // Tab still moves focus
  // Keep the keys from reaching the page and the app menu (⌘Q, ⌘W) while recording.
  event.preventDefault();
  event.stopPropagation();
  if (event.key === 'Escape') {
    stopRecording();
    return;
  }
  const accelerator = acceleratorFromEvent(event);
  if (accelerator) {
    shortcut = accelerator;
    stopRecording();
  }
});

// ----- Form state -----

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle('error', isError);
}

function formState() {
  const days = dayEls.filter((el) => el.checked).map((el) => Number(el.value));
  return {
    reminderTime: timeEl.value,
    reminderDays: reminderOn.checked ? days.sort((a, b) => a - b) : [],
    shortcut,
    openAtLogin: loginEl.checked,
  };
}

/** The settings that differ from what is saved. */
function changes() {
  const state = formState();
  const patch = {};
  for (const [key, value] of Object.entries(state)) {
    if (JSON.stringify(value) !== JSON.stringify(saved[key])) patch[key] = value;
  }
  return patch;
}

function update() {
  if (!saved) return;
  details.classList.toggle('off', !reminderOn.checked);
  timeEl.disabled = !reminderOn.checked;
  for (const el of dayEls) el.disabled = !reminderOn.checked;
  const timeOk = TIME_RE.test(timeEl.value);
  saveBtn.disabled = saving || recording || !timeOk || Object.keys(changes()).length === 0;
  if (!timeOk) setStatus('Enter a reminder time.', true);
}

function render(view) {
  saved = {
    reminderTime: view.reminderTime,
    reminderDays: view.reminderDays,
    shortcut: view.shortcut,
    openAtLogin: view.openAtLogin,
  };
  timeEl.value = view.reminderTime;
  reminderOn.checked = view.reminderDays.length > 0;
  // When the reminder is off, the days show the default it comes back with.
  const days = view.reminderDays.length > 0 ? view.reminderDays : DEFAULT_DAYS;
  for (const el of dayEls) el.checked = days.includes(Number(el.value));
  shortcut = view.shortcut;
  shortcutBtn.textContent = formatAccelerator(shortcut);
  shortcutWarning.hidden = view.shortcutActive;
  shortcutWarning.textContent = view.shortcutActive
    ? ''
    : `${formatAccelerator(view.shortcut)} could not be set up. Another app may be using it. Choose a different shortcut.`;
  loginEl.checked = view.openAtLogin;
  loginNote.hidden = view.openAtLoginApplies;
  update();
}

reminderOn.addEventListener('change', () => {
  if (reminderOn.checked && !dayEls.some((el) => el.checked)) {
    for (const el of dayEls) el.checked = DEFAULT_DAYS.includes(Number(el.value));
  }
  update();
});

// No days selected is the same as the reminder being off.
for (const el of dayEls) {
  el.addEventListener('change', () => {
    if (!dayEls.some((d) => d.checked)) reminderOn.checked = false;
    update();
  });
}

form.addEventListener('input', () => {
  if (!saving) setStatus('');
  update();
});
form.addEventListener('change', update);

// ----- Save -----

async function save() {
  if (!saved || saving || recording || saveBtn.disabled) return;
  const patch = changes();
  saving = true;
  update();
  setStatus('Saving…');
  try {
    const result = await window.winlog.updateSettings(patch);
    if (result.ok) {
      render(result.settings);
      setStatus('Saved.');
    } else {
      setStatus(
        `${formatAccelerator(patch.shortcut)} is not available. Another app may be using it. ` +
          'Choose a different shortcut. Nothing was saved.',
        true
      );
    }
  } catch (err) {
    console.error(err);
    setStatus('Could not save settings. Try again.', true);
  } finally {
    saving = false;
    update();
  }
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  save();
});

document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  const unsaved = saved && Object.keys(changes()).length > 0;
  if (!unsaved || window.confirm('Discard your changes?')) window.close();
});

window.winlog
  .getSettings()
  .then(render)
  .catch((err) => {
    console.error(err);
    setStatus('Could not load settings.', true);
  });
