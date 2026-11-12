# Win Log

Electron tray app for Mac and Windows. Once a day it asks "What did you do today?" and stores
the answers locally. At review time it exports wins for a date range as Markdown bullets or
plain text.

## Hard rules (v1)

- Tray / menu bar app. No dock icon on Mac, no taskbar-first UI on Windows. Closing a window
  never quits; Quit is in the tray menu.
- All data is local JSON in `app.getPath('userData')`. No server, no account, no analytics,
  no network calls of any kind. This also means: no auto-updater, no remote fonts or scripts,
  and `spellcheck: false` on every window (Electron may download dictionaries otherwise).
- The app never contacts a server. Links (Releases, Issues, website) open in the user's browser
  with `shell.openExternal`, and only the fixed addresses in `src/lib/links.js` can be opened.
- UI is plain HTML/CSS/JS. No React, no framework, no bundler, no TypeScript.
- Zero runtime npm dependencies. Dev dependencies are `electron` and `electron-builder`.
  Ask before adding any package.
- Keep it small. Do not add features that are not listed here without asking.
- Every text a user can read is simple, plain English: short sentences, no jargon.

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
- Export window: range presets (This month, Last month, Last 3 months [default], Last 6 months,
  This year, Custom), a live preview, "Copy to clipboard" and "Save as file…".
  Formats: Markdown bullets under a `##` heading per tag (headings A–Z, untagged last under
  "Other"; no headings at all if nothing is tagged), or plain text for HR tools that do not
  accept Markdown (same layout, no `##`, no escaping). Wins inside a group are oldest first.
  The tag is taken out of the bullet because it is already the heading. Markdown characters in
  the text are escaped so it shows as typed. "Include dates" (off by default) adds
  "(3 Nov 2026)" at the end of each bullet. "Last N months" ends today and starts the day after
  the same date N months ago. The page only sends options; main builds the text, writes the
  clipboard and shows the save dialog.
- Global shortcut to add a win, editable in Settings. Default: `Control+Alt+W` (⌃⌥W) on Mac,
  `Control+Alt+Shift+W` on Windows (plain Ctrl+Alt+W would block AltGr characters such as `|`
  and `å`, because Windows treats AltGr as Ctrl+Alt). The pre-1.0 default
  `CommandOrControl+Shift+W` ("Close window" in browsers) is migrated to the new default; any
  other saved shortcut is kept.
- Launch at login, on by default, toggle in Settings. The OS login item is the truth: read it at
  startup and show it in Settings. Call `setLoginItemSettings` only when the user changes the
  setting in Win Log, or once on the first run of the installed app (Mac: only once it runs from
  Applications). Never re-apply it on later starts.
- Welcome window, on the first launch only (`welcomeShown`): what Win Log does in three short
  lines, where the icon is (Mac menu bar; Windows tray and its hidden-icons arrow), reminder
  time and days, the shortcut, "Your wins stay on this computer" with the data folder path, and
  the button "Add my first win". The reminder waits while this window is open.
- Tray menu, in this order: "Today: 2 wins" (disabled), Add a win (shows the shortcut), My Wins,
  Export…, Settings…, About Win Log, Quit. The first line follows wins and the change of day.
- Settings > Your data: Open data folder; Export backup… (one `.json` file in the `wins.json`
  format); Import backup… (adds wins whose `id` is not here yet, never changes a win that is
  here, shows a summary and asks before applying; the tag is always re-read from the text);
  "Also save daily backups to a folder I choose" (see Data). These act at once and never touch
  unsaved changes in the form above them.
- About window: version, MIT license, "Check for updates" (opens the GitHub Releases page),
  "Report a problem" (opens GitHub Issues), Website.
- One calm design for every window (`common.css`): system font, light and dark mode, visible
  focus rings, labels for screen readers, full keyboard use, no motion when the system asks
  for reduced motion. Windows taller than the screen shrink and their middle scrolls.

## Layout

- `src/main/` main process: `main.js`, `tray.js`, `windows.js`, `reminder.js`, `shortcut.js`,
  `loginItem.js`, `ipc.js`, `store.js`.
- `src/lib/` pure logic with no Electron imports: `dates.js`, `schedule.js`, `tags.js`,
  `entries.js` (create, edit, delete), `group.js` (order, weeks, counts), `search.js`,
  `accelerator.js`, `exportMarkdown.js` (range presets, Markdown and plain text), `backup.js`
  (read a backup, merge by id, backup-folder file names), `links.js` (the only web addresses).
  Put logic here so it can be unit tested. Files that pages also need (`dates.js`, `group.js`,
  `search.js`, `accelerator.js`) use a small UMD wrapper, so they work with `require()` in main
  and a `<script>` tag in a page.
