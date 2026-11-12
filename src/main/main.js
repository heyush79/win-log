'use strict';

const { app, dialog, Menu, session } = require('electron');
const { localDate } = require('../lib/dates');
const { countOnDate } = require('../lib/group');
const { createStore } = require('./store');
const { createTray, updateTray } = require('./tray');
const { showWindow, getWindow, showEntryWindow } = require('./windows');
const { registerIpc, usableEntries } = require('./ipc');
const { startReminder } = require('./reminder');
const { initShortcut, isShortcutActive, currentShortcut, unregisterShortcuts } = require('./shortcut');
const { setUpLoginItemOnFirstRun, syncLoginItemSetting } = require('./loginItem');

// The same id as appId in electron-builder.js. Windows uses it to tie the running app
// to its Start Menu shortcut and to name the "start at login" entry.
const APP_ID = 'io.github.ayushcodes.winlog';
if (process.platform === 'win32') app.setAppUserModelId(APP_ID);

// One running copy only, so two processes never write the same file.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  start();
}

function start() {
  const store = createStore(app.getPath('userData'));

  // Opening Win Log again while it is running shows that it is there. Windows starts a
  // second copy (which quits at once); macOS sends "activate" to the running one.
  app.on('second-instance', () => showEntryWindow());
  app.on('activate', (_event, hasVisibleWindows) => {
    if (!hasVisibleWindows && app.isReady()) showEntryWindow();
  });

  // Closing the last window must not quit: the app lives in the tray.
  app.on('window-all-closed', () => {});

  // Let a save that is in progress finish before the process exits.
  //
  // Only when there is one. Pausing every quit caused trouble: when the quit comes from
  // the system (Cmd+Q, log out, shut down, a termination signal) a paused quit can show
  // up as "Win Log interrupted logout". And quitting again from inside this handler runs
  // inside Electron's own quit call, which then forgets that it is quitting: the windows
  // close but the app stays. So: do not pause unless needed, and retry on a fresh turn
  // of the event loop (setImmediate), never from a promise callback.
  let savesFlushed = false;
  app.on('before-quit', (event) => {
    if (savesFlushed || !store.hasUnfinishedWrites()) return;
    event.preventDefault();
    store.flush().finally(() => {
      savesFlushed = true;
      setImmediate(() => app.quit());
    });
  });

  app.on('will-quit', () => unregisterShortcuts());

  // No page may navigate away, open new windows or embed other pages.
  app.on('web-contents-created', (_event, contents) => {
    contents.on('will-navigate', (e) => e.preventDefault());
    contents.on('will-attach-webview', (e) => e.preventDefault());
    contents.setWindowOpenHandler(() => ({ action: 'deny' }));
  });

  app.whenReady().then(async () => {
    app.dock?.hide();
    setApplicationMenu();
    lockDownSession();

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

    try {
      await setUpLoginItemOnFirstRun(store);
      await syncLoginItemSetting(store);
    } catch (err) {
      console.error('Could not set up start at login:', err); // not worth stopping the app
    }

    const settings = store.getSettings();
    initShortcut(settings.shortcut, () => showEntryWindow()); // takes focus

    // The tray menu starts with "Today: 2 wins". Redraw it when wins, the shortcut or the day change.
    const trayState = () => ({
      todayCount: countOnDate(usableEntries(store), localDate()),
      shortcut: isShortcutActive() ? currentShortcut() : null,
    });
    let trayDay = localDate();
    const refreshTray = () => {
      trayDay = localDate();
      updateTray(trayState());
    };

    let reminder = null;
    registerIpc(store, {
      onSettingsSaved() {
        refreshTray();
        reminder?.check(); // e.g. a reminder time that is already past today shows now
      },
      onWinsChanged: refreshTray,
    });

    createTray(
      {
        onAddWin: () => showEntryWindow(),
        onMyWins: () => showWindow('wins'),
        onExport: () => showWindow('export'),
        onSettings: () => showWindow('settings'),
        onAbout: () => showWindow('about'),
        onQuit: () => app.quit(),
      },
      trayState()
    );

    // First run only: say hello and explain where the icon is.
    if (!settings.welcomeShown) {
      const welcome = showWindow('welcome');
      welcome.on('closed', () => reminder?.check());
      store
        .updateSettings({ welcomeShown: true })
        .catch((err) => console.error('Could not save welcomeShown:', err));
    }

    reminder = startReminder({
      store,
      // The reminder never takes focus, so it cannot catch keys meant for another app.
      showReminder: () => showEntryWindow({ focus: false }),
      // On the first run the welcome window comes first; the reminder waits until it is closed.
      isBlocked: () => getWindow('welcome') !== null,
      onTick: () => {
        if (localDate() !== trayDay) refreshTray(); // a new day: "Today" starts again
      },
    });

    store.syncBackupFolder(); // catches up a missed copy; never rejects

    if (recovered) await showRecoveryNotice(recovered);
  });
}

// Win Log never uses the network. This makes sure of it: every web request from a
// page is cancelled, and every permission a page could ask for is refused.
function lockDownSession() {
  const ses = session.defaultSession;
  ses.webRequest.onBeforeRequest(
    { urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*', 'ftp://*/*'] },
    (_details, callback) => callback({ cancel: true })
  );
  ses.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  ses.setPermissionCheckHandler(() => false);
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
