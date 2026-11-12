'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { sortNewestFirst, groupByWeek, countInMonth, countOnDate, tagCounts } = require('../src/lib/group');

let n = 0;
const win = (date, text, tag = null, createdAt = `${date}T10:00:00.000Z`) => ({
  id: `id-${++n}`,
  date,
  text,
  tag,
  createdAt,
});

test('newest first: by date, then by the time the win was added', () => {
  const a = win('2026-11-10', 'a');
  const b = win('2026-11-12', 'b', null, '2026-11-12T09:00:00.000Z');
  const c = win('2026-11-12', 'c', null, '2026-11-12T17:00:00.000Z');
  const input = [a, b, c];
  assert.deepEqual(sortNewestFirst(input).map((e) => e.text), ['c', 'b', 'a']);
  assert.deepEqual(input.map((e) => e.text), ['a', 'b', 'c'], 'the input is not changed');
});

test('weeks start on Monday: Sunday belongs to the week before', () => {
  // 9 Nov 2026 is a Monday, 15 Nov a Sunday, 16 Nov the next Monday.
  const groups = groupByWeek([
    win('2026-11-09', 'mon'),
    win('2026-11-15', 'sun'),
    win('2026-11-16', 'next mon'),
    win('2026-11-08', 'previous sun'),
  ]);
  assert.deepEqual(
    groups.map((g) => [g.weekStart, g.entries.map((e) => e.text)]),
    [
      ['2026-11-16', ['next mon']],
      ['2026-11-09', ['sun', 'mon']],
      ['2026-11-02', ['previous sun']],
    ]
  );
});

test('a week that crosses a year end stays one group', () => {
  // 28 Dec 2026 is a Monday; 1–3 Jan 2027 are Fri–Sun of the same week.
  const groups = groupByWeek([win('2026-12-28', 'a'), win('2027-01-01', 'b'), win('2027-01-03', 'c'), win('2027-01-04', 'd')]);
  assert.deepEqual(
    groups.map((g) => [g.weekStart, g.entries.length]),
    [
      ['2027-01-04', 1],
      ['2026-12-28', 3],
    ]
  );
});

test('empty weeks are left out and no wins gives no groups', () => {
  assert.deepEqual(groupByWeek([]), []);
  const groups = groupByWeek([win('2026-11-12', 'a'), win('2026-09-01', 'b')]);
  assert.deepEqual(groups.map((g) => g.weekStart), ['2026-11-09', '2026-08-31']);
});

test('countInMonth counts wins dated in the same calendar month', () => {
  const entries = [win('2026-11-01', 'a'), win('2026-11-30', 'b'), win('2026-10-31', 'c'), win('2025-11-12', 'd')];
  assert.equal(countInMonth(entries, '2026-11-12'), 2);
  assert.equal(countInMonth(entries, '2026-12-01'), 0);
  assert.equal(countInMonth([], '2026-11-12'), 0);
});

test('countOnDate counts wins dated that day', () => {
  const entries = [win('2026-11-12', 'a'), win('2026-11-12', 'b'), win('2026-11-11', 'c')];
  assert.equal(countOnDate(entries, '2026-11-12'), 2);
  assert.equal(countOnDate(entries, '2026-11-13'), 0);
});

test('tagCounts: most used first, then A to Z, untagged wins left out', () => {
  const entries = [
    win('2026-11-12', 'a', 'review'),
    win('2026-11-12', 'b', 'bugfix'),
    win('2026-11-12', 'c', 'bugfix'),
    win('2026-11-12', 'd', 'alpha'),
    win('2026-11-12', 'e', null),
  ];
  assert.deepEqual(tagCounts(entries), [
    { tag: 'bugfix', count: 2 },
    { tag: 'alpha', count: 1 },
    { tag: 'review', count: 1 },
  ]);
  assert.deepEqual(tagCounts([]), []);
});

const { compareNewestFirst } = require('../src/lib/group');
const { FORMATS } = require('../src/lib/exportMarkdown');
const { REPO_OWNER, REPO_NAME, REPO_URL } = require('../src/lib/links');

test('compareNewestFirst: later date first, then later creation, then id; equal wins compare as 0', () => {
  const a = { id: 'a', date: '2026-11-12', createdAt: '2026-11-12T10:00:00.000Z' };
  const b = { id: 'b', date: '2026-11-11', createdAt: '2026-11-12T23:00:00.000Z' };
  const c = { id: 'c', date: '2026-11-12', createdAt: '2026-11-12T11:00:00.000Z' };
  const d = { id: 'd', date: '2026-11-12', createdAt: '2026-11-12T11:00:00.000Z' };
  assert.ok(compareNewestFirst(a, b) < 0, 'the later date comes first, whatever the creation time');
  assert.ok(compareNewestFirst(b, a) > 0);
  assert.ok(compareNewestFirst(c, a) < 0, 'same date: the one added later comes first');
  assert.ok(compareNewestFirst(d, c) < 0 && compareNewestFirst(c, d) > 0, 'same date and time: a fixed order by id');
  assert.equal(compareNewestFirst(a, a), 0);
  // The order never depends on the order the wins came in.
  const sorted = (list) => [...list].sort(compareNewestFirst).map((e) => e.id).join('');
  assert.equal(sorted([a, b, c, d]), 'dcab');
  assert.equal(sorted([d, c, b, a]), 'dcab');
  assert.equal(sorted([b, a, d, c]), 'dcab');
});

test('the constants other files rely on', () => {
  assert.deepEqual(FORMATS, ['markdown', 'text']);
  assert.equal(REPO_URL, `https://github.com/${REPO_OWNER}/${REPO_NAME}`);
  assert.match(REPO_OWNER, /^[A-Za-z0-9-]+$/);
  assert.match(REPO_NAME, /^[A-Za-z0-9._-]+$/);
});
