'use strict';

// My Wins: every win, grouped by week, with search, tag filter, edit and delete.
// The rules for order, weeks and search live in src/lib (dates.js, group.js, search.js).

const { localDate, parseDate, addDays, weekStart } = window.winlogDates;
const { groupByWeek, countInMonth, tagCounts } = window.winlogGroup;
const { filterWins, NO_TAG } = window.winlogSearch;
const { formatAccelerator } = window.winlogAccelerator;

const MAX_LENGTH = 2000;
const isMac = window.winlog.platform === 'darwin';

const monthCountEl = document.getElementById('month-count');
const toolsEl = document.getElementById('tools');
const searchEl = document.getElementById('search');
const tagsEl = document.getElementById('tags');
const statusEl = document.getElementById('status');
const listEl = document.getElementById('list');
const emptyEl = document.getElementById('empty');
const emptyHowEl = document.getElementById('empty-how');
const emptyReminderEl = document.getElementById('empty-reminder');
const noMatchEl = document.getElementById('no-match');
const keysEl = document.getElementById('keys');

let entries = []; // every win, newest first
let visible = []; // the wins shown now, in the order shown
let query = '';
let tagFilter = null; // null = all wins, NO_TAG = wins without a tag, or a tag name
let selectedId = null; // the win that Tab lands on
let editingId = null;
let reloadWhenIdle = false; // wins changed elsewhere while a win was being edited
let loaded = false;
let renderedOn = null; // the local date when the list was last drawn
let notice = null; // { message, isError }: stays until the user does something else

// ----- Dates -----

const dayMonth = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' });
const dayMonthYear = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
const rowDate = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
const longDate = new Intl.DateTimeFormat(undefined, { dateStyle: 'full' });
const clock = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });

function weekName(start, today) {
  const thisWeek = weekStart(today);
  if (start === thisWeek) return 'This week';
  if (start === addDays(thisWeek, -7)) return 'Last week';
  return '';
}

function weekRange(start, today) {
  const end = addDays(start, 6);
  const sameYear = start.slice(0, 4) === today.slice(0, 4) && end.slice(0, 4) === today.slice(0, 4);
  return (sameYear ? dayMonth : dayMonthYear).formatRange(parseDate(start), parseDate(end));
}

// ----- Small helpers -----

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text; // user text only ever goes in as text
  return node;
}

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle('error', isError);
}

function plural(n, one, many) {
  return n === 1 ? `1 ${one}` : `${n} ${many}`;
}

function rowFor(id) {
  return id ? listEl.querySelector(`.win[data-id="${CSS.escape(id)}"]`) : null;
}

// ----- Selection: one win has the tab stop; arrows move it -----

function select(id, { focus = false } = {}) {
  selectedId = id;
  for (const row of listEl.querySelectorAll('.win')) {
    if (row.classList.contains('editing')) continue; // its text field takes the focus instead
    const isSelected = row.dataset.id === id;
    row.tabIndex = isSelected ? 0 : -1;
    for (const button of row.querySelectorAll('.win-actions button')) button.tabIndex = isSelected ? 0 : -1;
  }
  if (focus) {
    const row = rowFor(id);
    if (row) {
      row.focus();
      row.scrollIntoView({ block: 'nearest' });
    }
  }
}

function move(step) {
  if (visible.length === 0) return;
  const index = visible.findIndex((entry) => entry.id === selectedId);
  const next = Math.min(visible.length - 1, Math.max(0, index + step));
  select(visible[index === -1 ? 0 : next].id, { focus: true });
}

// ----- Rendering -----

function chip(label, count, value) {
  const button = el('button', 'chip');
  button.type = 'button';
  button.setAttribute('aria-pressed', String(tagFilter === value));
  button.append(label, el('span', 'count', String(count)));
  button.addEventListener('click', () => {
    notice = null;
    tagFilter = tagFilter === value ? null : value;
    render();
    const pressed = tagsEl.querySelector('[aria-pressed="true"]');
    (pressed || tagsEl.querySelector('button'))?.focus();
  });
  return button;
}

