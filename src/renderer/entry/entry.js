'use strict';

const textEl = document.getElementById('text');
const saveBtn = document.getElementById('save');
const statusEl = document.getElementById('status');
const saveHint = document.getElementById('save-hint');
const todaySection = document.getElementById('today-section');
const todayList = document.getElementById('today');

let saving = false;

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
    textEl.value = '';
    setStatus(result.added === 1 ? 'Saved 1 win.' : `Saved ${result.added} wins.`);
    renderToday(result.today);
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
