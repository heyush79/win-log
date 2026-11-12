'use strict';

const textEl = document.getElementById('text');
const saveBtn = document.getElementById('save');
const statusEl = document.getElementById('status');
const saveHint = document.getElementById('save-hint');
const todaySection = document.getElementById('today-section');
const todayList = document.getElementById('today');

let saving = false;

// Why the text could not be saved, in plain words. The limits are in src/lib/entries.js.
const TOO_MUCH = {
  'too-many': 'That is more than 100 wins at once. Save the first ones, then the rest.',
  'line-too-long': 'One line is too long. Keep each win under 2,000 characters.',
  'text-too-long': 'That is too much text to save at once. Save part of it first.',
  empty: 'Type a win first.',
};

saveHint.textContent = window.winlog.platform === 'darwin' ? '⌘ Enter' : 'Ctrl+Enter';

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle('error', isError);
}

function updateSaveButton() {
  saveBtn.disabled = saving || textEl.value.trim() === '';
}

// User text goes in with textContent only, never innerHTML.
function renderToday(entries) {
  todayList.replaceChildren(
    ...entries.map((entry) => {
      const li = document.createElement('li');
      li.textContent = entry.text;
      return li;
    })
  );
  todaySection.hidden = entries.length === 0;
}

async function save() {
  if (saving || textEl.value.trim() === '') return;
  saving = true;
  updateSaveButton();
  setStatus('Saving…');
  try {
    const result = await window.winlog.addWins(textEl.value);
    if (result.ok) {
      textEl.value = '';
      setStatus(result.added === 1 ? 'Saved 1 win.' : `Saved ${result.added} wins.`);
      renderToday(result.today);
    } else {
      // Nothing was saved, and trying again as it is would not help. Say what to change.
      setStatus(TOO_MUCH[result.error] || 'Could not save. Your text is still here, so try again.', true);
    }
  } catch (err) {
    console.error(err);
    setStatus('Could not save. Your text is still here, so try again.', true);
  } finally {
    saving = false;
    updateSaveButton();
    textEl.focus();
  }
}

textEl.addEventListener('input', () => {
  updateSaveButton();
  if (statusEl.textContent && !saving) setStatus('');
});

saveBtn.addEventListener('click', save);

document.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
    event.preventDefault();
    save();
  } else if (event.key === 'Escape') {
    if (textEl.value.trim() === '' || window.confirm('Discard what you typed?')) window.close();
  }
});

function loadToday() {
  window.winlog
    .getTodayWins()
    .then(renderToday)
    .catch((err) => {
      console.error(err);
      setStatus('Could not load today’s wins.', true);
    });
}

loadToday();
// The window may have been left open since yesterday; refresh when the user comes back to it.
window.addEventListener('focus', loadToday);
// A win may be edited or deleted in My Wins while this window is open.
window.winlog.onWinsChanged(loadToday);
