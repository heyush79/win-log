'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  MAX_LINES,
  MAX_LINE_LENGTH,
  MAX_TEXT_LENGTH,
  isValidId,
  parseWinLines,
  cleanWinText,
  createEntries,
  editEntry,
  deleteEntry,
} = require('../src/lib/entries');

const entry = (id, text, tag = null) => ({
  id,
  date: '2026-11-10',
  text,
  tag,
  createdAt: '2026-11-10T09:00:00.000Z',
  updatedAt: '2026-11-10T09:00:00.000Z',
});
const LATER = new Date('2026-11-12T15:30:00.000Z');

test('parseWinLines: one win per non-empty line, trimmed', () => {
  assert.deepEqual(parseWinLines('  first \n\n second\r\nthird\n   \n'), ['first', 'second', 'third']);
});

test('parseWinLines refuses nothing, too much and wrong types', () => {
  assert.throws(() => parseWinLines(''), { code: 'INVALID_TEXT' });
  assert.throws(() => parseWinLines(' \n \n'), { code: 'INVALID_TEXT' });
  assert.throws(() => parseWinLines(null), { code: 'INVALID_TEXT' });
  assert.throws(() => parseWinLines(['a']), { code: 'INVALID_TEXT' });
  assert.throws(() => parseWinLines('x'.repeat(MAX_TEXT_LENGTH + 1)), { code: 'INVALID_TEXT' });
  assert.throws(() => parseWinLines('x'.repeat(MAX_LINE_LENGTH + 1)), { code: 'INVALID_TEXT' });
  assert.throws(() => parseWinLines(Array(MAX_LINES + 1).fill('a').join('\n')), { code: 'INVALID_TEXT' });
  assert.equal(parseWinLines(Array(MAX_LINES).fill('a').join('\n')).length, MAX_LINES);
});

test('createEntries: local date, first tag, same timestamps, a new id each', () => {
  // 23:30 local time on 12 Nov. In UTC this may already be 13 Nov; the date must stay local.
  const now = new Date(2026, 10, 12, 23, 30);
  let n = 0;
  const entries = createEntries(['Fixed it #bugfix #urgent', 'No tag here'], now, () => `id-${++n}`);
  assert.deepEqual(entries, [
    { id: 'id-1', date: '2026-11-12', text: 'Fixed it #bugfix #urgent', tag: 'bugfix', createdAt: now.toISOString(), updatedAt: now.toISOString() },
    { id: 'id-2', date: '2026-11-12', text: 'No tag here', tag: null, createdAt: now.toISOString(), updatedAt: now.toISOString() },
  ]);
});

test('cleanWinText: a single non-empty line', () => {
  assert.equal(cleanWinText('  hello  '), 'hello');
  assert.throws(() => cleanWinText('   '), { code: 'INVALID_TEXT' });
  assert.throws(() => cleanWinText('two\nlines'), { code: 'INVALID_TEXT' });
  assert.throws(() => cleanWinText('two\rlines'), { code: 'INVALID_TEXT' });
  assert.throws(() => cleanWinText('x'.repeat(MAX_LINE_LENGTH + 1)), { code: 'INVALID_TEXT' });
  assert.throws(() => cleanWinText(12), { code: 'INVALID_TEXT' });
  assert.equal(cleanWinText('x'.repeat(MAX_LINE_LENGTH)).length, MAX_LINE_LENGTH);
});

test('editEntry changes the text, re-reads the tag and sets updatedAt', () => {
  const before = [entry('a', 'First #bugfix', 'bugfix'), entry('b', 'Second')];
  const { entries, entry: edited } = editEntry(before, 'a', '  First, now better #Review ', LATER);
  assert.deepEqual(edited, {
    id: 'a',
    date: '2026-11-10',
    text: 'First, now better #Review',
    tag: 'review',
    createdAt: '2026-11-10T09:00:00.000Z',
    updatedAt: LATER.toISOString(),
  });
  assert.deepEqual(entries.map((e) => e.id), ['a', 'b'], 'order is kept');
  assert.equal(entries[1], before[1], 'other wins are untouched');
  assert.equal(before[0].text, 'First #bugfix', 'the input is not changed');
});

