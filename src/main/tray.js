'use strict';

const path = require('node:path');
const { Menu, Tray } = require('electron');

const ASSETS = path.join(__dirname, '..', '..', 'assets');

// Module-level on purpose: if the Tray is only held by a local variable it gets
// garbage collected and the icon disappears.
let tray = null;
let handlers = null;

function iconPath() {
  // macOS: the "Template" suffix makes it a template image (adapts to dark mode
  // and tinted menu bars); trayTemplate@2x.png is picked up automatically.
  if (process.platform === 'darwin') return path.join(ASSETS, 'trayTemplate.png');
  return path.join(ASSETS, 'tray.ico');
}

/** The first, greyed-out line of the menu. */
function todayLabel(count) {
  if (count === 0) return 'Today: no wins yet';
  return count === 1 ? 'Today: 1 win' : `Today: ${count} wins`;
}

function buildMenu({ todayCount, shortcut }) {
  const addWin = { label: 'Add a win', click: handlers.onAddWin };
  if (shortcut) {
    // Only shows the keys next to the item. The shortcut itself lives in shortcut.js.
    addWin.accelerator = shortcut;
    addWin.registerAccelerator = false;
  }
  return Menu.buildFromTemplate([
    { label: todayLabel(todayCount), enabled: false },
    { type: 'separator' },
    addWin,
    { label: 'My Wins', click: handlers.onMyWins },
    { label: 'Export…', click: handlers.onExport },
    { type: 'separator' },
    { label: 'Settings…', click: handlers.onSettings },
    { label: 'About Win Log', click: handlers.onAbout },
    { type: 'separator' },
    { label: 'Quit', click: handlers.onQuit },
  ]);
}

/**
 * @param {{ onAddWin, onMyWins, onExport, onSettings, onAbout, onQuit }} menuHandlers
 * @param {{ todayCount: number, shortcut: string | null }} state  see updateTray
 */
function createTray(menuHandlers, state) {
  handlers = menuHandlers;
  tray = new Tray(iconPath());
  tray.setToolTip('Win Log');
  tray.setContextMenu(buildMenu(state));
  // Windows only opens the context menu on right-click; open it on left-click too.
  if (process.platform === 'win32') tray.on('click', () => tray.popUpContextMenu());
  return tray;
}

/**
 * Rebuilds the menu. Call when today's number of wins, the day, or the shortcut changes.
 * shortcut is the working "Add a win" shortcut, or null if there is none to show.
 */
function updateTray(state) {
  if (tray && !tray.isDestroyed()) tray.setContextMenu(buildMenu(state));
}

module.exports = { createTray, updateTray, todayLabel };
