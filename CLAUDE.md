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
  (read a backup, merge by id, backup-folder file names), `links.js` (the only web addresses),
  `paths.js` (is a path inside a folder).
  Put logic here so it can be unit tested. Files that pages also need (`dates.js`, `group.js`,
  `search.js`, `accelerator.js`) use a small UMD wrapper, so they work with `require()` in main
  and a `<script>` tag in a page.
- `src/preload/preload.js` exposes a small `window.winlog` API through `contextBridge`.
- `src/renderer/<entry|wins|export|settings|about|welcome>/` one HTML + JS file per window,
  shared `common.css`.
- `electron-builder.js` packaging config; `build/` also holds the Mac entitlements files.
- `assets/` icons used by the running app: `icon.svg` and `tray-mac.svg` (sources), `icon.png`,
  `trayTemplate.png` + `@2x`, `tray.ico`. `build/` icons for the installers (`icon.icns`,
  `icon.ico`, `icon.png`). All of them are made by `scripts/make-icons.js` (`npm run icons`).
- `test/` holds `node:test` tests.
- `docs/` the website (see Website) and `docs/screenshots/` for the README.
- Documents at the root: `README.md`, `PRIVACY.md`, `CHANGELOG.md` (one line per entry; the
  release notes are copied from it), `CONTRIBUTING.md`, `RELEASE.md`, `LICENSE` (MIT).
  `.github/ISSUE_TEMPLATE/` has the bug and feature forms.

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
  the data folder itself (checked on real paths, ignoring letter case on Mac and Windows).
- If `wins.json` cannot be parsed, never overwrite it. Move it to `wins.corrupt-<timestamp>.json`,
  load the newest backup, and tell the user.
- If `wins.json` on disk is not as the app last read or wrote it (size or change time differ),
  another program changed it while the app was running. Before the next save, copy it to
  `wins.conflict-<timestamp>.json` and tell the user how to import it. Never write over it
  silently; if the copy cannot be made, the save fails.
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
- `LSUIElement` is set in `electron-builder.js`; also call `app.dock.hide()`.
- Opening Win Log again while it runs opens "Add a win" (`second-instance` on Windows,
  `activate` on Mac), so people can see it is there even without a Dock icon.
- Quitting: `before-quit` pauses the quit only while a save is really in progress
  (`store.hasUnfinishedWrites()`), and quits again with `setImmediate`, never from a promise
  callback. Pausing every quit left the app running after Cmd+Q, logout or a termination
  signal, because the second `app.quit()` ran inside Electron's own quit call.
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
- A failure during start-up shows an error box and exits. Never leave the app running with no
  tray icon and no window.
- When something cannot be done, say why in plain words and what to do next. `wins:add` returns
  `{ ok: false, error }` with a reason (`too-many`, `line-too-long`, `text-too-long`, `empty`)
  so the window can explain it; "try again" is only for errors where trying again can help.
- Check Electron APIs against `node_modules/electron/electron.d.ts` before using them: in this
  version `clipboard.writeText` and `readText` return promises.

## Website (GitHub Pages, free)

- `docs/` is the website, served by GitHub Pages from `/docs` on `main`: one page, plain HTML,
  CSS and JS, no framework, no build step, no trackers, no external fonts, scripts or images.
- Strict CSP in a meta tag (`default-src 'self'`, `connect-src https://api.github.com`). No
  inline scripts or styles.
- `docs/config.js` holds the GitHub owner and repo. `docs/download.js` picks the download button
  for the visitor's computer, asks the GitHub API once for the latest release and points the
  buttons at the `-mac.dmg` and `-windows-setup.exe` files. Anything that goes wrong (offline,
  rate limit, no release yet, a missing file) leaves the buttons on the Releases page. The same
  github.com links are also written in `index.html` for visitors without JavaScript.
- The "no network" rule is about the app. The website makes exactly that one request, and the
  page says so.
- The demo box is a placeholder until `docs/media/demo.gif` is recorded.
- The website and `README.md` describe the app. Update them when a feature changes.

## Commands

- `npm start` run the app in development.
- `npm test` run unit tests (`node --test`).
- `npm run icons` rebuild every icon file from `assets/icon.svg` and `assets/tray-mac.svg`.
- `npm run dist:mac` (on a Mac) / `npm run dist:win` (on Windows) build the installers into
  `dist/`. Both pass `--publish never`.

## Packaging and release (free, GitHub only)

- `electron-builder.js` is the packaging config. `appId` `io.github.ayushcodes.winlog` (also
  `APP_ID` in `main.js`), `productName` "Win Log". Only `src/`, `assets/` and `package.json` go
  into the app. `publish: null`: there is no auto-update.
- Mac: universal `.dmg` and `.zip` (`Win-Log-<version>-mac.*`), `LSUIElement`, hardened runtime,
  entitlements. Needs macOS 13 or later (Electron 45).
- Windows: one-click NSIS installer for the current user, no admin rights, Start Menu shortcut,
  x64 (`Win-Log-<version>-windows-setup.exe`). Uninstalling keeps the user's data.
- Builds are unsigned by default. On Mac that means ad-hoc signed (`identity: '-'` with
  `build/entitlements.mac.adhoc.plist`), because Apple Silicon will not start an app with no
  signature. Real signing and notarization switch on only when a certificate is in the
  environment: `CSC_LINK` + `CSC_KEY_PASSWORD` (or `CSC_NAME`), plus `APPLE_ID`,
  `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` for notarization; `WIN_CSC_LINK` +
  `WIN_CSC_KEY_PASSWORD` on Windows. In GitHub Actions these come from the secrets
  `MAC_CSC_LINK`, `MAC_CSC_KEY_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`,
  `APPLE_TEAM_ID`, `WIN_CSC_LINK`, `WIN_CSC_KEY_PASSWORD`. Never commit credentials.
- Electron fuses are set in the config: no run-as-Node, no `NODE_OPTIONS`, no `--inspect`,
  load the app only from the asar.
- `.github/workflows/ci.yml`: `npm test` on macOS and Windows for every push and pull request.
- `.github/workflows/release.yml`: on a `v*` tag, checks that the tag matches `package.json`,
  builds on macOS and Windows, and publishes a GitHub Release with the three files using only
  the built-in `GITHUB_TOKEN`. Release notes come from the version's section in `CHANGELOG.md`.
- The GitHub owner and repo name appear in `package.json`, `src/lib/links.js`,
  `electron-builder.js` and `docs/config.js`.
- Launch-at-login and the no-dock-icon behaviour can only be verified in a packaged build, not
  with `npm start`. See `RELEASE.md` for the release steps and the hand-test checklist.