function renderChips() {
  const tags = tagCounts(entries);
  if (tagFilter !== null && tagFilter !== NO_TAG && !tags.some((t) => t.tag === tagFilter)) tagFilter = null;
  const untagged = entries.filter((entry) => !entry.tag).length;
  if (tagFilter === NO_TAG && untagged === 0) tagFilter = null;
  const chips = [chip('All', entries.length, null), ...tags.map((t) => chip(`#${t.tag}`, t.count, t.tag))];
  if (untagged > 0) chips.push(chip('No tag', untagged, NO_TAG));
  tagsEl.replaceChildren(...chips);
  tagsEl.hidden = tags.length === 0;
}

function viewRow(entry) {
  const row = el('li', 'win');
  row.dataset.id = entry.id;
  const date = el('time', 'win-date', rowDate.format(parseDate(entry.date)));
  date.dateTime = entry.date;
  date.title = longDate.format(parseDate(entry.date));
  const actions = el('span', 'win-actions');
  const edit = el('button', 'link', 'Edit');
  edit.type = 'button';
  edit.dataset.action = 'edit';
  const del = el('button', 'link danger', 'Delete');
  del.type = 'button';
  del.dataset.action = 'delete';
  actions.append(edit, del);
  row.append(date, el('span', 'win-text', entry.text), actions);
  return row;
}

function editRow(entry) {
  const row = el('li', 'win editing');
  row.dataset.id = entry.id;
  const form = el('form', 'edit-form');
  form.noValidate = true;
  const label = el('label', 'visually-hidden', 'Edit this win');
  label.htmlFor = 'edit-text';
  const input = el('input');
  input.type = 'text';
  input.id = 'edit-text';
  input.value = entry.text;
  input.maxLength = MAX_LENGTH;
  input.autocomplete = 'off';
  input.setAttribute('aria-describedby', 'edit-status');
  const save = el('button', 'primary', 'Save');
  save.type = 'submit';
  const cancel = el('button', '', 'Cancel');
  cancel.type = 'button';
  cancel.addEventListener('click', () => stopEditing());
  const status = el('span', 'status error');
  status.id = 'edit-status';
  status.setAttribute('role', 'alert');
  form.append(label, input, save, cancel, status);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    saveEdit(entry, input, save, status);
  });
  row.append(form);
  return row;
}

function renderList() {
  const today = localDate();
  visible = filterWins(entries, { query, tag: tagFilter });
  if (!visible.some((entry) => entry.id === selectedId)) selectedId = visible.length ? visible[0].id : null;

  const sections = groupByWeek(visible).map((group) => {
    const section = el('section', 'week');
    const heading = el('h2');
    heading.id = `week-${group.weekStart}`;
    const name = weekName(group.weekStart, today);
    if (name) heading.append(el('span', '', name));
    heading.append(el('span', name ? 'week-range' : '', weekRange(group.weekStart, today)));
    section.setAttribute('aria-labelledby', heading.id);
    const list = el('ul', 'wins');
    list.append(...group.entries.map((entry) => (entry.id === editingId ? editRow(entry) : viewRow(entry))));
    section.append(heading, list);
    return section;
  });
  listEl.replaceChildren(...sections);
  select(selectedId);
}

function renderEmptyState(settings) {
  const shortcut = settings && settings.shortcutActive ? formatAccelerator(settings.shortcut, window.winlog.platform) : '';
  emptyHowEl.textContent = shortcut
    ? `Click the button below, or press ${shortcut} at any time.`
    : 'Click the button below, or choose “Add a win” from the Win Log menu.';
  if (settings && settings.reminderDays.length > 0) {
    const [hours, minutes] = settings.reminderTime.split(':').map(Number);
    const time = clock.format(new Date(2000, 0, 1, hours, minutes));
    emptyReminderEl.textContent = `Win Log will also ask you at ${time} on the days you chose.`;
    emptyReminderEl.hidden = false;
  } else {
    emptyReminderEl.hidden = true;
  }
}

