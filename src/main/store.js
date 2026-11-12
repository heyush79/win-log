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
// - The live data never leaves this folder. The optional "backup folder" only gets copies.

const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { localDate, localFileStamp } = require('../lib/dates');
const { isValidTime, isValidDays } = require('../lib/schedule');
const { editEntry: editEntryData, deleteEntry: deleteEntryData } = require('../lib/entries');
const {
  SCHEMA_VERSION,
  planImport,
  safeDeviceName,
  folderBackupName,
  folderBackupsOf,
  folderBackupsToDelete,
} = require('../lib/backup');
const {
  defaultShortcut,
  isValidAccelerator,
  LEGACY_DEFAULT_SHORTCUT,
} = require('../lib/accelerator');

const BACKUPS_KEPT = 14;
const BACKUP_NAME_RE = /^wins-\d{4}-\d{2}-\d{2}\.json$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_PATH_LENGTH = 4096;
const FOLDER_BACKUP_WAIT_MS = 3000; // how long quitting waits for a slow backup folder

function emptyData() {
  return { schemaVersion: SCHEMA_VERSION, entries: [] };
}

/** The exact text of a data file. */
function serialize(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function isFolderPath(value) {
  return typeof value === 'string' && value !== '' && value.length <= MAX_PATH_LENGTH && path.isAbsolute(value);
}

/** Settings used when settings.json is missing or a field in it is invalid. */
function defaultSettings(platform = process.platform) {
  return {
    reminderTime: '18:00',
    reminderDays: [1, 2, 3, 4, 5], // Mon–Fri; an empty list turns the reminder off
    shortcut: defaultShortcut(platform),
    openAtLogin: true, // what the user chose; the OS login item is the source of truth (loginItem.js)
    loginItemSetUp: false, // true once the installed app has set up the login item on its first run
    welcomeShown: false, // true once the first-run welcome window has been shown
    backupFolder: null, // a folder the user chose for extra daily backups, or null
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
    welcomeShown: s.welcomeShown === true,
    backupFolder: isFolderPath(s.backupFolder) ? s.backupFolder : null,
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

/** Resolves when `promise` does, or after `ms`, whichever comes first. Never rejects. */
function settledWithin(promise, ms) {
  let timer;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(resolve, ms);
    timer.unref?.();
  });
  return Promise.race([promise.catch(() => {}), timeout]).finally(() => clearTimeout(timer));
}

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

/**
 * Writes text to `file` so that a crash leaves either the old or the new file, never half of one.
 * `tmp` is the temporary file; pass a name of our own when `file` is in a folder the user chose.
 */
async function writeFileAtomic(file, text, tmp = `${file}.tmp`) {
  const fh = await fsp.open(tmp, 'w');
  try {
    await fh.writeFile(text, 'utf8');
    await fh.sync();
  } finally {
    await fh.close();
  }
  try {
    await renameWithRetry(tmp, file);
  } catch (err) {
    await fsp.rm(tmp, { force: true }).catch(() => {}); // do not leave the temp file behind
    throw err;
  }
  await syncDir(path.dirname(file));
}

function writeJsonAtomic(file, value) {
  return writeFileAtomic(file, serialize(value));
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
 * @param {{ now?: () => Date, platform?: string, hostname?: string }} [options]  all for tests
 */
function createStore(dir, { now = () => new Date(), platform = process.platform, hostname = os.hostname() } = {}) {
  const winsPath = path.join(dir, 'wins.json');
  const settingsPath = path.join(dir, 'settings.json');
  const backupDir = path.join(dir, 'backups');
  const device = safeDeviceName(hostname);

  let data = null;
  let settings = null;
  let queue = Promise.resolve(); // never rejects
  let backedUpOn = null; // local date of the last backup this session

  // Copies to the user's backup folder run on their own chain: a slow or missing cloud
  // folder must never hold up, or fail, saving a win.
  let folderQueue = Promise.resolve(); // never rejects
  let folderStatus = { savedAt: null, error: null }; // result of the latest copy this session

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

  // ----- Extra backups in a folder the user chose -----

  /**
   * Writes `text` (the contents of wins.json) to today's backup file in the user's folder
   * and removes this computer's oldest backups beyond BACKUPS_KEPT. Other files in the
   * folder, including backups from other computers, are never touched. The folder is not
   * created if it is missing: a drive that is unplugged should not get a stray folder.
   * Never rejects; the outcome is kept for getBackupFolderStatus().
   */
  function copyToBackupFolder(text) {
    const folder = settings ? settings.backupFolder : null;
    if (!folder) return Promise.resolve();
    const run = folderQueue.then(async () => {
      try {
        const file = path.join(folder, folderBackupName(device, localDate(now())));
        await writeFileAtomic(file, text, `${file}.winlog-tmp`);
        folderStatus = { savedAt: now(), error: null };
      } catch (err) {
        folderStatus = { savedAt: folderStatus.savedAt, error: err.code || 'ERROR' };
        return;
      }
      try {
        const names = await fsp.readdir(folder);
        for (const old of folderBackupsToDelete(names, device, BACKUPS_KEPT)) {
          await fsp.rm(path.join(folder, old), { force: true });
        }
      } catch {
        // The copy itself is saved; tidying up can wait for the next one.
      }
    });
    folderQueue = run;
    return run;
  }

  /**
   * At startup: makes sure the backup folder has the current wins, e.g. after a copy
   * failed because a drive was unplugged. Does nothing if the newest copy is already
   * the same, so days without changes do not push older backups out. Never rejects.
   */
  async function syncBackupFolder() {
    const folder = settings ? settings.backupFolder : null;
    if (!folder || !data) return;
    const text = serialize(data);
    try {
      const mine = folderBackupsOf(await fsp.readdir(folder), device);
      const newest = mine[mine.length - 1];
      if (newest && (await fsp.readFile(path.join(folder, newest), 'utf8')) === text) return;
    } catch {
      // Cannot look: try to write, which records the problem for Settings.
    }
    await copyToBackupFolder(text);
  }

  /**
   * Sets (or, with null, clears) the folder for extra daily backups and makes the first
   * copy right away. Resolves to the status of that copy (see getBackupFolderStatus).
   * Rejects with code NOT_A_FOLDER if `folder` is not an existing folder.
   */
  async function setBackupFolder(folder) {
    if (folder !== null) {
      let isFolder = false;
      try {
        isFolder = isFolderPath(folder) && (await fsp.stat(folder)).isDirectory();
      } catch {
        isFolder = false;
      }
      if (!isFolder) {
        const err = new Error('That folder cannot be used');
        err.code = 'NOT_A_FOLDER';
        throw err;
      }
    }
    await updateSettings({ backupFolder: folder });
    folderStatus = { savedAt: null, error: null };
    if (folder !== null && data) await copyToBackupFolder(serialize(data));
    return getBackupFolderStatus();
  }

  /** { folder, savedAt, error }: the folder, when the last copy worked (this session), and the last error code. */
  function getBackupFolderStatus() {
    return { folder: settings ? settings.backupFolder : null, ...folderStatus };
  }

  // ----- Wins -----

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

  /** The exact text of wins.json for the current wins. This is what a backup file contains. */
  function backupText() {
    if (!data) throw new Error('store.load() has not finished');
    return serialize(data);
  }

  /**
   * The one way wins are changed. `compute(entries)` returns { entries, result } with a new
   * entries array (or the same array for "no change"). The new list is written first;
   * memory is only updated after the file is safely on disk. Resolves to `result`.
   */
  function changeEntries(compute) {
    return enqueue(async () => {
      const current = getEntries();
      const { entries, result } = compute(current);
      if (entries === current) return result; // nothing changed, so nothing to write
      const next = { ...data, entries };
      const text = serialize(next);
      await backupIfNeeded();
      await writeFileAtomic(winsPath, text);
      data = next;
      copyToBackupFolder(text); // not awaited: see folderQueue
      return result;
    });
  }

  /** Appends entries and saves. */
  function addEntries(newEntries) {
    return changeEntries((entries) => ({ entries: [...entries, ...newEntries] }));
  }

  /**
   * Changes the text of one win; the tag is re-read from the text and updatedAt is set.
   * Resolves to the updated win. Rejects with code NOT_FOUND or INVALID_TEXT.
   */
  function editEntry(id, text) {
    return changeEntries((entries) => {
      const { entries: next, entry } = editEntryData(entries, id, text, now());
      return { entries: next, result: entry };
    });
  }

  /** Deletes one win. Resolves to the deleted win, or null if it was already gone. */
  function deleteEntry(id) {
    return changeEntries((entries) => {
      const { entries: next, entry } = deleteEntryData(entries, id);
      return { entries: next, result: entry };
    });
  }

  /**
   * Adds the wins from a backup whose ids are not here yet. Wins that are already here
   * are never changed. The comparison is made inside the save queue, against the wins
   * as they are at that moment. Resolves to the plan that was applied
   * ({ toAdd, same, different }, see lib/backup.js).
   */
  function importEntries(incoming) {
    return changeEntries((entries) => {
      const plan = planImport(entries, incoming);
      return { entries: plan.toAdd.length > 0 ? [...entries, ...plan.toAdd] : entries, result: plan };
    });
  }

  // ----- Settings -----

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

  /**
   * Resolves when every queued save has finished. A copy to the backup folder gets a
   * few seconds to finish too, but a folder that hangs cannot stop the app from quitting.
   */
  function flush() {
    return queue.then(() => settledWithin(folderQueue, FOLDER_BACKUP_WAIT_MS));
  }

  return {
    load,
    getEntries,
    backupText,
    addEntries,
    editEntry,
    deleteEntry,
    importEntries,
    loadSettings,
    getSettings,
    updateSettings,
    setBackupFolder,
    syncBackupFolder,
    getBackupFolderStatus,
    flush,
    paths: { dir, winsPath, settingsPath, backupDir },
  };
}

module.exports = {
  createStore,
  writeFileAtomic,
  writeJsonAtomic,
  parseWins,
  normalizeSettings,
  defaultSettings,
  SCHEMA_VERSION,
  BACKUPS_KEPT,
};
