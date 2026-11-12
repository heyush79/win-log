'use strict';

const { app, dialog, Menu } = require('electron');
const { createStore } = require('./store');
const { createTray } = require('./tray');
const { showEntryWindow, showSettingsWindow } = require('./windows');
const { registerIpc } = require('./ipc');
const { startReminder } = require('./reminder');
const { initShortcut, unregisterShortcuts } = require('./shortcut');

// One running copy only, so two processes never write the same file.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  start();
}

function start() {
  const store = createStore(app.getPath('userData'));

  app.on('second-instance', () => showEntryWindow());

  // Closing the last window must not quit: the app lives in the tray.
  app.on('window-all-closed', () => {});

  // Let any save in progress finish before the process exits.
  let savesFlushed = false;
  app.on('before-quit', (event) => {
    if (savesFlushed) return;
    event.preventDefault();
    store.flush().finally(() => {
      savesFlushed = true;
      app.quit();
    });
  });

  app.on('will-quit', () => unregisterShortcuts());

  // No page may navigate away or open new windows.
  app.on('web-contents-created', (_event, contents) => {
    contents.on('will-navigate', (e) => e.preventDefault());
    contents.setWindowOpenHandler(() => ({ action: 'deny' }));
  });

  app.whenReady().then(async () => {
    app.dock?.hide();
    setApplicationMenu();

    let recovered;
    try {
      ({ recovered } = await store.load());
      await store.loadSettings();
    } catch (err) {
      dialog.showErrorBox(
        'Win Log could not open its data',
        `${err.message}\n\nNo file was changed. Your data folder is:\n${app.getPath('userData')}`
      );
      app.quit();
      return;
    }

    const settings = store.getSettings();
    applyOpenAtLogin(settings.openAtLogin);
    initShortcut(settings.shortcut, () => showEntryWindow()); // takes focus

    // The reminder never takes focus, so it cannot catch keys meant for another app.
    const reminder = startReminder({ store, showReminder: () => showEntryWindow({ focus: false }) });

    registerIpc(store, {
      onSettingsSaved(changes) {
        if ('openAtLogin' in changes) applyOpenAtLogin(changes.openAtLogin);
        reminder.check(); // e.g. a reminder time that is already past today shows now
      },
    });
    createTray({
      onAddWin: () => showEntryWindow(),
      onSettings: () => showSettingsWindow(),
      onQuit: () => app.quit(),
    });

    if (recovered) await showRecoveryNotice(recovered);
  });
}

// Applied on every start so the OS setting follows settings.json. Skipped in
// development: there it would register the bare Electron binary as a login item.
function applyOpenAtLogin(enabled) {
  if (!app.isPackaged) return;
  try {
    app.setLoginItemSettings({ openAtLogin: enabled });
  } catch (err) {
    console.error('Could not change the login item:', err);
  }
}

// macOS needs an Edit menu for Cmd+C / Cmd+V / Cmd+Z to work in text fields.
// Windows handles those keys itself, and a menu bar would only add clutter there.
function setApplicationMenu() {
  if (process.platform !== 'darwin') {
    Menu.setApplicationMenu(null);
    return;
  }
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([{ role: 'appMenu' }, { role: 'editMenu' }, { role: 'windowMenu' }])
  );
}

async function showRecoveryNotice({ corruptFile, backupFile }) {
  app.focus({ steal: true });
  await dialog.showMessageBox({
    type: 'warning',
    title: 'Win Log',
    message: 'Your wins file could not be read.',
    detail:
      `The unreadable file was kept here:\n${corruptFile}\n\n` +
      (backupFile
        ? `Your wins were restored from this backup:\n${backupFile}`
        : 'No backup was found, so Win Log started with an empty list.'),
  });
}
