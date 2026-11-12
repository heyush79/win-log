'use strict';

const crypto = require('node:crypto');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { app, ipcMain } = require('electron');
const { localDate } = require('../lib/dates');
const { extractTag } = require('../lib/tags');
const { isValidTime, isValidDays } = require('../lib/schedule');
const { RENDERER_DIR } = require('./windows');
const { changeShortcut, isShortcutActive, isValidAccelerator } = require('./shortcut');

const RENDERER_URL = pathToFileURL(RENDERER_DIR + path.sep).href;
const MAX_TEXT_LENGTH = 20000;
const MAX_LINES = 100;
const MAX_LINE_LENGTH = 2000;

// Only our own pages may call these handlers.
function assertFromApp(event) {
  const url = event.senderFrame?.url ?? '';
  if (!url.startsWith(RENDERER_URL)) throw new Error('IPC call from an unexpected page was blocked');
}

/** Validates the text from the entry window and returns one trimmed line per win. */
function parseWinLines(text) {
  if (typeof text !== 'string') throw new Error('Expected text');
  if (text.length > MAX_TEXT_LENGTH) throw new Error('Text is too long');
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) throw new Error('Nothing to save');
  if (lines.length > MAX_LINES) throw new Error(`At most ${MAX_LINES} wins at once`);
  if (lines.some((line) => line.length > MAX_LINE_LENGTH)) throw new Error('A line is too long');
  return lines;
}

function todaysEntries(store) {
  const today = localDate();
  return store.getEntries().filter((entry) => entry.date === today);
}

// Settings the Settings window may change. lastPromptedDate is not one of them.
const SETTINGS_CHECKS = {
  reminderTime: isValidTime,
  reminderDays: isValidDays,
  shortcut: isValidAccelerator,
  openAtLogin: (value) => typeof value === 'boolean',
};

/** Validates a settings change from the Settings window and returns a clean copy. */
function parseSettingsPatch(patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new Error('Expected an object');
  const keys = Object.keys(patch);
  if (keys.length === 0) throw new Error('Nothing to save');
  const clean = {};
  for (const key of keys) {
    if (!Object.hasOwn(SETTINGS_CHECKS, key)) throw new Error(`Unknown setting: ${key}`);
    if (!SETTINGS_CHECKS[key](patch[key])) throw new Error(`Invalid value for ${key}`);
    clean[key] = key === 'reminderDays' ? [...patch[key]].sort((a, b) => a - b) : patch[key];
  }
  return clean;
}

function settingsView(store) {
  const s = store.getSettings();
  return {
    reminderTime: s.reminderTime,
    reminderDays: s.reminderDays,
    shortcut: s.shortcut,
    shortcutActive: isShortcutActive(),
    openAtLogin: s.openAtLogin,
    // Login items only work for the installed app (see main.js).
    openAtLoginApplies: app.isPackaged,
  };
}

/**
 * @param {object} store
 * @param {{ onSettingsSaved: (changes: object) => void }} hooks
 */
function registerIpc(store, { onSettingsSaved }) {
  ipcMain.handle('settings:get', (event) => {
    assertFromApp(event);
    return settingsView(store);
  });

  // Nothing is saved if the new shortcut cannot be registered.
  ipcMain.handle('settings:update', async (event, patch) => {
    assertFromApp(event);
    const changes = parseSettingsPatch(patch);
    const before = store.getSettings();
    const newShortcut = 'shortcut' in changes && changes.shortcut !== before.shortcut;
    if (newShortcut && !changeShortcut(changes.shortcut)) {
      return { ok: false, error: 'shortcut-unavailable' };
    }
    try {
      await store.updateSettings(changes);
    } catch (err) {
      if (newShortcut) changeShortcut(before.shortcut); // match what is still on disk
      throw err;
    }
    onSettingsSaved(changes);
    return { ok: true, settings: settingsView(store) };
  });

  ipcMain.handle('wins:today', (event) => {
    assertFromApp(event);
    return todaysEntries(store);
  });

  ipcMain.handle('wins:add', async (event, text) => {
    assertFromApp(event);
    const lines = parseWinLines(text);
    const now = new Date();
    const date = localDate(now); // the entry's local calendar date
    const timestamp = now.toISOString(); // an instant, so UTC is correct here
    const entries = lines.map((line) => ({
      id: crypto.randomUUID(),
      date,
      text: line,
      tag: extractTag(line),
      createdAt: timestamp,
      updatedAt: timestamp,
    }));
    await store.addEntries(entries);
    return { added: entries.length, today: todaysEntries(store) };
  });
}

module.exports = { registerIpc };
