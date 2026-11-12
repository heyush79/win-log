'use strict';

// How Win Log is packaged. Use: npm run dist:mac (on a Mac) or npm run dist:win (on Windows).
// The installers are written to dist/.
//
// Builds are unsigned by default, because signing certificates cost money (see RELEASE.md).
// Signing turns itself on when a certificate is given in the environment:
//   Mac:     CSC_LINK + CSC_KEY_PASSWORD (a Developer ID Application .p12), or CSC_NAME for a
//            certificate in your keychain. Notarization also runs if APPLE_ID,
//            APPLE_APP_SPECIFIC_PASSWORD and APPLE_TEAM_ID are set.
//   Windows: WIN_CSC_LINK + WIN_CSC_KEY_PASSWORD (or CSC_LINK + CSC_KEY_PASSWORD).
// Never put certificates or passwords in this file or anywhere in the repository.

const isSet = (name) => Boolean(process.env[name] && process.env[name].trim());
const hasMacCertificate = isSet('CSC_LINK') || isSet('CSC_NAME');

// Mac without a certificate: "ad-hoc" signing. It costs nothing and proves nothing about
// who made the app, but Apple Silicon Macs refuse to start an app with no signature at all.
// An ad-hoc signed app can only load its own frameworks if library validation is relaxed,
// hence the separate entitlements file.
const macSigning = hasMacCertificate
  ? {
      hardenedRuntime: true,
      entitlements: 'build/entitlements.mac.plist',
      entitlementsInherit: 'build/entitlements.mac.plist',
      // notarize is left at its default: it runs only when the APPLE_* variables are set.
    }
  : {
      identity: '-',
      hardenedRuntime: true,
      entitlements: 'build/entitlements.mac.adhoc.plist',
      entitlementsInherit: 'build/entitlements.mac.adhoc.plist',
      notarize: false, // Apple only notarizes apps signed with a Developer ID
    };

module.exports = {
  // The GitHub owner is also in package.json, src/lib/links.js and docs/config.js.
  // The same id is used in src/main/main.js (APP_ID).
  appId: 'io.github.ayushcodes.winlog',
  productName: 'Win Log',
  copyright: 'Copyright © 2026 Ayush Bundela',

  directories: { output: 'dist', buildResources: 'build' },
  // Only what the app needs at run time. There are no runtime npm packages.
  files: ['src/**/*', 'assets/**/*', 'package.json'],
  asar: true,
  npmRebuild: false, // no native modules

  // No auto-update and no upload from the build: release.yml attaches the files to a
  // GitHub Release itself.
  publish: null,

  // Switch off ways to run other code through the installed app.
  electronFuses: {
    runAsNode: false,
    enableNodeOptionsEnvironmentVariable: false,
    enableNodeCliInspectArguments: false,
    onlyLoadAppFromAsar: true,
  },

  mac: {
    category: 'public.app-category.productivity',
    icon: 'build/icon.icns',
    // One download for Apple Silicon and Intel Macs.
    target: [
      { target: 'dmg', arch: ['universal'] },
      { target: 'zip', arch: ['universal'] },
    ],
    artifactName: 'Win-Log-${version}-mac.${ext}',
    // A menu bar app: no Dock icon and no entry in the app switcher.
    extendInfo: { LSUIElement: true },
    ...macSigning,
  },

  win: {
    icon: 'build/icon.ico',
    target: [{ target: 'nsis', arch: ['x64'] }],
  },

  // A one-click installer for the current user: no administrator rights, no questions.
  nsis: {
    oneClick: true,
    perMachine: false,
    createStartMenuShortcut: true,
    createDesktopShortcut: false,
    shortcutName: 'Win Log',
    runAfterFinish: true,
    deleteAppDataOnUninstall: false, // uninstalling never deletes the user's wins
    differentialPackage: false, // only useful for auto-update, which Win Log does not have
    artifactName: 'Win-Log-${version}-windows-setup.${ext}',
  },
};
