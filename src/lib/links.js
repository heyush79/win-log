'use strict';

// The only web addresses Win Log can ever open, and only in the user's browser,
// when the user clicks a button. The app itself never connects to the internet.
//
// The GitHub owner and repository name are set here, in package.json ("repository"),
// in electron-builder.yml (appId) and in docs/config.js (the website).

const REPO_OWNER = 'heyush79';
const REPO_NAME = 'win-log';
const REPO_URL = `https://github.com/${REPO_OWNER}/${REPO_NAME}`;

const LINKS = Object.freeze({
  releases: `${REPO_URL}/releases/latest`, // "Check for updates"
  issues: `${REPO_URL}/issues/new/choose`, // "Report a problem"
  website: `https://${REPO_OWNER.toLowerCase()}.github.io/${REPO_NAME}/`,
});

/** The address for a link name ('releases', 'issues', 'website'), or null. */
function linkUrl(name) {
  return typeof name === 'string' && Object.hasOwn(LINKS, name) ? LINKS[name] : null;
}

/** True only for the exact addresses in the list above. */
function isAllowedUrl(url) {
  return typeof url === 'string' && Object.values(LINKS).includes(url);
}

module.exports = { REPO_OWNER, REPO_NAME, REPO_URL, LINKS, linkUrl, isAllowedUrl };