- `src/preload/preload.js` exposes a small `window.winlog` API through `contextBridge`.
- `src/renderer/<entry|wins|export|settings|about|welcome>/` one HTML + JS file per window,
  shared `common.css`.
- `assets/` icons used by the running app: `icon.svg` and `tray-mac.svg` (sources), `icon.png`,
  `trayTemplate.png` + `@2x`, `tray.ico`. `build/` icons for the installers (`icon.icns`,
  `icon.ico`, `icon.png`). All of them are made by `scripts/make-icons.js` (`npm run icons`).
- `test/` holds `node:test` tests.

## Data

- `wins.json`: `{ schemaVersion: 1, entries: [{ id, date, text, tag, createdAt, updatedAt }] }`.
  `date` is local `YYYY-MM-DD`. `text` is kept as typed; `tag` is lowercase without `#`, or null.
- `settings.json`: `reminderTime` ("HH:MM"), `reminderDays` (0–6, Sunday = 0; `[]` = off),
  `shortcut`, `openAtLogin` (last known choice), `loginItemSetUp` (first-run login item done),
  `welcomeShown`, `backupFolder` (absolute path or null), `lastPromptedDate`. Invalid or missing
  fields fall back to defaults; unknown fields are kept. A page can only change `reminderTime`,
  `reminderDays`, `shortcut` and `openAtLogin`.
- `backups/wins-YYYY-MM-DD.json`: copy made before the first write of each day, newest 14 kept.
- Optional backup folder chosen by the user (for example inside iCloud Drive, Google Drive or
  OneDrive): after every change, today's copy is written there as
  `win-log-backup-<computer>-YYYY-MM-DD.json`. Only this computer's own copies are pruned
  (newest 14 kept); no other file in that folder is ever touched, and the folder is not created
  if it is missing. The copy runs on its own chain: a slow or missing folder never delays or
  fails a save. Live data always stays in `userData`.

## Rules that protect the data

- Only the main process reads or writes the data files, through `store.js` and one serialized
  save queue. Renderers go through IPC.
- Every change to wins (add, edit, delete, import) goes through `changeEntries` in `store.js`:
  build the new list with a pure function, write it, and only then update memory. After a
  change, main sends `wins:changed` to every window so open lists refresh.
- Saves are atomic: write a temp file, fsync, rename. Retry rename on EPERM/EBUSY (Windows).
  Files written to a folder the user chose (exports, backups) use the same `writeFileAtomic`
  with a temp name of our own (`<file>.winlog-tmp`). Never write an export or a backup into
  the data folder itself.
- If `wins.json` cannot be parsed, never overwrite it. Move it to `wins.corrupt-<timestamp>.json`,
  load the newest backup, and tell the user.
- `wins.json` may be edited by hand. An item that is not a usable win (`isUsableEntry`) stays in
  the file untouched, but is not listed, counted or exported, so it cannot crash a window.
- Import never overwrites: it is planned again inside the save queue against the wins as they
  are at that moment.
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
  `spellcheck: false`, CSP `default-src 'self'`, navigation, `window.open` and webviews blocked.
- The session cancels every http, https, ws and ftp request and refuses every permission
  request (`lockDownSession` in `main.js`), so no page can reach the network.
- Render user text with `textContent`, never `innerHTML`. Validate every IPC argument in main.
- A page never sends a file path, a URL or text to save. It names an action; main shows the
  dialog, builds the content and does the work. Links are opened by name (`'releases'`,
  `'issues'`, `'website'`), checked against `src/lib/links.js`.
- If `globalShortcut.register` returns false, show it in Settings. Unregister on quit.
- Check Electron APIs against `node_modules/electron/electron.d.ts` before using them: in this
  version `clipboard.writeText` and `readText` return promises.

## Commands

- `npm start` run the app in development.
- `npm test` run unit tests (`node --test`).
- `npm run icons` rebuild every icon file from `assets/icon.svg` and `assets/tray-mac.svg`.
- `npm run dist:mac` / `npm run dist:win` build signed installers (need signing credentials;
  never commit them).

## Release

Public release. Mac: Developer ID signing, hardened runtime, notarization, universal `.dmg`.
Windows: signed NSIS installer. Launch-at-login and the no-dock-icon behaviour can only be
verified in a packaged build, not with `npm start`.
