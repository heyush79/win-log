'use strict';

// The global "Add a win" shortcut. register() returns false when another app already
// owns the keys; that state is kept so the Settings window can show it.

const { globalShortcut } = require('electron');

// What the Settings window can record. A key needs a modifier other than Shift alone,
// otherwise the shortcut would swallow ordinary typing in every app.
const MODIFIERS = new Set(['CommandOrControl', 'Control', 'Alt', 'Shift']);
const KEY_RE =
  /^([A-Z0-9]|F([1-9]|1\d|2[0-4])|Space|Up|Down|Left|Right|Home|End|PageUp|PageDown|Insert|Delete|[-=[\]\\;',./`])$/;

let current = null; // accelerator in use (it may have failed to register)
let active = false; // whether `current` is registered right now
let onPress = () => {};

function isValidAccelerator(value) {
  if (typeof value !== 'string' || value.length > 60) return false;
  const parts = value.split('+');
  const key = parts.pop();
  return (
    KEY_RE.test(key) &&
    parts.every((p) => MODIFIERS.has(p)) &&
    new Set(parts).size === parts.length &&
    parts.some((p) => p !== 'Shift')
  );
}

function tryRegister(accelerator) {
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

function unregisterShortcuts() {
  globalShortcut.unregisterAll();
  active = false;
}

module.exports = {
  initShortcut,
  changeShortcut,
  isShortcutActive,
  isValidAccelerator,
  unregisterShortcuts,
};
