'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { extractTag } = require('../src/lib/tags');

test('finds a tag and lowercases it', () => {
  assert.equal(extractTag('Fixed the login bug #BugFix'), 'bugfix');
});

test('tags may contain hyphens and underscores', () => {
  assert.equal(extractTag('Paired with a new hire #helped-someone'), 'helped-someone');
  assert.equal(extractTag('#deep_work on the parser'), 'deep_work');
});

test('the first tag wins', () => {
  assert.equal(extractTag('Read about CRDTs #learning #reading'), 'learning');
});

test('trailing punctuation is not part of the tag', () => {
  assert.equal(extractTag('Shipped search #feature.'), 'feature');
  assert.equal(extractTag('Shipped search (#feature)'), 'feature');
  assert.equal(extractTag('Helped Sam #helped-.'), 'helped');
});

test('numbers and mid-word hashes are not tags', () => {
  assert.equal(extractTag('Closed issue #123'), null);
  assert.equal(extractTag('Fixed issue#abc'), null);
  assert.equal(extractTag('Gave a C# talk'), null);
  assert.equal(extractTag('See https://example.com/#section'), null);
  assert.equal(extractTag('No tag here'), null);
});

test('skips a non-tag and finds the real one after it', () => {
  assert.equal(extractTag('Gave a C# talk #learning'), 'learning');
  assert.equal(extractTag('Closed #123 #bugfix'), 'bugfix');
});

test('non-English letters work', () => {
  assert.equal(extractTag('Neues gelernt #lernen'), 'lernen');
});
