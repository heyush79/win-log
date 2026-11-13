# Releasing Win Log

Notes for the project owner. GitHub Actions builds the apps and publishes them on GitHub
Releases. None of this costs money unless you choose to add code signing (part 3).

## 1. One-time setup

### Create the repository and push

1. On GitHub, create a new **public** repository named `win-log`. Do not let GitHub add a
   README, license or `.gitignore`. This repo already has them.
2. Commit everything first. `git status` should say "nothing to commit".
3. In this folder, name the local branch `main` and push it:

   ```sh
   git branch -M main
   git remote add origin https://github.com/heyush79/win-log.git
   git push -u origin main
   ```

Keep the repository public. On a free GitHub account, GitHub Pages needs a public repository,
and Actions minutes on GitHub-hosted runners are free for public repositories. Check GitHub's
current plans if this changes.

If you use a different GitHub account or repository name, update the links. They are in
`package.json`, `src/lib/links.js` (the links inside the app), `electron-builder.js` (the app id),
`docs/config.js` (the website) and in the documents. This lists them all:

```sh
grep -rni "heyush79" --exclude-dir=node_modules --exclude-dir=.git .
```

### Turn on the website

1. In the repository, open Settings > Pages.
2. Under "Build and deployment", set Source to "Deploy from a branch".
3. Choose the branch `main` and the folder `/docs`, then click Save.
4. After a minute or two, the site is at <https://heyush79.github.io/win-log/>.

### Let the workflow create releases

1. Open Settings > Actions > General.
2. Under "Actions permissions", make sure Actions are allowed. If you limit which actions may
   run, allow the ones used in `.github/workflows/`.
3. Under "Workflow permissions", the default "Read repository contents and packages permissions"
   is fine. The Release workflow asks for `contents: write` itself, which it needs to create the
   release. It uses only the built-in `GITHUB_TOKEN`, so you do not need to create a token.

## 2. Making a release

Win Log uses version numbers like `1.2.3` and tags like `v1.2.3`. In the steps below, replace
`1.1.0` with your new version.

1. Make sure `main` is in a good state and the tests pass:

   ```sh
   git checkout main
   git pull
   npm ci
   npm test
   ```

2. Update [CHANGELOG.md](CHANGELOG.md):
   - Rename the "Unreleased" section to the new version and today's date, for example
     `## [1.1.0] - 2027-01-20`. Keep exactly this form. The Release workflow uses it to find the
     release notes.
   - Write each entry on one line. GitHub shows every line break in release notes, so a wrapped
     line looks broken there.
   - Add a new, empty `## [Unreleased]` section above it.
   - At the bottom, add a link for the new version and update the "Unreleased" link:

     ```text
     [Unreleased]: https://github.com/heyush79/win-log/compare/v1.1.0...HEAD
     [1.1.0]: https://github.com/heyush79/win-log/releases/tag/v1.1.0
     ```

   Then commit it:

   ```sh
   git commit -am "Update changelog for 1.1.0"
   ```

3. Bump the version:

   ```sh
   npm version 1.1.0
   ```

   This changes the version in `package.json` and `package-lock.json`, makes a commit and creates
   the tag `v1.1.0`. It stops if you have uncommitted changes, so commit everything first.

4. Push the commit and the tag:

   ```sh
   git push --follow-tags
   ```

### What happens next

Pushing the tag starts the "Release" workflow. You can watch it in the Actions tab.

- It checks that the tag matches the version in `package.json`. If they differ, it fails and
  publishes nothing.
- It builds the Mac app on `macos-latest` and the Windows installer on `windows-latest`.
- It publishes a GitHub Release for the tag with these files:
  - `Win-Log-1.1.0-mac.dmg`
  - `Win-Log-1.1.0-mac.zip`
  - `Win-Log-1.1.0-windows-setup.exe`
- The release notes are the version's section from `CHANGELOG.md`, followed by short install
  help. If that section is missing, GitHub writes the notes from the commits instead.
- It uses only the built-in `GITHUB_TOKEN`.

### The first release (1.0.0)

`CHANGELOG.md` already has the 1.0.0 section, so skip step 2. If you release on a later day,
change the date in its heading and commit that first.

- If `package.json` still has an older version (such as `0.1.0`), do steps 1, 3 and 4 with
  `1.0.0`.
