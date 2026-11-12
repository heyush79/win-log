# Changelog

All notable changes to Win Log are listed in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

<!-- Write each entry on one line. The GitHub release notes are copied from this file, and GitHub shows every line break in them. -->

## [Unreleased]

## [1.0.0] - 2026-11-12

First public release.

### Added

- A menu bar app for macOS and a system tray app for Windows, with a star icon. It has no Dock icon on Mac, and closing a window does not quit it.
- A welcome window on the first launch: what Win Log does, where to find its icon, the reminder time and days, the shortcut, and where your wins are saved.
- Tray menu: "Today: 2 wins" (how many wins you added today), "Add a win", "My Wins", "Export…", "Settings…", "About Win Log" and "Quit".
- A daily question, "What did you do today?", by default at 18:00 (6 pm), Monday to Friday.
  - Change the time and the days in "Settings…" > "Daily reminder", or turn it off.
  - If your computer was asleep or off at that time, Win Log asks when you come back the same day. It never asks about a past day.
  - It does not ask if you already added a win that day.
  - The window opens without stealing your typing.
- "Add a win" from the menu or with a keyboard shortcut. The default shortcut is ⌃⌥W (Control+Option+W) on Mac and Ctrl+Alt+Shift+W on Windows. Change it in "Settings…" > "Add-a-win shortcut".
- One win per line. Add a tag with `#word`, for example `#bugfix`. The first tag in a line is used. Tags start with a letter, so `#123` is not a tag.
- "My Wins" window: wins grouped by week (weeks start on Monday), newest first, with a search box, tag filter chips, edit, and delete (it asks first).
- Keyboard use in "My Wins": `/` jumps to search, the Up and Down arrows move between wins, Enter edits the selected win, and Delete (Backspace on Mac) deletes it after asking.
- "Export…" window:
  - Ranges: "This month", "Last month", "Last 3 months", "Last 6 months", "This year" and "Custom".
  - Formats: "Markdown" (bullets grouped by tag, wins with no tag under "Other") and "Plain text" (for HR tools that do not accept Markdown).
  - An "Include dates" checkbox, off by default.
  - A live preview, "Copy to clipboard" and "Save as file…".
- Your wins and settings are saved as plain JSON files in the data folder on your computer.
- An automatic copy of your wins in the `backups` folder before the first change of each day. The newest 14 copies are kept.
- Safe saving: a win is written to a new file first and then swapped in, so a crash cannot leave half a file. If the wins file cannot be read, or another program changed it while Win Log was running, Win Log keeps that file under a new name and tells you.
- "Settings…" > "Your data":
  - "Open data folder".
  - "Export backup…" saves your wins as a `.json` file.
  - "Import backup…" adds wins from a backup that are not already in Win Log. It shows a summary first and never overwrites a win you already have.
  - "Also save daily backups to a folder I choose". Pick a folder in iCloud Drive, Google Drive or OneDrive to get a synced copy of your backups. Win Log keeps the newest 14 copies from each computer and never touches other files in that folder.
- "Start Win Log at login", on by default. Win Log respects changes you make in macOS System Settings > General > Login Items or in Windows Task Manager > Startup apps.
- "About Win Log": the version, the MIT license, "Check for updates" (opens the GitHub Releases page in your browser) and "Report a problem" (opens GitHub Issues in your browser).
- Privacy: no account, no server, no analytics, no tracking, and no network connections. There is no auto-updater.
- Downloads on GitHub Releases: a universal Mac app for Apple Silicon and Intel (`.dmg` and `.zip`, macOS 13 or later) and a Windows installer (`.exe`, Windows 10 or 11). The Windows installer is for x64, installs for your user only without admin rights, and also runs on Windows on ARM through emulation.

[Unreleased]: https://github.com/ayushCodes/win-log/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/ayushCodes/win-log/releases/tag/v1.0.0
