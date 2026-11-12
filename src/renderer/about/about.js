'use strict';

// About: the version, and three links that open in the user's browser.
// The page sends only a link name; the fixed addresses live in src/lib/links.js.

const statusEl = document.getElementById('status');

async function open(name) {
  statusEl.textContent = '';
  try {
    await window.winlog.openLink(name);
  } catch (err) {
    console.error(err);
    statusEl.textContent = 'Could not open your browser.';
  }
}

document.getElementById('updates').addEventListener('click', () => open('releases'));
document.getElementById('report').addEventListener('click', () => open('issues'));
document.getElementById('website').addEventListener('click', () => open('website'));

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') window.close();
});

window.winlog
  .getAppInfo()
  .then((info) => {
    document.getElementById('version').textContent = `Version ${info.version}`;
  })
  .catch((err) => console.error(err));
