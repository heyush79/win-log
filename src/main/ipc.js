'use strict';

// Every request a page can make. Pages are not trusted: each handler checks that the
// call comes from one of our own pages and validates every argument. A page never
// sends a file path, a URL or text to save; it only names an action, and the main
// process asks the user (dialogs) and does the work.

const crypto = require('node:crypto');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { app, BrowserWindow, clipboard, dialog, ipcMain, shell } = require('electron');
const { localDate } = require('../lib/dates');
const { isValidTime, isValidDays } = require('../lib/schedule');
const { isValidAccelerator } = require('../lib/accelerator');
const { isValidId, isUsableEntry, parseWinLines, cleanWinText, createEntries } = require('../lib/entries');
const { sortNewestFirst } = require('../lib/group');
const { parseExportOptions, buildExport, exportFileName } = require('../lib/exportMarkdown');
const { parseBackup, planImport, importSummary } = require('../lib/backup');
const { linkUrl, isAllowedUrl } = require('../lib/links');
const { writeFileAtomic } = require('./store');
const { RENDERER_DIR, WINDOW_NAMES, showWindow } = require('./windows');
const { changeShortcut, isShortcutActive } = require('./shortcut');
const { loginItemApplies, readLoginItem, writeLoginItem } = require('./loginItem');

const RENDERER_URL = pathToFileURL(RENDERER_DIR + path.sep).href;
const PREVIEW_LENGTH = 300;
const MAX_BACKUP_BYTES = 64 * 1024 * 1024;

// Only our own pages may call these handlers.
function assertFromApp(event) {
  const url = event.senderFrame?.url ?? '';
  if (!url.startsWith(RENDERER_URL)) throw new Error('IPC call from an unexpected page was blocked');
}

/** The wins that can be shown (see isUsableEntry). */
function usableEntries(store) {
  return store.getEntries().filter(isUsableEntry);
}

function todaysEntries(store) {
  const today = localDate();
  return usableEntries(store).filter((entry) => entry.date === today);
}

// Settings a page may change. Nothing else in settings.json is one of them.
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
  const backup = store.getBackupFolderStatus();
  return {
    reminderTime: s.reminderTime,
    reminderDays: s.reminderDays,
    shortcut: s.shortcut,
    shortcutActive: isShortcutActive(),
    openAtLogin: loginItem ? loginItem.openAtLogin : s.openAtLogin,
    openAtLoginNeedsApproval: loginItem ? loginItem.needsApproval : false,
    // Login items only work for the installed app (see loginItem.js).
    openAtLoginApplies: loginItemApplies(),
    dataFolder: store.paths.dir,
    backupFolder: backup.folder,
    backupSavedAt: backup.savedAt ? backup.savedAt.toISOString() : null,
    backupError: backup.error,
  };
}

function shorten(text) {
  return text.length > PREVIEW_LENGTH ? `${text.slice(0, PREVIEW_LENGTH)}…` : text;
}

