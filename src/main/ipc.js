'use strict';

// Every request a page can make. Pages are not trusted: each handler checks that the
// call comes from one of our own pages and validates every argument.

const crypto = require('node:crypto');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { BrowserWindow, dialog, ipcMain } = require('electron');
const { localDate } = require('../lib/dates');
const { isValidTime, isValidDays } = require('../lib/schedule');
const { isValidAccelerator } = require('../lib/accelerator');
const { isValidId, parseWinLines, cleanWinText, createEntries } = require('../lib/entries');
const { sortNewestFirst } = require('../lib/group');
const { RENDERER_DIR, WINDOW_NAMES, showWindow } = require('./windows');
const { changeShortcut, isShortcutActive } = require('./shortcut');
const { loginItemApplies, readLoginItem, writeLoginItem } = require('./loginItem');

const RENDERER_URL = pathToFileURL(RENDERER_DIR + path.sep).href;
const PREVIEW_LENGTH = 300;

// Only our own pages may call these handlers.
function assertFromApp(event) {
  const url = event.senderFrame?.url ?? '';
  if (!url.startsWith(RENDERER_URL)) throw new Error('IPC call from an unexpected page was blocked');
}

function todaysEntries(store) {
  const today = localDate();
  return store.getEntries().filter((entry) => entry.date === today);
}

// Settings the Settings window may change. Nothing else in settings.json is one of them.
const SETTINGS_CHECKS = {
  reminderTime: isValidTime,
  reminderDays: isValidDays,
  shortcut: isValidAccelerator,
  openAtLogin: (value) => typeof value === 'boolean',
};

/** Validates a settings change from a page and returns a clean copy. */
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
  // The OS login item is the truth: the user may have removed it in System Settings.
  const loginItem = readLoginItem();
  return {
    reminderTime: s.reminderTime,
    reminderDays: s.reminderDays,
    shortcut: s.shortcut,
    shortcutActive: isShortcutActive(),
    openAtLogin: loginItem ? loginItem.openAtLogin : s.openAtLogin,
    openAtLoginNeedsApproval: loginItem ? loginItem.needsApproval : false,
    // Login items only work for the installed app (see loginItem.js).
    openAtLoginApplies: loginItemApplies(),
  };
}

function shorten(text) {
  return text.length > PREVIEW_LENGTH ? `${text.slice(0, PREVIEW_LENGTH)}…` : text;
}

/**
 * @param {object} store
 * @param {{ onSettingsSaved: (changes: object) => void, onWinsChanged: () => void }} hooks
 */
function registerIpc(store, { onSettingsSaved, onWinsChanged }) {
  /** Registers a handler that only our own pages can call. */
  function handle(channel, handler) {
    ipcMain.handle(channel, (event, ...args) => {
      assertFromApp(event);
      return handler(event, ...args);
    });
  }

  // Tells every open window, and the tray, that the list of wins changed.
  function winsChanged() {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send('wins:changed');
    }
    onWinsChanged();
  }

  // ----- Settings -----

  handle('settings:get', () => settingsView(store));

  // Nothing is saved if the new shortcut cannot be registered.
  handle('settings:update', async (_event, patch) => {
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
    // Only a change made here touches the OS login item (see loginItem.js).
    if ('openAtLogin' in changes) writeLoginItem(changes.openAtLogin);
    onSettingsSaved(changes);
    return { ok: true, settings: settingsView(store) };
  });

  // ----- Wins -----

  handle('wins:today', () => todaysEntries(store));

  handle('wins:list', () => sortNewestFirst(store.getEntries()));

  handle('wins:add', async (_event, text) => {
    const entries = createEntries(parseWinLines(text), new Date(), () => crypto.randomUUID());
    await store.addEntries(entries);
    winsChanged();
    return { added: entries.length, today: todaysEntries(store) };
  });

  // Resolves to { ok: true, entry } or { ok: false, error: 'not-found' | 'invalid-text' }.
  handle('wins:edit', async (_event, id, text) => {
    if (!isValidId(id)) throw new Error('Invalid id');
    try {
      cleanWinText(text);
    } catch {
      return { ok: false, error: 'invalid-text' };
    }
    let entry;
    try {
      entry = await store.editEntry(id, text);
    } catch (err) {
      if (err.code === 'NOT_FOUND') return { ok: false, error: 'not-found' };
      throw err;
    }
    winsChanged();
    return { ok: true, entry };
  });

  // Asks the user first. The question is asked here, not in the page, so that no page
  // can delete a win without it. Resolves to { deleted: true | false }.
  handle('wins:delete', async (event, id) => {
    if (!isValidId(id)) throw new Error('Invalid id');
    const entry = store.getEntries().find((e) => e.id === id);
    if (!entry) return { deleted: false, error: 'not-found' };
    const options = {
      type: 'warning',
      message: 'Delete this win?',
      detail: `${shorten(entry.text)}\n\nThis cannot be undone.`,
      buttons: ['Delete', 'Cancel'],
      defaultId: 1,
      cancelId: 1,
      noLink: true,
    };
    const parent = BrowserWindow.fromWebContents(event.sender);
    const { response } = parent
      ? await dialog.showMessageBox(parent, options)
      : await dialog.showMessageBox(options);
    if (response !== 0) return { deleted: false };
    const deleted = await store.deleteEntry(id);
    if (deleted) winsChanged();
    return { deleted: Boolean(deleted) };
  });

  // ----- Windows -----

  handle('window:open', (_event, name) => {
    if (!WINDOW_NAMES.includes(name)) throw new Error('Unknown window');
    showWindow(name);
  });
}

module.exports = { registerIpc };
