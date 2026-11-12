'use strict';

// The global "Add a win" shortcut. register() returns false when another app already
// owns the keys; that state is kept so the Settings window can show it.

const { globalShortcut } = require('electron');
const { isValidAccelerator } = require('../lib/accelerator');

let current = null; // accelerator in use (it may have failed to register)
let active = false; // whether `current` is registered right now
let onPress = () => {};

function tryRegister(accelerator) {
  if (!isValidAccelerator(accelerator)) return false;
  try {
    return globalShortcut.register(accelerator, () => onPress());
  } catch (err) {
    console.error(`Shortcut "${accelerator}" is not valid:`, err.message);
    return false; // an accelerator Electron cannot parse throws instead of returning false
  }
}

/** Registers the saved shortcut at startup. Call after app 'ready'. */
function initShortcut(accelerator, handler) {
  onPress = handler;
  current = accelerator;
  active = tryRegister(accelerator);
}

/**
 * Switches to a new shortcut. Returns false, and keeps the old one, if the new one
 * cannot be registered.
 */
function changeShortcut(accelerator) {
  if (active) globalShortcut.unregister(current);
  if (tryRegister(accelerator)) {
    current = accelerator;
    active = true;
    return true;
  }
  active = current ? tryRegister(current) : false;
  return false;
}

function isShortcutActive() {
  return active;
}

/** The shortcut in use, or null before initShortcut(). */
function currentShortcut() {
  return current;
}

function unregisterShortcuts() {
  globalShortcut.unregisterAll();
  active = false;
}

module.exports = {
  initShortcut,
  changeShortcut,
  isShortcutActive,
  currentShortcut,
  unregisterShortcuts,
};
