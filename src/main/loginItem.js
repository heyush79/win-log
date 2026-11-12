'use strict';

// "Start Win Log at login".
//
// The operating system's login item is the truth, not settings.json: people can remove
// Win Log in System Settings > General > Login Items (Mac) or Task Manager > Startup apps
// (Windows) at any time, and Win Log must not quietly add it back. So the login item is
// written only (1) on the very first run of the installed app, to apply the default, and
// (2) when the user changes the checkbox in Win Log's Settings.
//
// Login items only work for the installed app. In development (npm start) they would
// register the bare Electron binary, so nothing is read or written there.

const { app } = require('electron');

function loginItemApplies() {
  return app.isPackaged;
}

/**
 * The real state from the OS: { openAtLogin, needsApproval }, or null in development
 * or if it cannot be read.
 */
function readLoginItem() {
  if (!loginItemApplies()) return null;
  try {
    const s = app.getLoginItemSettings();
    if (process.platform === 'win32') {
      // Task Manager can disable the entry without removing it; this accounts for that.
      const on =
        typeof s.executableWillLaunchAtLogin === 'boolean' ? s.executableWillLaunchAtLogin : s.openAtLogin;
      return { openAtLogin: Boolean(on), needsApproval: false };
    }
    // macOS 13+: registered but switched off by the user in System Settings.
    const needsApproval = s.status === 'requires-approval';
    return { openAtLogin: Boolean(s.openAtLogin) && !needsApproval, needsApproval };
  } catch (err) {
    console.error('Could not read the login item:', err);
    return null;
  }
}

/** Turns the login item on or off. Returns false if that failed or does not apply. */
function writeLoginItem(enabled) {
  if (!loginItemApplies()) return false;
  try {
    // On Windows this also clears a "Disabled" mark set in Task Manager when turning it on.
    app.setLoginItemSettings({ openAtLogin: enabled });
    return true;
  } catch (err) {
    console.error('Could not change the login item:', err);
    return false;
  }
}

/**
 * On the first run of the installed app, applies the saved choice (on by default) once.
 * After that the login item is left alone unless the user changes it in Settings.
 */
async function setUpLoginItemOnFirstRun(store) {
  const settings = store.getSettings();
  if (!loginItemApplies() || settings.loginItemSetUp) return;
  // Mac: wait until Win Log runs from Applications. A login item that points into the
  // disk image or the Downloads folder would break as soon as that copy is gone.
  if (process.platform === 'darwin' && !app.isInApplicationsFolder()) return;
  writeLoginItem(settings.openAtLogin);
  await store.updateSettings({ loginItemSetUp: true });
}

/** Keeps settings.json in step with what the OS says, e.g. after a change in System Settings. */
async function syncLoginItemSetting(store) {
  const state = readLoginItem();
  if (state && state.openAtLogin !== store.getSettings().openAtLogin) {
    await store.updateSettings({ openAtLogin: state.openAtLogin });
  }
}

module.exports = {
  loginItemApplies,
  readLoginItem,
  writeLoginItem,
  setUpLoginItemOnFirstRun,
  syncLoginItemSetting,
};
