# Contributing to Win Log

Thank you for helping. Win Log is a small project, so this guide is short.

## Before you start

- **Found a bug?** Open a [bug report][new-issue]. Please do not paste private wins.
- **Want a new feature or a big change?** Open an issue first and describe it. Wait for a reply
  before you write a lot of code. Win Log tries to stay small, so some good ideas will be left
  out.
- **Small fixes** (typos, clear bugs) can go straight to a pull request.

## Project rules

These keep Win Log simple and private. The full rules are in [CLAUDE.md](CLAUDE.md).

- **Local only.** All data is local JSON in the app's data folder. No server, no account, no
  analytics.
- **No network calls of any kind.** No auto-updater, no remote fonts or scripts, no telemetry.
- **Plain HTML, CSS and JavaScript.** No React or other framework, no bundler, no TypeScript.
- **Zero runtime dependencies.** The only dev dependencies are `electron` and `electron-builder`.
  Ask in an issue before adding any package.
- **Keep it small.** Do not add features that are not in the feature list without asking first.
- **Plain words.** Every text a user can read is simple English: short sentences, no jargon.

## Set up

You need [Node.js](https://nodejs.org/) 22.12 or later and git.

```sh
git clone https://github.com/heyush79/win-log.git
cd win-log
npm ci       # install the dev dependencies
npm start    # run the app
npm test     # run the unit tests
```

## Writing code

- Put logic in `src/lib/`. Files there must not import Electron, so they can be tested with plain
  Node.
- Add tests for that logic in `test/`, using `node:test`. Run them with `npm test`.
- Show user text with `textContent`. Never use `innerHTML` for anything a user typed.
- Only the main process reads or writes data files, through `src/main/store.js`. Windows ask the
  main process through IPC, and the main process checks every argument.
- If you change the format of `wins.json` or `settings.json`, bump `schemaVersion` and write a
  migration.
- Build dates from local date parts. Do not use `toISOString()` for a win's date.
- A window never sends a file path, a web address or text to save. It names an action, and the
  main process shows the dialog and does the work.
- The icons are made from `assets/icon.svg` and `assets/tray-mac.svg`. After changing one, run
  `npm run icons` and commit the new files.

## Sending a pull request

1. Fork the repository and create a branch for your change.
2. Keep the change small and focused on one thing.
3. Run `npm test` and make sure it passes.
4. Try the change in the app with `npm start`. Say in the pull request whether you tested on Mac,
   Windows or both.
5. If users will notice the change, add a line under "Unreleased" in
   [CHANGELOG.md](CHANGELOG.md).
6. Open the pull request. Explain what you changed and why. Add a screenshot if the UI changed,
   but use made-up wins, not real ones.

By sending a pull request, you agree that your work is shared under the
[MIT license](LICENSE).

## Be kind

Be friendly and patient with everyone. Assume good intent. Keep discussions about the work, not
the person.

[new-issue]: https://github.com/heyush79/win-log/issues/new/choose
