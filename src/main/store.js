'use strict';

// The only code that reads or writes wins.json and settings.json. No Electron
// imports, so it can be unit tested with plain Node.
//
// Data safety rules (see CLAUDE.md):
// - Every save writes a temp file, fsyncs it, then renames it over the real file.
//   A rename is atomic, so the file is always either the old or the new version.
// - Saves of both files run one at a time through a single queue.
// - An unreadable wins.json is never overwritten. It is moved aside and the newest
//   good backup is loaded.
// - Before the first save of each day, wins.json is copied to backups/.

const fsp = require('node:fs/promises');
const path = require('node:path');
const { localDate, localFileStamp } = require('../lib/dates');
const { isValidTime, isValidDays } = require('../lib/schedule');
const {
  defaultShortcut,
  isValidAccelerator,
  LEGACY_DEFAULT_SHORTCUT,
} = require('../lib/accelerator');

const SCHEMA_VERSION = 1;
const BACKUPS_KEPT = 14;
const BACKUP_NAME_RE = /^wins-\d{4}-\d{2}-\d{2}\.json$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function emptyData() {
  return { schemaVersion: SCHEMA_VERSION, entries: [] };
}

/** Settings used when settings.json is missing or a field in it is invalid. */
function defaultSettings(platform = process.platform) {
  return {
    reminderTime: '18:00',
    reminderDays: [1, 2, 3, 4, 5], // Mon–Fri; an empty list turns the reminder off
    shortcut: defaultShortcut(platform),
    openAtLogin: true, // what the user chose; the OS login item is the source of truth (loginItem.js)
    loginItemSetUp: false, // true once the installed app has set up the login item on its first run
    lastPromptedDate: null,
  };
}

/** Returns complete settings: every missing or invalid field is replaced by its default. */
function normalizeSettings(raw, platform = process.platform) {
  const s = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const d = defaultSettings(platform);
  return {
    ...s, // keep fields that a newer version may have added
    reminderTime: isValidTime(s.reminderTime) ? s.reminderTime : d.reminderTime,
    reminderDays: isValidDays(s.reminderDays) ? [...s.reminderDays].sort((a, b) => a - b) : d.reminderDays,
    // The pre-1.0 default clashed with "Close window" in browsers; nobody chose it on purpose.
    shortcut:
      isValidAccelerator(s.shortcut) && s.shortcut !== LEGACY_DEFAULT_SHORTCUT ? s.shortcut : d.shortcut,
    openAtLogin: typeof s.openAtLogin === 'boolean' ? s.openAtLogin : d.openAtLogin,
    loginItemSetUp: s.loginItemSetUp === true,
    lastPromptedDate:
      typeof s.lastPromptedDate === 'string' && DATE_RE.test(s.lastPromptedDate)
        ? s.lastPromptedDate
        : null,
  };
}

/**
 * Parses wins.json text. Returns the data, or null if it is not a valid wins file.
 * Throws if the file comes from a newer version of the app, because overwriting
 * it could drop fields this version does not know about.
 */
function parseWins(raw) {
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!data || typeof data !== 'object' || !Array.isArray(data.entries)) return null;
  if (typeof data.schemaVersion !== 'number') return null;
  if (data.schemaVersion > SCHEMA_VERSION) {
    const err = new Error(
      `wins.json was written by a newer version of Win Log (format ${data.schemaVersion}). ` +
        'Please install the newer version.'
    );
    err.code = 'NEWER_SCHEMA';
    throw err;
  }
  return data;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// On Windows, antivirus or the search indexer can hold the file for a moment.
async function renameWithRetry(from, to) {
  for (let attempt = 1; ; attempt++) {
    try {
      await fsp.rename(from, to);
      return;
    } catch (err) {
      const busy = err.code === 'EPERM' || err.code === 'EBUSY' || err.code === 'EACCES';
      if (!busy || attempt >= 10) throw err;
      await sleep(50 * attempt);
    }
  }
}

// Makes the rename itself durable. Not possible on Windows, and not required there.
async function syncDir(dir) {
  if (process.platform === 'win32') return;
  let fh;
  try {
    fh = await fsp.open(dir, 'r');
    await fh.sync();
  } catch {
    // Best effort: the data file itself is already fsynced.
  } finally {
    await fh?.close();
  }
}

/** Writes JSON to `file` so that a crash leaves either the old or the new file, never half of one. */
async function writeJsonAtomic(file, value) {
  const tmp = `${file}.tmp`;
  const json = `${JSON.stringify(value, null, 2)}\n`;
  const fh = await fsp.open(tmp, 'w');
  try {
    await fh.writeFile(json, 'utf8');
    await fh.sync();
  } finally {
    await fh.close();
  }
  await renameWithRetry(tmp, file);
  await syncDir(path.dirname(file));
}

async function exists(file) {
  try {
    await fsp.access(file);
    return true;
  } catch {
    return false;
  }
}

/**
 * @param {string} dir  folder that holds wins.json (the app's userData folder)
 * @param {{ now?: () => Date, platform?: string }} [options]  both are for tests
 */
