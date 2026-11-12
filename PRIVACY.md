# Privacy policy

Last updated: 2026-11-12

Win Log is a small app that saves your wins on your own computer. This page explains what it
stores, where, and what it never does.

## The short version

- Your wins stay on your computer, in plain files that you control.
- Win Log has no account and no server.
- The app makes no network connections at all.
- The author of Win Log cannot see your wins.

## What Win Log stores

Win Log saves these files in its data folder:

- `wins.json`: your wins. For each win: the date, the text you typed, the tag (if any), and when
  it was created and last changed.
- `settings.json`: your settings, such as the reminder time and days, the add-a-win shortcut,
  "Start Win Log at login", and the last day Win Log asked you. If you turned on extra daily
  backups, it also holds the folder you chose.
- `backups/`: copies of `wins.json`. Win Log makes one before the first change of each day and
  keeps the newest 14.
- If `wins.json` is ever damaged and cannot be read, Win Log does not delete it. It renames it
  to `wins.corrupt-<time>.json` and keeps it in the same folder.
- If another program changes `wins.json` while Win Log is running, Win Log keeps that version
  as `wins.conflict-<time>.json` in the same folder.

Electron, the framework Win Log is built on, may also keep some files of its own in this folder,
such as caches.

All of these are plain files on your disk. They are not encrypted by Win Log. Anyone who can use
your user account can read them. Turning on your system's disk encryption (FileVault on Mac,
BitLocker or Device encryption on Windows) protects them if your computer is lost or stolen. Your
own system backups, such as Time Machine, may include this folder.

## Where it stores them

- Mac: `~/Library/Application Support/Win Log/`
- Windows: `%APPDATA%\Win Log\`

You can open the folder from "Settings…" > "Your data" > "Open data folder".

## What Win Log never does

- It never connects to the internet or to any network.
- It has no account and no sign-in.
- It has no analytics, no tracking and no ads.
- It sends no crash reports.
- It has no auto-updater and never checks for updates by itself.
- It does not download spell-check dictionaries or anything else.

## Links you click

Some items in the app open a web page in your browser, for example "Check for updates" (the
GitHub Releases page) and "Report a problem" (GitHub Issues). This happens only when you click
them. Win Log itself still makes no connection. Your browser then visits GitHub like any other
website, under [GitHub's privacy statement][github-privacy].

Anything you write in a GitHub issue is public. Please do not paste private wins there.

## Files you create yourself

- "Export backup…" and "Save as file…" save a file where you choose. After that, the file is
  yours to look after.
- "Copy to clipboard" puts the text on your system clipboard, like any other copy. Other apps
  that read the clipboard can see it.

## The backup folder you choose

In "Settings…" > "Your data" you can turn on "Also save daily backups to a folder I choose". If
you do, Win Log also saves a daily copy of your wins in that folder. The name of each copy
includes the name of your computer, for example `win-log-backup-My-Laptop-2026-11-12.json`, so
that backups from two computers do not replace each other. Win Log keeps the newest 14 copies
from each computer and never changes any other file in that folder.

Win Log only writes the file to your disk. If the folder is in iCloud Drive, Google Drive,
OneDrive or a similar service, that service's app uploads the file to its servers. That upload is
handled by your provider under their privacy terms, not by Win Log. Your live data always stays
in the normal data folder.

## The website

The website at <https://ayushcodes.github.io/win-log/> is hosted by GitHub Pages, so GitHub
serves the page to your browser. The page makes one request to the GitHub API to find the newest
release, so the download links point to the latest version. As with any website, GitHub can see
your IP address and browser details for these requests, under
[GitHub's privacy statement][github-privacy].

Downloads come from GitHub Releases, which is also run by GitHub.

## How to delete your data

1. Choose "Quit" in the Win Log menu.
2. Open the folder that holds the data folder:
   - Mac: in Finder, choose Go > Go to Folder, and enter `~/Library/Application Support/`
   - Windows: press Windows key + R, and enter `%APPDATA%`
3. In that folder, delete the "Win Log" folder.
4. If you turned on daily backups to a folder you chose, delete the backup files there too. Also
   delete any backup or export files you saved yourself.

Uninstalling Win Log does not delete your data folder. Delete it as shown above if you want your
wins gone.

## Changes to this policy

If this policy changes, the new version will be in this file, with a new date at the top. You can
see every past version in the project's history on GitHub.

## Questions

Open an issue at <https://github.com/ayushCodes/win-log/issues>. Issues are public, so do not
include private details.

[github-privacy]: https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement
