'use strict';

// Creating, editing and deleting wins as plain data. No files, no Electron.
// Every function returns new arrays and objects; nothing is changed in place, so the
// store can keep the old data in memory until the new data is safely on disk.

const { extractTag } = require('./tags');
const { localDate, isValidDate } = require('./dates');

const MAX_TEXT_LENGTH = 20000; // everything typed into the Add a win box at once
const MAX_LINES = 100;
const MAX_LINE_LENGTH = 2000; // one win
const MAX_ID_LENGTH = 100;

/**
 * An error the app can explain to the user. `code` is INVALID_TEXT or NOT_FOUND.
 * For INVALID_TEXT, `reason` says what is wrong: 'not-text', 'empty', 'too-many',
 * 'line-too-long', 'text-too-long' or 'line-break'.
 */
function entryError(code, message, reason) {
  const err = new Error(message);
  err.code = code;
  if (reason) err.reason = reason;
  return err;
}

// Every kind of line break, including the Unicode line and paragraph separators.
const LINE_BREAKS = /[\r\n\u2028\u2029]+/g;

/** The text on a single line: every run of line breaks becomes one space. */
function joinLines(text) {
  return text.replace(LINE_BREAKS, ' ');
}

function isValidId(id) {
  return typeof id === 'string' && id.length > 0 && id.length <= MAX_ID_LENGTH;
}

/**
 * True if a win has what the app needs to show it: an id, a real date and a text.
 * wins.json is plain JSON that people may edit by hand. A broken item is left in the
 * file untouched, but it is not listed, counted or exported, so it cannot crash a window.
 */
function isUsableEntry(entry) {
  return (
    Boolean(entry) &&
    typeof entry === 'object' &&
    isValidId(entry.id) &&
    isValidDate(entry.date) &&
    typeof entry.text === 'string'
  );
}

/** Validates the text from the Add a win window and returns one trimmed line per win. */
function parseWinLines(text) {
  if (typeof text !== 'string') throw entryError('INVALID_TEXT', 'Expected text', 'not-text');
  if (text.length > MAX_TEXT_LENGTH) throw entryError('INVALID_TEXT', 'Text is too long', 'text-too-long');
  const lines = text
    .split(/\r\n|\r|\n|\u2028|\u2029/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) throw entryError('INVALID_TEXT', 'Nothing to save', 'empty');
  if (lines.length > MAX_LINES) {
    throw entryError('INVALID_TEXT', `At most ${MAX_LINES} wins at once`, 'too-many');
  }
  if (lines.some((line) => line.length > MAX_LINE_LENGTH)) {
    throw entryError('INVALID_TEXT', 'A line is too long', 'line-too-long');
  }
  return lines;
}

/** Validates the text of one win (used when editing). A win is a single line. */
function cleanWinText(text) {
  if (typeof text !== 'string') throw entryError('INVALID_TEXT', 'Expected text', 'not-text');
  const clean = text.trim();
  if (clean === '') throw entryError('INVALID_TEXT', 'A win cannot be empty', 'empty');
  if (clean.length > MAX_LINE_LENGTH) {
    throw entryError('INVALID_TEXT', 'The text is too long', 'line-too-long');
  }
  if (/[\r\n\u2028\u2029]/.test(clean)) throw entryError('INVALID_TEXT', 'A win is a single line', 'line-break');
  return clean;
}

/**
 * One new win per line, dated today (local date).
 * @param {string[]} lines  from parseWinLines
 * @param {Date} now
 * @param {() => string} makeId  e.g. crypto.randomUUID
 */
function createEntries(lines, now, makeId) {
  const date = localDate(now); // the win's local calendar date
  const timestamp = now.toISOString(); // an instant, so UTC is correct here
  return lines.map((line) => ({
    id: makeId(),
    date,
    text: line,
    tag: extractTag(line),
    createdAt: timestamp,
    updatedAt: timestamp,
  }));
}

/**
 * Changes the text of one win. The tag is read again from the new text and
 * updatedAt is set. Returns { entries, entry }. If the text did not change,
 * `entries` is the same array that was passed in.
 */
function editEntry(entries, id, text, now) {
  const index = entries.findIndex((entry) => entry?.id === id);
  if (index === -1) throw entryError('NOT_FOUND', 'This win no longer exists');
  const clean = cleanWinText(text);
  const old = entries[index];
  if (old.text === clean) return { entries, entry: old };
  const entry = { ...old, text: clean, tag: extractTag(clean), updatedAt: now.toISOString() };
  const next = [...entries];
  next[index] = entry;
  return { entries: next, entry };
}

/**
 * Removes one win. Returns { entries, entry } where entry is the removed win.
 * If there is no such win, `entries` is the same array and entry is null.
 */
function deleteEntry(entries, id) {
  const index = entries.findIndex((entry) => entry?.id === id);
  if (index === -1) return { entries, entry: null };
  return { entries: entries.filter((_, i) => i !== index), entry: entries[index] };
}

module.exports = {
  MAX_TEXT_LENGTH,
  MAX_LINES,
  MAX_LINE_LENGTH,
  isValidId,
  isUsableEntry,
  joinLines,
  parseWinLines,
  cleanWinText,
  createEntries,
  editEntry,
  deleteEntry,
};
