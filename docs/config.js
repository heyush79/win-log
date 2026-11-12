// Settings for the Win Log website: the GitHub owner and repository.
//
// download.js builds every GitHub link on the page from these values: the
// download buttons, the request for the latest release, and the links in the
// header, the FAQ and the footer. After a fork or a rename, change them here.
//
// index.html also spells out the same github.com links, but only as a fallback
// for visitors who have JavaScript turned off. To keep those right too, search
// index.html for the old owner name and replace it.
window.WINLOG_SITE = {
  owner: 'ayushCodes', // GitHub user or organization
  repo: 'win-log', // repository name
  branch: 'main', // branch that holds LICENSE and PRIVACY.md
};