function createStore(dir, { now = () => new Date(), platform = process.platform } = {}) {
  const winsPath = path.join(dir, 'wins.json');
  const settingsPath = path.join(dir, 'settings.json');
  const backupDir = path.join(dir, 'backups');

  let data = null;
  let settings = null;
  let queue = Promise.resolve(); // never rejects
  let backedUpOn = null; // local date of the last backup this session

  /** Runs tasks one at a time. The returned promise rejects if this task fails; the queue keeps going. */
  function enqueue(task) {
    const run = queue.then(task);
    queue = run.catch(() => {});
    return run;
  }

  async function listBackups() {
    try {
      const names = await fsp.readdir(backupDir);
      return names.filter((n) => BACKUP_NAME_RE.test(n)).sort(); // oldest first
    } catch (err) {
      if (err.code === 'ENOENT') return [];
      throw err;
    }
  }

  async function newestGoodBackup() {
    const names = (await listBackups()).reverse();
    for (const name of names) {
      const file = path.join(backupDir, name);
      try {
        const backup = parseWins(await fsp.readFile(file, 'utf8'));
        if (backup) return { file, data: backup };
      } catch {
        // Unreadable or from a newer version: try the next older one.
      }
    }
    return null;
  }

  async function backupIfNeeded() {
    const today = localDate(now());
    if (backedUpOn === today) return;
    const target = path.join(backupDir, `wins-${today}.json`);
    if (!(await exists(target)) && (await exists(winsPath))) {
      await fsp.mkdir(backupDir, { recursive: true });
      // Copy to a temp name first so a crash cannot leave a half-copied backup.
      await fsp.copyFile(winsPath, `${target}.tmp`);
      await renameWithRetry(`${target}.tmp`, target);
      const names = await listBackups();
      for (const old of names.slice(0, Math.max(0, names.length - BACKUPS_KEPT))) {
        await fsp.rm(path.join(backupDir, old), { force: true });
      }
    }
    if (await exists(winsPath)) backedUpOn = today;
  }

  /**
   * Loads wins.json. Call once before anything else.
   * Resolves to { recovered: null } normally, or to
   * { recovered: { corruptFile, backupFile } } if wins.json could not be read.
   * backupFile is null if no good backup existed. Rejects (without changing
   * any file) if the file is from a newer version or cannot be read at all.
   */
  async function load() {
    await fsp.mkdir(dir, { recursive: true });

    let raw;
    try {
      raw = await fsp.readFile(winsPath, 'utf8');
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
      data = emptyData(); // first run
      return { recovered: null };
    }

    const parsed = parseWins(raw);
    if (parsed) {
      data = parsed;
      return { recovered: null };
    }

    // Unreadable: keep it for the user, never overwrite it.
    const corruptFile = path.join(dir, `wins.corrupt-${localFileStamp(now())}.json`);
    await renameWithRetry(winsPath, corruptFile);
    const backup = await newestGoodBackup();
    data = backup ? backup.data : emptyData();
    // Write the recovered data back now, so the next start does not begin empty.
    await writeJsonAtomic(winsPath, data);
    return { recovered: { corruptFile, backupFile: backup ? backup.file : null } };
  }

  function getEntries() {
    if (!data) throw new Error('store.load() has not finished');
    return data.entries;
  }

  /** Appends entries and saves. Memory is only updated after the file is safely written. */
  function addEntries(newEntries) {
    return enqueue(async () => {
      const next = { ...data, entries: [...getEntries(), ...newEntries] };
      await backupIfNeeded();
      await writeJsonAtomic(winsPath, next);
      data = next;
    });
  }

  /**
   * Loads settings.json. A missing file means defaults. An unreadable one is moved
   * to settings.corrupt-<timestamp>.json and defaults are used; settings are easy to
   * set again, so this does not stop the app. Rejects only if the file cannot be read.
   */
  async function loadSettings() {
    let raw;
    try {
      raw = await fsp.readFile(settingsPath, 'utf8');
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
      settings = normalizeSettings({}, platform);
      return;
    }
    try {
      settings = normalizeSettings(JSON.parse(raw), platform);
    } catch {
      const corruptFile = path.join(dir, `settings.corrupt-${localFileStamp(now())}.json`);
      await renameWithRetry(settingsPath, corruptFile);
      settings = normalizeSettings({}, platform);
    }
  }

  /** Returns a copy of the current settings. */
  function getSettings() {
    if (!settings) throw new Error('store.loadSettings() has not finished');
    return { ...settings, reminderDays: [...settings.reminderDays] };
  }

  /** Merges `patch` into the settings and saves. Memory is only updated after the file is written. */
  function updateSettings(patch) {
    return enqueue(async () => {
      const next = normalizeSettings({ ...getSettings(), ...patch }, platform);
      await writeJsonAtomic(settingsPath, next);
      settings = next;
    });
  }

  /** Resolves when every queued save has finished. */
  function flush() {
    return queue;
  }

  return {
    load,
    getEntries,
    addEntries,
    loadSettings,
    getSettings,
    updateSettings,
    flush,
    paths: { winsPath, settingsPath, backupDir },
  };
}

module.exports = {
  createStore,
  writeJsonAtomic,
  parseWins,
  normalizeSettings,
  defaultSettings,
  SCHEMA_VERSION,
  BACKUPS_KEPT,
};
