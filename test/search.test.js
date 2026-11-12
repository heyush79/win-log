'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { normalize, searchTerms, matchesSearch, matchesTag, filterWins, NO_TAG } = require('../src/lib/search');

const win = (text, tag = null, date = '2026-11-12') => ({ id: text, date, text, tag });
const wins = [
  win('Fixed the flaky login test #bugfix', 'bugfix', '2026-11-12'),
  win('Café menu redesign approved', null, '2026-11-05'),
  win('Helped Priya debug the cache #helped-someone', 'helped-someone', '2026-10-30'),
  win('Reviewed 4 pull requests', null, '2025-12-31'),
];
const texts = (list) => list.map((entry) => entry.text);

test('an empty search matches everything', () => {
  assert.equal(matchesSearch(wins[0], ''), true);
  assert.equal(matchesSearch(wins[0], '   '), true);
  assert.equal(matchesSearch(wins[0], undefined), true);
  assert.equal(filterWins(wins).length, 4);
});

test('search ignores case and accents', () => {
  assert.deepEqual(texts(filterWins(wins, { query: 'FLAKY' })), [wins[0].text]);
  assert.deepEqual(texts(filterWins(wins, { query: 'cafe' })), [wins[1].text]);
  assert.deepEqual(texts(filterWins(wins, { query: 'CAFÉ' })), [wins[1].text]);
  assert.equal(normalize('Ünïcödé'), 'unicode');
});

test('every word must match, in any order', () => {
  assert.deepEqual(texts(filterWins(wins, { query: 'test login' })), [wins[0].text]);
  assert.deepEqual(texts(filterWins(wins, { query: 'login priya' })), []);
});

test('part of a word matches', () => {
  assert.deepEqual(texts(filterWins(wins, { query: 'debug' })), [wins[2].text]);
  assert.deepEqual(texts(filterWins(wins, { query: 'rev' })), [wins[3].text]);
});

test('a tag can be searched with or without "#"', () => {
  assert.deepEqual(texts(filterWins(wins, { query: '#bugfix' })), [wins[0].text]);
  assert.deepEqual(texts(filterWins(wins, { query: 'helped-someone' })), [wins[2].text]);
  assert.deepEqual(searchTerms('  #Bugfix   ##x  # '), ['bugfix', 'x']);
});

test('the date can be searched', () => {
  assert.deepEqual(texts(filterWins(wins, { query: '2026-11' })), [wins[0].text, wins[1].text]);
  assert.deepEqual(texts(filterWins(wins, { query: '2025' })), [wins[3].text]);
});

test('special characters in the search are plain text, not patterns', () => {
  assert.deepEqual(texts(filterWins(wins, { query: '.*' })), []);
  assert.deepEqual(texts(filterWins([win('Saved 50% (wow) [really]')], { query: '50% (wow) [really]' })), [
    'Saved 50% (wow) [really]',
  ]);
});

test('tag filter: one tag, no tag, or all', () => {
  assert.deepEqual(texts(filterWins(wins, { tag: 'bugfix' })), [wins[0].text]);
  assert.deepEqual(texts(filterWins(wins, { tag: NO_TAG })), [wins[1].text, wins[3].text]);
  assert.equal(filterWins(wins, { tag: null }).length, 4);
  assert.equal(matchesTag(wins[0], 'other'), false);
  assert.equal(matchesTag(wins[1], NO_TAG), true);
});

test('search and tag filter work together', () => {
  assert.deepEqual(texts(filterWins(wins, { query: 'pull', tag: NO_TAG })), [wins[3].text]);
  assert.deepEqual(texts(filterWins(wins, { query: 'pull', tag: 'bugfix' })), []);
});