function render() {
  renderedOn = localDate();
  const hadListFocus = listEl.contains(document.activeElement);
  const thisMonth = countInMonth(entries, localDate());
  monthCountEl.textContent =
    thisMonth === 0 ? 'No wins this month yet' : `${plural(thisMonth, 'win', 'wins')} this month`;

  renderChips();
  renderList();

  const none = entries.length === 0;
  const filtering = query.trim() !== '' || tagFilter !== null;
  toolsEl.hidden = none;
  emptyEl.hidden = !none;
  noMatchEl.hidden = none || visible.length > 0;
  listEl.hidden = visible.length === 0;
  keysEl.hidden = visible.length === 0;
  keysEl.textContent = isMac
    ? '↑ ↓ move between wins · Return edits · Delete removes · / searches'
    : '↑ ↓ move between wins · Enter edits · Delete removes · / searches';
  if (notice) setStatus(notice.message, notice.isError);
  else if (filtering && visible.length > 0) {
    setStatus(`Showing ${visible.length} of ${plural(entries.length, 'win', 'wins')}`);
  } else setStatus('');

  if (editingId) {
    const input = document.getElementById('edit-text');
    if (input && document.activeElement !== input) {
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    }
  } else if (hadListFocus && selectedId) {
    select(selectedId, { focus: true });
  }
}

/** Shows a message (e.g. "Deleted.") until the user does something else. */
function announce(message, isError = false) {
  notice = { message, isError };
  setStatus(message, isError);
}

// ----- Loading -----

async function load() {
  try {
    entries = await window.winlog.listWins();
    loaded = true;
  } catch (err) {
    console.error(err);
    announce('Could not load your wins. Close this window and open it again.', true);
  }
  render();
}

window.winlog.onWinsChanged(() => {
  if (editingId) reloadWhenIdle = true; // do not pull the text field out from under the user
  else load();
});

// ----- Edit -----

function startEditing(id) {
  if (!visible.some((entry) => entry.id === id)) return;
  notice = null;
  editingId = id;
  selectedId = id;
  render();
}

function stopEditing({ focusRow = true } = {}) {
  const id = editingId;
  editingId = null;
  if (reloadWhenIdle) {
    reloadWhenIdle = false;
    load().then(() => focusRow && select(id, { focus: true }));
    return;
  }
  render();
  if (focusRow) select(id, { focus: true });
}

async function saveEdit(entry, input, saveButton, status) {
  const text = input.value.trim();
  if (text === '') {
    status.textContent = 'A win cannot be empty. To remove it, cancel and choose Delete.';
    input.focus();
    return;
  }
  if (text === entry.text) {
    stopEditing();
    return;
  }
  saveButton.disabled = true;
  status.textContent = '';
  try {
    const result = await window.winlog.editWin(entry.id, text);
    if (result.ok) {
      reloadWhenIdle = true; // pick up the saved win
      stopEditing();
      announce('Saved.');
    } else if (result.error === 'not-found') {
      reloadWhenIdle = true;
      stopEditing({ focusRow: false });
      announce('That win no longer exists.', true);
    } else {
      status.textContent = 'This text cannot be saved. Keep it to one line.';
      saveButton.disabled = false;
    }
  } catch (err) {
    console.error(err);
    status.textContent = 'Could not save. Your text is still here, so try again.';
    saveButton.disabled = false;
  }
}

// ----- Delete (the app asks "Delete this win?" before anything is removed) -----