- If `package.json` already says `1.0.0`, `npm version 1.0.0` stops with "Version not changed".
  Commit everything, then create the tag by hand and push it instead:

  ```sh
  git tag -a v1.0.0 -m "v1.0.0"
  git push --follow-tags
  ```

### Check the release

1. In the Actions tab, the Release run has a green check mark.
2. On the [Releases page](https://github.com/heyush79/win-log/releases), the newest release has
   the right version and all three files, with the version in each file name.
3. Read the release notes. They should show the version's section from `CHANGELOG.md` and the
   install help. If something is wrong, edit the release on GitHub and fix it.
4. Open the [website](https://heyush79.github.io/win-log/). The download links should point to
   the new version.

### Test the downloads

Download the files from the Releases page in a browser, the same way users will. Test on a real
Mac and a real Windows PC (or a virtual machine).

On a Mac:

- [ ] Open the `.dmg`, drag Win Log to Applications and open it. Get past the first-open warning
  as described in the README.
- [ ] The star is in the menu bar, and there is no Win Log icon in the Dock.
- [ ] Add a win with "Add a win" and with the shortcut ⌃⌥W.
- [ ] "My Wins" shows the win. "Export…" shows it in the preview and "Copy to clipboard" works.
- [ ] "About Win Log" shows the new version.
- [ ] The app is universal. This should list both `x86_64` and `arm64`:

  ```sh
  lipo -archs "/Applications/Win Log.app/Contents/MacOS/Win Log"
  ```

- [ ] Log out and log in again. Win Log starts by itself.

On Windows:

- [ ] Run the setup `.exe` and get past SmartScreen. It installs without asking for admin rights
  and adds a Start Menu shortcut.
- [ ] The icon is in the system tray (check behind the `^` arrow).
- [ ] Add a win with "Add a win" and with the shortcut Ctrl+Alt+Shift+W.
- [ ] "My Wins", "Export…" and "About Win Log" work, and About shows the new version.
- [ ] Sign out and sign in again. Win Log starts by itself.
- [ ] Uninstall from Settings > Apps > Installed apps. The wins are still in `%APPDATA%\Win Log\`.

Also install the new version over the previous one and check that your old wins are still there.

### Build locally

You can build the installers on your own computer, for example to test packaging before you tag:

```sh
npm ci
npm run dist:mac    # on a Mac
npm run dist:win    # on Windows
```

The files go to `dist/`. Local builds are not uploaded anywhere. The settings are in
[electron-builder.js](electron-builder.js).

Builds are unsigned unless a certificate is set in the environment (see part 3). On a Mac, an
"unsigned" build is in fact ad-hoc signed: a free signature that says nothing about who made the
app. Macs with Apple Silicon refuse to start an app with no signature at all, so this is needed.
Users still see the first-open warning.

To check a Mac build before you tag, copy `dist/mac-universal/Win Log.app` to Applications and
open it. Start at login and the hidden Dock icon only work in this packaged app, not with
`npm start`.

### If a release fails

1. Open the failed run in the Actions tab and read the error. If it looks temporary (for example
   a network timeout), click "Re-run failed jobs" and stop here.
2. If a release was created, delete it: Releases page > the release > Delete.
3. Delete the tag on GitHub and on your computer:

   ```sh
   git push --delete origin v1.1.0
   git tag -d v1.1.0
   ```

4. Fix the problem, commit and push to `main`.
5. Tag again and push. Do not run `npm version` again, because `package.json` already has the new
   version:

   ```sh
   git tag -a v1.1.0 -m "v1.1.0"
   git push --follow-tags
   ```

If the workflow failed because the tag did not match `package.json`, delete the tag as in step 3,
then run `npm version` with the right version.

If people may already have downloaded a broken release, do not reuse its number. Release the next
patch version instead (for example `1.1.1`).

## 3. Code signing (optional, later)

Without code signing, macOS and Windows warn users the first time they open Win Log. The README
explains how to get past the warnings. Signing removes or reduces them, but it usually costs
money.

The Release workflow and [electron-builder.js](electron-builder.js) are ready for it. When the
signing secrets below are set, the builds are signed (on Mac: with the hardened runtime, and
notarized). When they are not set, the builds stay unsigned.

To sign a local Mac build with a certificate that is in your keychain, set its name without the
"Developer ID Application:" part: `CSC_NAME="Your Name (TEAMID)" npm run dist:mac`.

**Never commit certificates, keys or passwords.** Keep `.p12` and `.pfx` files somewhere safe
outside this repo, for example in a password manager. The `.gitignore` blocks common certificate
files, but do not rely on it. Secrets go in the repository under Settings > Secrets and
variables > Actions > New repository secret.

### macOS: Developer ID signing and notarization

Cost: the Apple Developer Program, about US$99 per year. Check the current price on Apple's site.

1. Join the [Apple Developer Program](https://developer.apple.com/programs/).
2. Create a "Developer ID Application" certificate. One way is Xcode > Settings > Accounts >
   select your team > Manage Certificates > + > Developer ID Application. You can also create one
   at developer.apple.com under Certificates, Identifiers & Profiles. Only the account holder can
   create Developer ID certificates.
3. Export it as a `.p12` file. In Keychain Access, find the certificate under My Certificates.
   Its name looks like `Developer ID Application: Your Name (TEAMID)`. Right-click it, choose
   Export, save it as `.p12`, and set a strong password.
4. Turn the file into base64 text and copy it:

   ```sh
   base64 -i DeveloperIDApplication.p12 | pbcopy
   ```

5. Add these repository secrets:

   | Secret | Value |
   | --- | --- |
   | `MAC_CSC_LINK` | The base64 text of the `.p12` file. |
   | `MAC_CSC_KEY_PASSWORD` | The password you set when you exported the `.p12`. |
   | `APPLE_ID` | The email address of your Apple Account. |
   | `APPLE_APP_SPECIFIC_PASSWORD` | An app-specific password. Create one at [account.apple.com](https://account.apple.com) under Sign-In and Security > App-Specific Passwords. |
   | `APPLE_TEAM_ID` | Your 10-character Team ID, shown at developer.apple.com under Account > Membership details. |

   The first two are for signing. The last three are for notarization (Apple checks the app and
   approves it).

6. Make a release as usual. With these secrets set, the Mac build is signed and notarized
   automatically. Notarization can add some minutes to the run.
7. Check a downloaded copy. This should say "accepted" and "source=Notarized Developer ID":

   ```sh
   spctl -a -vv "/Applications/Win Log.app"
   ```

8. Update the "First launch" section in the README, the website, and the install help that the
   Release workflow adds to the release notes (in `.github/workflows/release.yml`), because Mac
   users will no longer see the warning.

### Windows: code signing

Windows signing is harder than it used to be. Since June 2023, industry rules require the private
key of a code-signing certificate to be kept on a hardware token or in a cloud HSM (a secure
service that holds the key). So certificate providers no longer give you a plain `.pfx` file.

The workflow's `WIN_CSC_LINK` (the base64 text of a `.pfx` file) and `WIN_CSC_KEY_PASSWORD` (its
password) only work with a `.pfx` file. With a certificate you get today, expect to change the
workflow instead. See the options below.

Options. The prices are rough. Check current prices and eligibility before you pay for anything.

| Option | Rough cost | Notes |
| --- | --- | --- |
| Microsoft Azure Artifact Signing (formerly Trusted Signing) | roughly US$10 per month | A cloud signing service from Microsoft. It has eligibility rules for individuals and organisations, so check that you qualify first. electron-builder can use it through its `azureSignOptions` setting, which needs extra settings and Azure secrets in the workflow. |
| OV code-signing certificate from a certificate authority (CA) | roughly a few hundred US$ per year | Usually comes on a hardware token or with a cloud signing service, not as a `.pfx`. That needs extra electron-builder settings and changes to the workflow. |
| SignPath Foundation | free for qualifying open-source projects | Free code signing for open-source projects that meet their conditions. You apply with the project. Check their current terms, including whose name is shown as the publisher. |

Signing does not make the SmartScreen warning go away at once. Windows builds trust in a signed
app (its "reputation") as more people download and run it, and the warning fades over time.
Reputation is linked to the certificate, so changing certificates can bring the warning back for
a while.

When Windows builds are signed, update the "First launch" section in the README, the website,
and the install help in `.github/workflows/release.yml`.
