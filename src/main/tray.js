'use strict';

const path = require('node:path');
const { Menu, Tray } = require('electron');

const ASSETS = path.join(__dirname, '..', '..', 'assets');

// Module-level on purpose: if the Tray is only held by a local variable it gets
// garbage collected and the icon disappears.
let tray = null;

function iconPath() {
  // macOS: the "Template" suffix makes it a template image (adapts to dark mode
  // and tinted menu bars); trayTemplate@2x.png is picked up automatically.
  if (process.platform === 'darwin') return path.join(ASSETS, 'trayTemplate.png');
  return path.join(ASSETS, 'tray.ico');
}

function createTray({ onAddWin, onSettings, onQuit }) {
  tray = new Tray(iconPath());
  tray.setToolTip('Win Log');
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Add a win', click: onAddWin },
      { label: 'My Wins', enabled: false }, // window not built yet
      { type: 'separator' },
      { label: 'Settings…', click: onSettings },
      { label: 'Quit', click: onQuit },
    ])
  );
  // Windows only opens the context menu on right-click; open it on left-click too.
  if (process.platform === 'win32') tray.on('click', () => tray.popUpContextMenu());
  return tray;
}

module.exports = { createTray };