/** True if `target` is `folder` itself or somewhere inside it. */
function isInside(folder, target) {
  const relative = path.relative(path.resolve(folder), path.resolve(target));
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

/** Shows a dialog attached to the window that asked for it. */
function showDialog(method, event, options) {
  const parent = BrowserWindow.fromWebContents(event.sender);
  return parent ? dialog[method](parent, options) : dialog[method](options);
}

/**
 * @param {object} store
 * @param {object} hooks
 * @param {(changes: object) => void} hooks.onSettingsSaved
 * @param {() => void} hooks.onWinsChanged
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

  // ----- App -----

  handle('app:info', () => ({
    version: app.getVersion(),
    dataFolder: store.paths.dir,
    winCount: usableEntries(store).length,
  }));

  // Opens one of the few fixed addresses (lib/links.js) in the user's browser.
  // A page sends a name such as 'releases', never an address.
  handle('link:open', async (_event, name) => {
    const url = linkUrl(name);
    if (!url || !isAllowedUrl(url)) throw new Error('Unknown link');
    await shell.openExternal(url);
  });

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

  handle('wins:list', () => sortNewestFirst(usableEntries(store)));

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
    const entry = usableEntries(store).find((e) => e.id === id);
    if (!entry) return { deleted: false, error: 'not-found' };
    const { response } = await showDialog('showMessageBox', event, {
      type: 'warning',
      message: 'Delete this win?',
      detail: `${shorten(entry.text)}\n\nThis cannot be undone.`,
      buttons: ['Delete', 'Cancel'],
      defaultId: 1,
      cancelId: 1,
      noLink: true,
    });
    if (response !== 0) return { deleted: false };
    const deleted = await store.deleteEntry(id);
    if (deleted) winsChanged();
    return { deleted: Boolean(deleted) };
  });

  // ----- Export -----
  // A page only sends the options. The text is always built here from the saved wins,
  // so a page can never make the app copy or save something else.

  /** Returns { options, text, count }, or null if the date range is not valid. */
  function exportFor(rawOptions) {
    let options;
    try {
      options = parseExportOptions(rawOptions, localDate());
    } catch (err) {
      if (err.code === 'INVALID_RANGE') return null;
      throw err;
    }
    return { options, ...buildExport(usableEntries(store), options) };
  }

  handle('export:preview', (_event, rawOptions) => {
    const result = exportFor(rawOptions);
    if (!result) return { ok: false, error: 'invalid-range' };
    const { options, text, count } = result;
    return { ok: true, from: options.from, to: options.to, text, count };
  });

  handle('export:copy', async (_event, rawOptions) => {
    const result = exportFor(rawOptions);
    if (!result) return { ok: false, error: 'invalid-range' };
    if (result.count === 0) return { ok: false, error: 'empty' };
    await clipboard.writeText(result.text); // a promise in this Electron version
    return { ok: true, count: result.count };
  });

  handle('export:save', async (event, rawOptions) => {
    const result = exportFor(rawOptions);
    if (!result) return { ok: false, error: 'invalid-range' };
    if (result.count === 0) return { ok: false, error: 'empty' };
    const markdown = result.options.format === 'markdown';
    const { canceled, filePath } = await showDialog('showSaveDialog', event, {
      title: 'Save your wins',
      defaultPath: path.join(app.getPath('documents'), exportFileName(result.options)),
      filters: [markdown ? { name: 'Markdown', extensions: ['md'] } : { name: 'Plain text', extensions: ['txt'] }],
    });
    if (canceled || !filePath) return { ok: false, canceled: true };
    if (isInside(store.paths.dir, filePath)) return { ok: false, error: 'data-folder' };
    await writeFileAtomic(filePath, `${result.text}\n`, `${filePath}.winlog-tmp`);
    return { ok: true, count: result.count, fileName: path.basename(filePath) };
  });

  // ----- Your data: folder, backup, import -----

  handle('data:open-folder', async () => {
    const error = await shell.openPath(store.paths.dir);
    return { ok: error === '' };
  });

  // Saves a copy of every win as one .json file, wherever the user chooses.
  handle('data:export-backup', async (event) => {
    const { canceled, filePath } = await showDialog('showSaveDialog', event, {
      title: 'Export a backup',
      defaultPath: path.join(app.getPath('documents'), `win-log-backup-${localDate()}.json`),
      filters: [{ name: 'Win Log backup', extensions: ['json'] }],
    });
    if (canceled || !filePath) return { ok: false, canceled: true };
    // Never write over the live files: Win Log's own folder is off limits.
    if (isInside(store.paths.dir, filePath)) return { ok: false, error: 'data-folder' };
    await writeFileAtomic(filePath, store.backupText(), `${filePath}.winlog-tmp`);
    return { ok: true, fileName: path.basename(filePath), count: store.getEntries().length };
  });

  // Adds the wins from a backup file that are not here yet. Shows a summary and asks
  // before anything is changed. A win that is already here is never replaced.
  handle('data:import-backup', async (event) => {
    const open = await showDialog('showOpenDialog', event, {
      title: 'Import a backup',
      defaultPath: store.getSettings().backupFolder || app.getPath('documents'),
      properties: ['openFile'],
      filters: [{ name: 'Win Log backup', extensions: ['json'] }],
    });
    if (open.canceled || open.filePaths.length === 0) return { ok: false, canceled: true };
    const file = open.filePaths[0];

    let parsed;
    try {
      if ((await fsp.stat(file)).size > MAX_BACKUP_BYTES) return { ok: false, error: 'not-backup' };
      parsed = parseBackup(await fsp.readFile(file, 'utf8'), new Date());
    } catch (err) {
      if (err.code === 'NOT_BACKUP') return { ok: false, error: 'not-backup' };
      if (err.code === 'NEWER_VERSION') return { ok: false, error: 'newer-version' };
      return { ok: false, error: 'unreadable' };
    }

    const plan = planImport(store.getEntries(), parsed.entries);
    const summary = importSummary(plan, parsed.skipped);
    if (plan.toAdd.length === 0) return { ok: false, error: 'nothing-new', summary };

    const { response } = await showDialog('showMessageBox', event, {
      type: 'question',
      message: plan.toAdd.length === 1 ? 'Import 1 win?' : `Import ${plan.toAdd.length} wins?`,
      detail: [`From: ${path.basename(file)}`, '', ...summary].join('\n'),
      buttons: ['Import', 'Cancel'],
      defaultId: 0,
      cancelId: 1,
      noLink: true,
    });
    if (response !== 0) return { ok: false, canceled: true };

    const applied = await store.importEntries(parsed.entries);
    if (applied.toAdd.length > 0) winsChanged();
    return { ok: true, added: applied.toAdd.length };
  });

  // "Also save daily backups to a folder I choose". The folder always comes from the
  // folder dialog, never from the page.
  handle('data:choose-backup-folder', async (event) => {
    const { canceled, filePaths } = await showDialog('showOpenDialog', event, {
      title: 'Choose a folder for daily backups',
      defaultPath: store.getSettings().backupFolder || app.getPath('documents'),
      properties: ['openDirectory', 'createDirectory'],
    });
    if (canceled || filePaths.length === 0) return { ok: false, canceled: true };
    const folder = filePaths[0];
    if (isInside(store.paths.dir, folder)) return { ok: false, error: 'data-folder' };
    try {
      await store.setBackupFolder(folder);
    } catch (err) {
      if (err.code === 'NOT_A_FOLDER') return { ok: false, error: 'not-a-folder' };
      throw err;
    }
    return { ok: true, settings: settingsView(store) };
  });

  handle('data:clear-backup-folder', async () => {
    await store.setBackupFolder(null);
    return { ok: true, settings: settingsView(store) };
  });

  // ----- Windows -----

  handle('window:open', (_event, name) => {
    if (!WINDOW_NAMES.includes(name)) throw new Error('Unknown window');
    showWindow(name);
  });
}

module.exports = { registerIpc, usableEntries };
