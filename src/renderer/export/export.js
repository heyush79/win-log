'use strict';

// Export: pick a range and a format, see a live preview, then copy or save.
// The text is always built by the main process (src/lib/exportMarkdown.js) from the
// saved wins; this page only sends the options.

const presetEl = document.getElementById('preset');
const fromEl = document.getElementById('from');
const toEl = document.getElementById('to');
const datesEl = document.getElementById('dates');
const formatEls = [...document.querySelectorAll('input[name="format"]')];
const previewEl = document.getElementById('preview');
const statusEl = document.getElementById('status');
const copyBtn = document.getElementById('copy');
const saveBtn = document.getElementById('save');

let latest = 0; // number of the newest preview request; older answers are dropped
let count = 0;
let busy = false;
let refreshedOn = null; // the day the preview was last built

function options() {
  return {
    preset: presetEl.value,
    from: fromEl.value,
    to: toEl.value,
    format: formatEls.find((el) => el.checked).value,
    includeDates: datesEl.checked,
  };
}

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle('error', isError);
}

function updateButtons() {
  copyBtn.disabled = busy || count === 0;
  saveBtn.disabled = busy || count === 0;
}

function countText(n) {
  if (n === 0) return 'No wins in this range.';
  return n === 1 ? '1 win' : `${n} wins`;
}

/** Rebuilds the preview. `notice` replaces the usual "12 wins" line, e.g. "Copied 12 wins." */
async function refresh(notice) {
  const request = ++latest;
  refreshedOn = new Date().toDateString();
  const sent = options();
  let result;
  try {
    result = await window.winlog.previewExport(sent);
  } catch (err) {
    console.error(err);
    if (request !== latest) return;
    count = 0;
    previewEl.value = '';
    setStatus('Could not build the export. Close this window and try again.', true);
    updateButtons();
    return;
  }
  if (request !== latest) return;

  if (!result.ok) {
    count = 0;
    previewEl.value = '';
    setStatus(
      sent.from && sent.to ? 'The start date is after the end date.' : 'Choose a start date and an end date.',
      true
    );
    updateButtons();
    return;
  }

  // A preset fills in its dates, so you can see them and adjust from there.
  if (sent.preset !== 'custom') {
    fromEl.value = result.from;
    toEl.value = result.to;
  }
  count = result.count;
  previewEl.value = result.text;
  setStatus(notice || countText(count));
  updateButtons();
}

presetEl.addEventListener('change', () => refresh());
datesEl.addEventListener('change', () => refresh());
for (const el of formatEls) el.addEventListener('change', () => refresh());

// Changing a date by hand means the range is now your own.
for (const el of [fromEl, toEl]) {
  el.addEventListener('input', () => {
    presetEl.value = 'custom';
    refresh();
  });
}

copyBtn.addEventListener('click', async () => {
  if (busy) return;
  busy = true;
  updateButtons();
  try {
    const result = await window.winlog.copyExport(options());
    if (result.ok) await refresh(result.count === 1 ? 'Copied 1 win.' : `Copied ${result.count} wins.`);
    else await refresh();
  } catch (err) {
    console.error(err);
    setStatus('Could not copy. Try again.', true);
  } finally {
    busy = false;
    updateButtons();
  }
});

saveBtn.addEventListener('click', async () => {
  if (busy) return;
  busy = true;
  updateButtons();
  try {
    const result = await window.winlog.saveExport(options());
    if (result.ok) await refresh(`Saved as ${result.fileName}.`);
    else if (result.error === 'data-folder') {
      setStatus('Choose a different folder. That one is where Win Log keeps its own files.', true);
    } else if (result.error === 'file-busy') {
      setStatus('That file is open in another program. Close it there, or choose another name.', true);
    } else if (!result.canceled) await refresh();
  } catch (err) {
    console.error(err);
    setStatus('Could not save the file. Try another folder.', true);
  } finally {
    busy = false;
    updateButtons();
  }
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') window.close();
});

// Wins may be added or edited while this window is open.
window.winlog.onWinsChanged(() => refresh());
// The day may have changed since the window was opened ("This month"). Only then:
// a refresh on every focus would wipe "Saved as ..." when the save dialog closes.
window.addEventListener('focus', () => {
  if (presetEl.value !== 'custom' && !busy && refreshedOn !== new Date().toDateString()) refresh();
});

refresh();
