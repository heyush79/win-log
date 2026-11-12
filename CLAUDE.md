# Win Log

Electron tray app for Mac and Windows. Once a day it asks "What did you do today?" and stores
the answers locally. At review time it exports wins for a date range as Markdown bullets.

## Hard rules (v1)

- Tray / menu bar app. No dock icon on Mac, no taskbar-first UI on Windows. Closing a window
  never quits; Quit is in the tray menu.
- All data is local JSON in `app.getPath('userData')`. No server, no account, no analytics,
  no network calls of any kind. This also means: no auto-updater, no remote fonts or scripts,
  and `spellcheck: false` on every window (Electron may download dictionaries otherwise).
- UI is plain HTML/CSS/JS. No React, no framework, no bundler, no TypeScript.
- Zero runtime npm dependencies. Dev dependencies are `electron` and `electron-builder`.
  Ask before adding any package.
- Keep it small. Do not add features that are not listed here without asking.

## Features

- Daily reminder window, default 18:00, Mon–Fri by default; time and days are configurable.
  No days ticked (`reminderDays: []`) means the reminder is off. Settings has an explicit Save
  button (saving on every edit is unsafe: a half-typed time like 01:00 would fire the reminder).
- The reminder shows at most once per enabled day, and not at all if a win is already dated
  today. It lists today's wins.
- If the machine was asleep or off at reminder time, ask at the next wake, unlock or login on
  the same day. Never ask for a previous day.
- Entry: `date`, `text`, optional single `tag`. The tag is typed inline (`#bugfix`); the first
  `#tag` in the line is stored. Tags start with a letter (`#123` is not a tag). Each non-empty
  line typed becomes one entry.
- My Wins window: grouped by week (Monday start), newest first. Header "12 wins this month".
  Search (every word must match the text, tag or date; case and accents are ignored), tag filter
  chips, a friendly empty state. Edit changes the text only (one line): the tag is re-read from
  the text and `updatedAt` is set; `date` and `createdAt` never change. Delete asks first, and
  the question is asked by the main process so no page can skip it.
  Keyboard: `/` focuses search, ↑/↓ move between wins, Enter edits the selected win, Delete
  (Backspace on Mac) asks to delete it, Esc cancels an edit, clears the search, then closes.
- Export window: date range, Markdown bullets grouped by tag (untagged under "Other"),
  "Copy to clipboard" and "Save as .md". Optional "Include dates" checkbox, off by default.
- Global shortcut to add a win, editable in Settings. Default: `Control+Alt+W` (⌃⌥W) on Mac,
  `Control+Alt+Shift+W` on Windows (plain Ctrl+Alt+W would block AltGr characters such as `|`
  and `å`, because Windows treats AltGr as Ctrl+Alt). The pre-1.0 default
  `CommandOrControl+Shift+W` ("Close window" in browsers) is migrated to the new default; any
  other saved shortcut is kept.
- Launch at login, on by default, toggle in Settings. The OS login item is the truth: read it at
  startup and show it in Settings. Call `setLoginItemSettings` only when the user changes the
  setting in Win Log, or once on the first run of the installed app (Mac: only once it runs from
  Applications). Never re-apply it on later starts.

## Layout

- `src/main/` main process: `main.js`, `tray.js`, `windows.js`, `reminder.js`, `shortcut.js`,
  `loginItem.js`, `ipc.js`, `store.js`.
- `src/lib/` pure logic with no Electron imports: `dates.js`, `schedule.js`, `tags.js`,
  `entries.js` (create, edit, delete), `group.js` (order, weeks, counts), `search.js`,
  `accelerator.js`, `exportMarkdown.js`. Put logic here so it can be unit tested.
  Files that pages also need (`dates.js`, `group.js`, `search.js`, `accelerator.js`) use a small
  UMD wrapper, so they work with `require()` in main and a `<script>` tag in a page.
- `src/preload/preload.js` exposes a small `window.winlog` API through `contextBridge`.
- `src/renderer/<entry|wins|export|settings>/` one HTML + JS file per window, shared `common.css`.
- `assets/` tray and app icons. `test/` holds `node:test` tests.

## Data

- `wins.json`: `{ schemaVersion: 1, entries: [{ id, date, text, tag, createdAt, updatedAt }] }`.
  `date` is local `YYYY-MM-DD`. `text` is kept as typed; `tag` is lowercase without `#`, or null.
- `settings.json`: `reminderTime` ("HH:MM"), `reminderDays` (0–6, Sunday = 0; `[]` = off),
  `shortcut`, `openAtLogin` (last known choice), `loginItemSetUp` (first-run login item done),
  `lastPromptedDate`. Invalid or missing fields fall back to defaults; unknown fields are kept.
- `backups/wins-YYYY-MM-DD.json`: copy made before the first write of each day, newest 14 kept.

## Rules that protect the data

- Only the main process reads or writes the data files, through `store.js` and one serialized
  save queue. Renderers go through IPC.
- Every change to wins (add, edit, delete, import) goes through `changeEntries` in `store.js`:
  build the new list with a pure function, write it, and only then update memory. After a
  change, main sends `wins:changed` to every window so open lists refresh.
- Saves are atomic: write a temp file, fsync, rename. Retry rename on EPERM/EBUSY (Windows).
- If `wins.json` cannot be parsed, never overwrite it. Move it to `wins.corrupt-<timestamp>.json`,
  load the newest backup, and tell the user.
- Build dates from local date parts. Never use `toISOString()` for an entry date.
- Bump `schemaVersion` and write a migration for any format change.
- Hold the single-instance lock.

## Rules for the reminder

- No long `setTimeout` to the reminder time. One rule decides:
  enabled day AND now >= reminderTime AND lastPromptedDate != today AND no win dated today.
- Check it on app start, every 30 s, on `powerMonitor` `resume` and `unlock-screen`, and after
  settings change. The rule lives in `src/lib/schedule.js`.
- The reminder window opens with `showInactive()` so it does not steal keystrokes. The
  shortcut-opened window does take focus.

## Rules for tray, windows and security

- Keep the `Tray` in a module-level variable (otherwise it is garbage collected).
- Mac icon is a template image (`trayTemplate.png` + `@2x`); Windows icon is a multi-size `.ico`.
- `LSUIElement` is set in `electron-builder.yml`; also call `app.dock.hide()`.
- Keep a minimal application menu with Edit roles so copy/paste works on Mac.
- Every window: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`,
  `spellcheck: false`, CSP `default-src 'self'`, navigation and `window.open` blocked.
- Render user text with `textContent`, never `innerHTML`. Validate every IPC argument in main.
- If `globalShortcut.register` returns false, show it in Settings. Unregister on quit.

## Commands

- `npm start` run the app in development.
- `npm test` run unit tests (`node --test`).
- `npm run dist:mac` / `npm run dist:win` build signed installers (need signing credentials;
  never commit them).

## Release

Public release. Mac: Developer ID signing, hardened runtime, notarization, universal `.dmg`.
Windows: signed NSIS installer. Launch-at-login and the no-dock-icon behaviour can only be
verified in a packaged build, not with `npm start`.
