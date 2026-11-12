'use strict';

// Reading a backup file and working out what an import would do. Pure: no files.
//
// A backup has the same format as wins.json. Importing only ever ADDS wins whose id
// is not in Win Log yet. A win that is already here is never changed or replaced,
// even if the backup has a different text for it.

const { extractTag } = require('./tags');
const { isValidDate } = require('./dates');
const { isValidId, joinLines, MAX_LINE_LENGTH } = require('./entries');

const SCHEMA_VERSION = 1; // the format of wins.json and of backups
const MAX_BACKUP_ENTRIES = 200000;

function backupError(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}

function isTimestamp(value) {
  return typeof value === 'string' && value.length <= 40 && !Number.isNaN(Date.parse(value));
}

/**
 * Checks one win from a backup file and returns a clean copy with only the fields
 * Win Log knows, or null if it cannot be used. The tag is always read again from
 * the text, so it can never disagree with it.
 */
function cleanImportedEntry(raw, now) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  if (!isValidId(raw.id) || !isValidDate(raw.date) || typeof raw.text !== 'string') return null;
  const text = joinLines(raw.text).trim(); // a win is one line
  if (text === '' || text.length > MAX_LINE_LENGTH) return null;
  const createdAt = isTimestamp(raw.createdAt) ? raw.createdAt : now.toISOString();
  const updatedAt = isTimestamp(raw.updatedAt) ? raw.updatedAt : createdAt;
  return { id: raw.id, date: raw.date, text, tag: extractTag(text), createdAt, updatedAt };
}

/**
 * Parses the text of a backup file.
 * Returns { entries, skipped }: the usable wins, and how many items in the file were
 * left out because they are not valid wins or repeat an id that came earlier in the file.
 * Throws with code NOT_BACKUP if the file is not a Win Log backup, or NEWER_VERSION
 * if it was made by a newer version of Win Log.
 */
function parseBackup(text, now) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw backupError('NOT_BACKUP', 'This file is not a Win Log backup');
  }
  if (
    !data ||
    typeof data !== 'object' ||
    Array.isArray(data) ||
    typeof data.schemaVersion !== 'number' ||
    !Array.isArray(data.entries) ||
    data.entries.length > MAX_BACKUP_ENTRIES
  ) {
    throw backupError('NOT_BACKUP', 'This file is not a Win Log backup');
  }
  if (data.schemaVersion > SCHEMA_VERSION) {
    throw backupError('NEWER_VERSION', 'This backup was made by a newer version of Win Log');
  }

  const entries = [];
  const seen = new Set();
  let skipped = 0;
  for (const raw of data.entries) {
    const entry = cleanImportedEntry(raw, now);
    if (!entry || seen.has(entry.id)) {
      skipped++;
      continue;
    }
    seen.add(entry.id);
    entries.push(entry);
  }
  return { entries, skipped };
}

/**
 * Compares wins from a backup with the wins already in Win Log, by id.
 * Returns { toAdd, same, different }:
 * - toAdd: wins whose id is not here yet. Only these are imported.
 * - same: how many are already here with the same text and date.
 * - different: how many are already here but differ in the backup. They are kept as they are.
 */
function planImport(existing, incoming) {
  const byId = new Map(existing.filter((entry) => entry?.id !== undefined).map((entry) => [entry.id, entry]));
  const toAdd = [];
  let same = 0;
  let different = 0;
  for (const entry of incoming) {
    const mine = byId.get(entry.id);
    if (!mine) {
      toAdd.push(entry);
      byId.set(entry.id, entry); // a repeated id in `incoming` is only added once
    } else if (mine.text === entry.text && mine.date === entry.date) {
      same++;
    } else {
      different++;
    }
  }
  return { toAdd, same, different };
}

/**
 * The summary shown before an import is applied, as short plain-English lines.
 * skipped is the number from parseBackup.
 */
function importSummary({ toAdd, same, different }, skipped) {
  const wins = (n) => (n === 1 ? '1 win' : `${n} wins`);
  const lines = [];
  lines.push(toAdd.length === 0 ? 'There is nothing new to add.' : `${wins(toAdd.length)} will be added.`);
  const here = same + different;
  if (here > 0) {
    lines.push(
      here === 1
        ? '1 win is already in Win Log and will stay as it is.'
        : `${here} wins are already in Win Log and will stay as they are.`
    );
  }
  if (different > 0) {
    lines.push(
      different === 1
        ? '1 of them is different in the backup. Your current version is kept.'
        : `${different} of them are different in the backup. Your current versions are kept.`
    );
  }
  if (skipped > 0) {
    lines.push(
      skipped === 1
        ? '1 item in the file could not be read and will be skipped.'
        : `${skipped} items in the file could not be read and will be skipped.`
    );
  }
  return lines;
}

// ----- Daily backups to a folder the user chose -----
//
// File names carry the computer's name: "win-log-backup-Ayushs-MacBook-2026-11-12.json".
// Win Log only ever deletes old backups that this computer made. If two computers
// share one cloud folder, or a new laptop points at the old laptop's folder, neither
// can remove the other's backups.

/** A computer name that is safe in a file name: letters, digits and "-" only. */
function safeDeviceName(hostname) {
  const name = String(hostname || '')
    .replace(/\.local$/i, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/, '');
  return name || 'computer';
}

/** The backup file for one computer and one local date ("YYYY-MM-DD"). */
function folderBackupName(device, date) {
  return `win-log-backup-${device}-${date}.json`;
}

/** The backup files in `names` that this computer made, oldest first. */
function folderBackupsOf(names, device) {
  const prefix = `win-log-backup-${device}-`;
  return names
    .filter((name) => name.startsWith(prefix) && /^\d{4}-\d{2}-\d{2}\.json$/.test(name.slice(prefix.length)))
    .sort();
}

/** Which of this computer's backups to delete so that only the newest `keep` remain. */
function folderBackupsToDelete(names, device, keep) {
  const mine = folderBackupsOf(names, device);
  return mine.slice(0, Math.max(0, mine.length - keep));
}

module.exports = {
  SCHEMA_VERSION,
  cleanImportedEntry,
  parseBackup,
  planImport,
  importSummary,
  safeDeviceName,
  folderBackupName,
  folderBackupsOf,
  folderBackupsToDelete,
};