test('editEntry: removing the tag from the text removes the tag', () => {
  const { entry: edited } = editEntry([entry('a', 'First #bugfix', 'bugfix')], 'a', 'First', LATER);
  assert.equal(edited.tag, null);
});

test('editEntry with the same text changes nothing, not even updatedAt', () => {
  const before = [entry('a', 'Same')];
  const result = editEntry(before, 'a', ' Same ', LATER);
  assert.equal(result.entries, before);
  assert.equal(result.entry, before[0]);
});

test('editEntry refuses a missing win and invalid text', () => {
  const before = [entry('a', 'First')];
  assert.throws(() => editEntry(before, 'nope', 'x', LATER), { code: 'NOT_FOUND' });
  assert.throws(() => editEntry(before, 'a', '  ', LATER), { code: 'INVALID_TEXT' });
  assert.throws(() => editEntry(before, 'a', 'a\nb', LATER), { code: 'INVALID_TEXT' });
});

test('deleteEntry removes exactly one win and reports it', () => {
  const before = [entry('a', 'First'), entry('b', 'Second'), entry('c', 'Third')];
  const { entries, entry: removed } = deleteEntry(before, 'b');
  assert.deepEqual(entries.map((e) => e.id), ['a', 'c']);
  assert.equal(removed, before[1]);
  assert.equal(before.length, 3, 'the input is not changed');
});

test('deleteEntry of a missing win changes nothing', () => {
  const before = [entry('a', 'First')];
  const result = deleteEntry(before, 'nope');
  assert.equal(result.entries, before);
  assert.equal(result.entry, null);
});

test('isValidId accepts short non-empty strings only', () => {
  assert.equal(isValidId('3f2c9a1e-0000-4000-8000-000000000000'), true);
  for (const bad of ['', null, undefined, 42, {}, 'x'.repeat(101)]) assert.equal(isValidId(bad), false);
});

test('parseWinLines also splits on the Unicode line and paragraph separators', () => {
  const LS = String.fromCharCode(0x2028);
  const PS = String.fromCharCode(0x2029);
  assert.deepEqual(parseWinLines(`one${LS}two${PS}three`), ['one', 'two', 'three']);
  assert.throws(() => cleanWinText(`one${LS}two`), { code: 'INVALID_TEXT' });
});

const { isUsableEntry, joinLines } = require('../src/lib/entries');

test('isUsableEntry: an id, a real date and a text are needed to show a win', () => {
  assert.equal(isUsableEntry(entry('a', 'ok')), true);
  assert.equal(isUsableEntry({ id: 'a', date: '2026-11-10', text: '' }), true);
  for (const bad of [null, undefined, 5, 'text', [], {}, { id: 'a', date: '2026-11-10' }, { id: 'a', text: 'x' }, { id: 'a', date: '2026-02-30', text: 'x' }, { id: 5, date: '2026-11-10', text: 'x' }, { id: 'a', date: '2026-11-10', text: 5 }]) {
    assert.equal(isUsableEntry(bad), false, JSON.stringify(bad));
  }
});

test('edit and delete still work when the list holds broken items', () => {
  const list = [null, 'junk', entry('a', 'First'), { text: 'no id' }];
  assert.equal(editEntry(list, 'a', 'Changed', LATER).entry.text, 'Changed');
  assert.equal(editEntry(list, 'a', 'Changed', LATER).entries.length, 4, 'broken items stay in the list');
  assert.deepEqual(deleteEntry(list, 'a').entries, [null, 'junk', { text: 'no id' }]);
  assert.throws(() => editEntry(list, 'missing', 'x', LATER), { code: 'NOT_FOUND' });
});

test('joinLines turns every kind of line break into one space', () => {
  const LS = String.fromCharCode(0x2028);
  assert.equal(joinLines(`a\nb\r\nc\rd${LS}e\n\n\nf`), 'a b c d e f');
  assert.equal(joinLines('no breaks'), 'no breaks');
  assert.equal(joinLines('twice'), 'twice', 'safe to call again and again');
});
