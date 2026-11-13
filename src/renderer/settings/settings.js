'use strict';

// Changes are collected in the form and sent with Save. Saving on every edit is not
// safe here: while a time is being typed, the field briefly holds values like 01:00,
// and the reminder rule would fire on them.
//
// The "Your data" section is different: its buttons act at once (open a folder, save
// a backup, import one), and they never touch the unsaved changes in the form above.

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
const loginApproval = document.getElementById('login-approval');
const saveBtn = document.getElementById('save');
const statusEl = document.getElementById('status');

let saved = null; // settings as last loaded from or saved by the app
let shortcut = null; // shortcut shown in the form, saved or not
let recording = false;
let saving = false;

// ----- Shortcut recording and display -----
// The rules live in src/lib/accelerator.js, shared with the main process.

const { acceleratorFromKeyEvent, formatAccelerator: format } = window.winlogAccelerator;
const formatAccelerator = (accelerator) => format(accelerator, window.winlog.platform);

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
  const accelerator = acceleratorFromKeyEvent(event, window.winlog.platform);
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
  loginApproval.hidden = !view.openAtLoginNeedsApproval;
  renderData(view);
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
      const view = result.settings;
      if ('openAtLogin' in patch && view.openAtLoginApplies && view.openAtLogin !== patch.openAtLogin) {
        setStatus('Saved, but start at login could not be changed. Check your system settings.', true);
      } else {
        setStatus('Saved.');
      }
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

// ----- Your data -----

const dataFolderEl = document.getElementById('data-folder');
const backupOn = document.getElementById('backup-on');
const backupDetails = document.getElementById('backup-details');
const backupFolderEl = document.getElementById('backup-folder');
const backupStatusEl = document.getElementById('backup-status');
const dataStatusEl = document.getElementById('data-status');
const dataButtons = ['open-folder', 'export-backup', 'import-backup', 'choose-folder'].map((id) =>
  document.getElementById(id)
);
const dateTime = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

function setDataStatus(message, isError = false) {
  dataStatusEl.textContent = message;
  dataStatusEl.classList.toggle('error', isError);
}

function renderData(view) {
  dataFolderEl.textContent = view.dataFolder;
  backupOn.checked = Boolean(view.backupFolder);
  backupDetails.hidden = !view.backupFolder;
  backupFolderEl.textContent = view.backupFolder || '';
  backupStatusEl.classList.toggle('error', Boolean(view.backupError));
  if (view.backupError) {
    backupStatusEl.textContent =
      'The last backup could not be saved in this folder. Check that the folder still exists and that Win Log is allowed to use it.';
  } else if (view.backupSavedAt) {
    backupStatusEl.textContent = `Last backup saved: ${dateTime.format(new Date(view.backupSavedAt))}.`;
  } else {
    backupStatusEl.textContent = 'A new backup is saved here on each day that you add or change a win.';
  }
}

const DATA_ERRORS = {
  'data-folder': 'Choose a different folder. That one is where Win Log keeps its own files.',
  'file-busy': 'That file is open in another program. Close it there, or choose another name.',
  'not-a-folder': 'That folder cannot be used. Choose another one.',
  'not-backup': 'That file is not a Win Log backup.',
  'newer-version': 'That backup was made by a newer version of Win Log. Update Win Log, then try again.',
  unreadable: 'That file could not be read.',
};

/** Runs one "Your data" action with the buttons switched off, and reports what happened. */
async function dataAction(action) {
  for (const el of [...dataButtons, backupOn]) el.disabled = true;
  setDataStatus('');
  try {
    const message = await action();
    if (message) setDataStatus(message.text, Boolean(message.isError));
  } catch (err) {
    console.error(err);
    setDataStatus('That did not work. Try again.', true);
  } finally {
    for (const el of [...dataButtons, backupOn]) el.disabled = false;
  }
}

/** The message for a result that is not ok, or null if the user just cancelled. */
function failure(result) {
  if (result.canceled) return null;
  return { text: DATA_ERRORS[result.error] || 'That did not work. Try again.', isError: true };
}

document.getElementById('open-folder').addEventListener('click', () =>
  dataAction(async () => {
    const result = await window.winlog.openDataFolder();
    return result.ok ? null : { text: 'Could not open the folder.', isError: true };
  })
);

document.getElementById('export-backup').addEventListener('click', () =>
  dataAction(async () => {
    const result = await window.winlog.exportBackup();
    if (!result.ok) return failure(result);
    const wins = result.count === 1 ? '1 win' : `${result.count} wins`;
    return { text: `Backup saved as ${result.fileName} (${wins}).` };
  })
);

document.getElementById('import-backup').addEventListener('click', () =>
  dataAction(async () => {
    const result = await window.winlog.importBackup();
    if (result.ok) return { text: result.added === 1 ? 'Imported 1 win.' : `Imported ${result.added} wins.` };
    if (result.error === 'nothing-new') return { text: `Nothing was imported. ${result.summary.join(' ')}` };
    return failure(result);
  })
);

async function chooseBackupFolder() {
  const result = await window.winlog.chooseBackupFolder();
  if (!result.ok) {
    backupOn.checked = !backupDetails.hidden; // back to how it was
    return failure(result);
  }
  renderData(result.settings);
  return result.settings.backupError
    ? { text: 'The folder was chosen, but the first backup could not be saved there.', isError: true }
    : { text: 'Daily backups are on. The first backup is saved.' };
}

backupOn.addEventListener('change', () =>
  dataAction(async () => {
    if (backupOn.checked) return chooseBackupFolder();
    const result = await window.winlog.clearBackupFolder();
    renderData(result.settings);
    return { text: 'Daily backups to that folder are off. The files in it were not removed.' };
  })
);

document.getElementById('choose-folder').addEventListener('click', () => dataAction(chooseBackupFolder));

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
