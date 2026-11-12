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

const { findTag, textWithoutTag } = require('../src/lib/tags');

test('findTag says where the tag is in the text', () => {
  assert.deepEqual(findTag('Fixed login #Bugfix today'), { tag: 'bugfix', index: 12, length: 7 });
  assert.deepEqual(findTag('#docs first'), { tag: 'docs', index: 0, length: 5 });
  assert.deepEqual(findTag('Trailing dash #bug- here'), { tag: 'bug', index: 14, length: 4 });
  assert.equal(findTag('No tag, only issue#12 and #123'), null);
});

test('textWithoutTag removes a tag at the end, with or without punctuation after it', () => {
  assert.equal(textWithoutTag('Fixed the flaky login test #bugfix'), 'Fixed the flaky login test');
  assert.equal(textWithoutTag('Fixed the flaky login test #bugfix.'), 'Fixed the flaky login test.');
  assert.equal(textWithoutTag('Fixed it!   #bugfix  '), 'Fixed it!');
});

test('textWithoutTag removes a tag at the start, and a separator after it', () => {
  assert.equal(textWithoutTag('#bugfix Fixed the test'), 'Fixed the test');
  assert.equal(textWithoutTag('#bugfix: Fixed the test'), 'Fixed the test');
  assert.equal(textWithoutTag('  #bugfix - Fixed the test'), 'Fixed the test');
});

test('textWithoutTag keeps the word when the tag is part of the sentence', () => {
  assert.equal(textWithoutTag('Ran the #onboarding session for new hires'), 'Ran the onboarding session for new hires');
});

test('textWithoutTag only touches the first tag and keeps everything else as typed', () => {
  assert.equal(textWithoutTag('Fixed login #bugfix #urgent'), 'Fixed login #urgent');
  assert.equal(textWithoutTag('Closed issue#12 with C# code #work'), 'Closed issue#12 with C# code');
  assert.equal(textWithoutTag('Nothing to remove here'), 'Nothing to remove here');
  assert.equal(textWithoutTag('Fixed login #bugfix #urgent.'), 'Fixed login #urgent.');
});

test('textWithoutTag only drops the "#" when nothing readable would be left', () => {
  assert.equal(textWithoutTag('#solo'), 'solo');
  assert.equal(textWithoutTag('#Solo!'), 'Solo!');
  assert.equal(textWithoutTag('  #solo  '), 'solo');
});
