'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  defaultShortcut,
  isValidAccelerator,
  acceleratorFromKeyEvent,
  formatAccelerator,
  LEGACY_DEFAULT_SHORTCUT,
} = require('../src/lib/accelerator');

const key = (code, mods = {}) => ({ code, metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, ...mods });

test('defaults: ⌃⌥W on Mac, Ctrl+Alt+Shift+W on Windows (no AltGr clash)', () => {
  assert.equal(defaultShortcut('darwin'), 'Control+Alt+W');
  assert.equal(defaultShortcut('win32'), 'Control+Alt+Shift+W');
  assert.equal(formatAccelerator(defaultShortcut('darwin'), 'darwin'), '⌃⌥W');
  assert.equal(formatAccelerator(defaultShortcut('win32'), 'win32'), 'Ctrl+Alt+Shift+W');
  for (const platform of ['darwin', 'win32', 'linux']) {
    assert.equal(isValidAccelerator(defaultShortcut(platform)), true, platform);
    assert.notEqual(defaultShortcut(platform), LEGACY_DEFAULT_SHORTCUT);
  }
});

test('isValidAccelerator needs a known key and a modifier other than Shift', () => {
  for (const ok of ['CommandOrControl+Shift+W', 'Control+Alt+W', 'Alt+F5', 'Control+Space', 'Alt+/', 'Control+Alt+Shift+Up']) {
    assert.equal(isValidAccelerator(ok), true, ok);
  }
  for (const bad of ['W', 'Shift+W', 'Control+Control+W', 'Super+W', 'Control+', 'Control+Ww', 'Control+F25', '', null, 42, 'Control+Alt+' + 'W'.repeat(60)]) {
    assert.equal(isValidAccelerator(bad), false, String(bad));
  }
});

test('recording on Mac: ⌘ is CommandOrControl, ⌃ is Control', () => {
  assert.equal(acceleratorFromKeyEvent(key('KeyW', { ctrlKey: true, altKey: true }), 'darwin'), 'Control+Alt+W');
  assert.equal(acceleratorFromKeyEvent(key('KeyK', { metaKey: true, shiftKey: true }), 'darwin'), 'CommandOrControl+Shift+K');
  assert.equal(acceleratorFromKeyEvent(key('Digit1', { metaKey: true, shiftKey: true }), 'darwin'), 'CommandOrControl+Shift+1');
});

test('recording on Windows: Ctrl is CommandOrControl and the Windows key is refused', () => {
  assert.equal(acceleratorFromKeyEvent(key('KeyW', { ctrlKey: true, altKey: true, shiftKey: true }), 'win32'), 'CommandOrControl+Alt+Shift+W');
  assert.equal(acceleratorFromKeyEvent(key('KeyW', { metaKey: true, altKey: true }), 'win32'), null);
});

test('recording refuses Shift-only, plain keys and unknown keys', () => {
  assert.equal(acceleratorFromKeyEvent(key('KeyA', { shiftKey: true }), 'darwin'), null);
  assert.equal(acceleratorFromKeyEvent(key('KeyA'), 'win32'), null);
  assert.equal(acceleratorFromKeyEvent(key('Numpad1', { ctrlKey: true }), 'win32'), null);
  assert.equal(acceleratorFromKeyEvent(key('ShiftLeft', { ctrlKey: true }), 'win32'), null);
  assert.equal(acceleratorFromKeyEvent(key('toString', { ctrlKey: true }), 'win32'), null);
});

test('every recordable key press gives a valid accelerator', () => {
  const codes = ['KeyA', 'KeyZ', 'Digit0', 'F1', 'F24', 'Space', 'ArrowUp', 'Home', 'Delete', 'Minus', 'Backslash', 'Backquote', 'Quote'];
  for (const platform of ['darwin', 'win32']) {
    for (const code of codes) {
      const acc = acceleratorFromKeyEvent(key(code, { ctrlKey: true, altKey: true }), platform);
      assert.equal(isValidAccelerator(acc), true, `${platform} ${code} -> ${acc}`);
    }
  }
});

test('formatAccelerator orders modifiers the platform way', () => {
  assert.equal(formatAccelerator('Shift+CommandOrControl+W', 'darwin'), '⇧⌘W');
  assert.equal(formatAccelerator('Shift+Alt+Control+K', 'win32'), 'Ctrl+Alt+Shift+K');
  assert.equal(formatAccelerator('CommandOrControl+Control+K', 'win32'), 'Ctrl+K');
  assert.equal(formatAccelerator('', 'darwin'), '');
});

const { keyFromCode } = require('../src/lib/accelerator');

test('keyFromCode names the physical key, or null for keys that cannot be a shortcut', () => {
  assert.equal(keyFromCode('KeyW'), 'W');
  assert.equal(keyFromCode('Digit7'), '7');
  assert.equal(keyFromCode('F12'), 'F12');
  assert.equal(keyFromCode('ArrowLeft'), 'Left');
  assert.equal(keyFromCode('Slash'), '/');
  assert.equal(keyFromCode('Backquote'), '`');
  for (const bad of ['F25', 'F0', 'Numpad5', 'Enter', 'Tab', 'Escape', 'ControlLeft', 'MetaLeft', 'constructor', '', null, undefined, 5]) {
    assert.equal(keyFromCode(bad), null, String(bad));
  }
});
