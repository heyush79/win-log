'use strict';

// Keyboard shortcut ("accelerator") helpers.
// Shared by the main process (require) and the Settings and Welcome pages
// (<script> tag, where it becomes window.winlogAccelerator), so it has no imports.

(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.winlogAccelerator = factory();
})(typeof globalThis === 'object' ? globalThis : this, function () {
  // A shortcut needs a modifier other than Shift: Shift alone would swallow
  // ordinary typing in every app.
  const MODIFIERS = new Set(['CommandOrControl', 'Control', 'Alt', 'Shift']);
  const KEY_RE =
    /^([A-Z0-9]|F([1-9]|1\d|2[0-4])|Space|Up|Down|Left|Right|Home|End|PageUp|PageDown|Insert|Delete|[-=[\]\\;',./`])$/;

  // The default before v1.0. It is "Close window" in browsers, so a saved copy of it
  // is treated as "never changed by the user" and replaced by the current default.
  const LEGACY_DEFAULT_SHORTCUT = 'CommandOrControl+Shift+W';

  /**
   * The default "Add a win" shortcut.
   * Mac: ⌃⌥W. Common Mac apps do not use Control+Option+W, and it types no character.
   * Windows: Ctrl+Alt+Shift+W. Plain Ctrl+Alt+W is avoided because Windows treats the
   * AltGr key as Ctrl+Alt, so it would stop people typing "|" on Czech, Hungarian or
   * Croatian keyboards and "å" on US-International.
   */
  function defaultShortcut(platform) {
    return platform === 'darwin' ? 'Control+Alt+W' : 'Control+Alt+Shift+W';
  }

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

  const NAMED_KEYS = {
    Space: 'Space',
    ArrowUp: 'Up',
    ArrowDown: 'Down',
    ArrowLeft: 'Left',
    ArrowRight: 'Right',
    Home: 'Home',
    End: 'End',
    PageUp: 'PageUp',
    PageDown: 'PageDown',
    Insert: 'Insert',
    Delete: 'Delete',
    Minus: '-',
    Equal: '=',
    BracketLeft: '[',
    BracketRight: ']',
    Backslash: '\\',
    Semicolon: ';',
    Quote: "'",
    Comma: ',',
    Period: '.',
    Slash: '/',
    Backquote: '`',
  };

  // event.code names the physical key, so Shift+1 is recorded as "Shift+1", not "!".
  function keyFromCode(code) {
    if (typeof code !== 'string') return null;
    if (/^Key[A-Z]$/.test(code)) return code.slice(3);
    if (/^Digit\d$/.test(code)) return code.slice(5);
    if (/^F([1-9]|1\d|2[0-4])$/.test(code)) return code;
    return Object.prototype.hasOwnProperty.call(NAMED_KEYS, code) ? NAMED_KEYS[code] : null;
  }

  /**
   * The accelerator for a key press ({ code, metaKey, ctrlKey, altKey, shiftKey }),
   * or null if it cannot be a shortcut. The result always passes isValidAccelerator.
   * Mac: ⌘ becomes CommandOrControl and ⌃ becomes Control.
   * Windows: Ctrl becomes CommandOrControl; the Windows key belongs to Windows.
   */
  function acceleratorFromKeyEvent(event, platform) {
    const isMac = platform === 'darwin';
    const key = keyFromCode(event.code);
    if (!key) return null;
    if (!isMac && event.metaKey) return null;
    const parts = [];
    if (isMac ? event.metaKey : event.ctrlKey) parts.push('CommandOrControl');
    if (isMac && event.ctrlKey) parts.push('Control');
    if (event.altKey) parts.push('Alt');
    if (event.shiftKey) parts.push('Shift');
    if (!parts.some((p) => p !== 'Shift')) return null;
    return [...parts, key].join('+');
  }

  const MAC_SYMBOLS = { Control: '⌃', Alt: '⌥', Shift: '⇧', CommandOrControl: '⌘' };
  const MAC_ORDER = ['Control', 'Alt', 'Shift', 'CommandOrControl'];
  const WIN_ORDER = ['CommandOrControl', 'Control', 'Alt', 'Shift'];
  const WIN_NAMES = { CommandOrControl: 'Ctrl', Control: 'Ctrl' };

  /** How a shortcut is shown to people: "⌃⌥W" on Mac, "Ctrl+Alt+Shift+W" on Windows. */
  function formatAccelerator(accelerator, platform) {
    if (typeof accelerator !== 'string' || accelerator === '') return '';
    const parts = accelerator.split('+');
    const key = parts.pop();
    if (platform === 'darwin') {
      parts.sort((a, b) => MAC_ORDER.indexOf(a) - MAC_ORDER.indexOf(b));
      return parts.map((p) => MAC_SYMBOLS[p] || p).join('') + key;
    }
    parts.sort((a, b) => WIN_ORDER.indexOf(a) - WIN_ORDER.indexOf(b));
    const names = [...new Set(parts.map((p) => WIN_NAMES[p] || p))];
    return [...names, key].join('+');
  }

  return {
    LEGACY_DEFAULT_SHORTCUT,
    defaultShortcut,
    isValidAccelerator,
    keyFromCode,
    acceleratorFromKeyEvent,
    formatAccelerator,
  };
});
