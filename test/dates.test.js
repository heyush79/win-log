'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { localDate, localFileStamp } = require('../src/lib/dates');

test('localDate uses the local calendar day, even late in the evening', () => {
  const lateEvening = new Date(2026, 10, 12, 23, 59, 30); // 12 Nov 2026, 23:59 local
  assert.equal(localDate(lateEvening), '2026-11-12');
});

test('localDate pads month and day', () => {
  assert.equal(localDate(new Date(2027, 0, 5, 9, 0)), '2027-01-05');
});

test('localFileStamp has no characters that are invalid in file names', () => {
  const stamp = localFileStamp(new Date(2026, 10, 12, 18, 5, 9));
  assert.equal(stamp, '2026-11-12T18-05-09');
  assert.doesNotMatch(stamp, /[:\\/*?"<>|]/);
});