async function remove(id) {
  const index = visible.findIndex((entry) => entry.id === id);
  if (index === -1) return;
  const neighbour = visible[index + 1] || visible[index - 1] || null;
  notice = null;
  try {
    const result = await window.winlog.deleteWin(id);
    if (!result.deleted) {
      if (result.error === 'not-found') {
        announce('That win no longer exists.', true);
        await load();
      }
      select(selectedId, { focus: true });
      return;
    }
    selectedId = neighbour ? neighbour.id : null;
    announce('Deleted.');
    await load();
    if (selectedId) select(selectedId, { focus: true });
    else searchEl.focus();
  } catch (err) {
    console.error(err);
    announce('Could not delete this win. Try again.', true);
  }
}

// ----- Mouse -----

listEl.addEventListener('click', (event) => {
  const row = event.target.closest('.win');
  if (!row || row.classList.contains('editing')) return;
  const button = event.target.closest('button[data-action]');
  if (!button) return;
  if (button.dataset.action === 'edit') startEditing(row.dataset.id);
  else if (button.dataset.action === 'delete') remove(row.dataset.id);
});

listEl.addEventListener('dblclick', (event) => {
  const row = event.target.closest('.win');
  if (row && !row.classList.contains('editing') && !event.target.closest('button')) startEditing(row.dataset.id);
});

listEl.addEventListener('focusin', (event) => {
  const row = event.target.closest('.win');
  if (row && row.dataset.id !== selectedId && !editingId) select(row.dataset.id);
});

// ----- Keyboard -----

listEl.addEventListener('keydown', (event) => {
  const row = event.target;
  if (!(row instanceof HTMLElement) || !row.classList.contains('win') || row.classList.contains('editing')) return;
  if (event.metaKey || event.ctrlKey || event.altKey) return;
  const actions = {
    ArrowDown: () => move(1),
    ArrowUp: () => move(-1),
    Home: () => select(visible[0].id, { focus: true }),
    End: () => select(visible[visible.length - 1].id, { focus: true }),
    Enter: () => startEditing(row.dataset.id),
    Delete: () => remove(row.dataset.id),
    Backspace: () => remove(row.dataset.id), // the key labelled "delete" on a Mac keyboard
  };
  const action = actions[event.key];
  if (!action) return;
  event.preventDefault();
  action();
});

searchEl.addEventListener('input', () => {
  notice = null;
  query = searchEl.value;
  render();
});

searchEl.addEventListener('keydown', (event) => {
  if ((event.key === 'ArrowDown' || event.key === 'Enter') && visible.length > 0 && !editingId) {
    event.preventDefault();
    select(selectedId || visible[0].id, { focus: true });
  }
});

function clearFilters() {
  notice = null;
  query = '';
  tagFilter = null;
  searchEl.value = '';
  render();
}

document.addEventListener('keydown', (event) => {
  const target = event.target;
  const typing = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
  if (event.key === '/' && !typing && !event.metaKey && !event.ctrlKey && !event.altKey) {
    if (toolsEl.hidden) return;
    event.preventDefault();
    searchEl.focus();
    searchEl.select();
  } else if (event.key === 'Escape') {
    event.preventDefault();
    if (editingId) stopEditing();
    else if (target === searchEl && searchEl.value !== '') clearFilters();
    else window.close();
  }
});

// ----- Buttons -----

document.getElementById('add').addEventListener('click', () => window.winlog.openWindow('entry'));
document.getElementById('export').addEventListener('click', () => window.winlog.openWindow('export'));
document.getElementById('empty-add').addEventListener('click', () => window.winlog.openWindow('entry'));
document.getElementById('clear').addEventListener('click', () => {
  clearFilters();
  searchEl.focus();
});

// The day may have changed while the window was open ("This week", "this month").
// Only then: redrawing on every focus would swallow the click that focused the window.
window.addEventListener('focus', () => {
  if (loaded && !editingId && renderedOn !== localDate()) render();
});

window.winlog
  .getSettings()
  .then(renderEmptyState)
  .catch(() => renderEmptyState(null));
load();
