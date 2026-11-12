'use strict';

const path = require('node:path');
const { app, BrowserWindow, nativeTheme, screen } = require('electron');

const RENDERER_DIR = path.join(__dirname, '..', 'renderer');
const PRELOAD = path.join(__dirname, '..', 'preload', 'preload.js');

const PAGES = {
  entry: {
    file: 'entry/entry.html',
    title: 'Add a win',
    width: 480,
    height: 420,
    minWidth: 360,
    minHeight: 300,
  },
  wins: {
    file: 'wins/wins.html',
    title: 'My Wins',
    width: 640,
    height: 680,
    minWidth: 440,
    minHeight: 380,
  },
  export: {
    file: 'export/export.html',
    title: 'Export wins',
    width: 580,
    height: 640,
    minWidth: 460,
    minHeight: 440,
  },
  settings: {
    file: 'settings/settings.html',
    title: 'Win Log Settings',
    width: 480,
    height: 680,
    minWidth: 480,
    maxWidth: 480,
    minHeight: 420,
    useContentSize: true,
    minimizable: false,
  },
  about: {
    file: 'about/about.html',
    title: 'About Win Log',
    width: 380,
    height: 400,
    useContentSize: true,
    resizable: false,
    minimizable: false,
  },
  welcome: {
    file: 'welcome/welcome.html',
    title: 'Welcome to Win Log',
    width: 520,
    height: 660,
    minWidth: 520,
    maxWidth: 520,
    minHeight: 420,
    useContentSize: true,
    minimizable: false,
  },
};

// The windows a page may ask to open (see 'window:open' in ipc.js).
// The welcome window is only ever opened by the app itself, on the first run.
const WINDOW_NAMES = Object.keys(PAGES).filter((name) => name !== 'welcome');

// One window per page at most.
const openWindows = new Map();

function secureWebPreferences() {
  return {
    preload: PRELOAD,
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
    spellcheck: false, // Electron may download spellcheck dictionaries otherwise
  };
}

// With no dock icon, macOS can open windows behind the app you are using.
function bringToFront(win) {
  if (win.isMinimized()) win.restore();
  app.focus({ steal: true });
  win.show();
  win.focus();
}

/**
 * Shows a page's window, reusing it if it is already open.
 * focus: false shows it without taking keyboard focus from the app in use.
 */
function showWindow(name, { focus = true } = {}) {
  if (!Object.hasOwn(PAGES, name)) throw new Error(`Unknown window: ${name}`);
  const existing = openWindows.get(name);
  if (existing && !existing.isDestroyed()) {
    if (focus) bringToFront(existing);
    else if (!existing.isVisible()) existing.showInactive();
    return existing;
  }

  const { file, ...options } = PAGES[name];
  // Never taller than the screen: on a small laptop the buttons at the bottom would be cut off.
  // The pages scroll when they get less room than they ask for.
  const roomy = screen.getPrimaryDisplay().workAreaSize.height - 60;
  if (options.height > roomy) options.height = Math.max(options.minHeight || 300, roomy);
  const win = new BrowserWindow({
    ...options,
    show: false,
    maximizable: false,
    fullscreenable: false,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#1e1e1e' : '#ffffff',
    webPreferences: secureWebPreferences(),
  });
  openWindows.set(name, win);
  win.once('ready-to-show', () => (focus ? bringToFront(win) : win.showInactive()));
  win.on('closed', () => {
    if (openWindows.get(name) === win) openWindows.delete(name);
  });
  win.loadFile(path.join(RENDERER_DIR, file));
  return win;
}

/** The open window for a page, or null. */
function getWindow(name) {
  const win = openWindows.get(name);
  return win && !win.isDestroyed() ? win : null;
}

/** "Add a win". The reminder passes { focus: false } so it never steals keystrokes. */
function showEntryWindow(options) {
  return showWindow('entry', options);
}

module.exports = {
  showWindow,
  getWindow,
  showEntryWindow,
  RENDERER_DIR,
  WINDOW_NAMES,
};
