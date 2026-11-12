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

const { parseDate, isValidDate, addDays, addMonths, weekStart, monthStart, monthEnd } = require('../src/lib/dates');

test('parseDate gives local midnight and refuses dates that do not exist', () => {
  const d = parseDate('2026-11-12');
  assert.deepEqual([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()], [2026, 10, 12, 0]);
  assert.equal(localDate(parseDate('2024-02-29')), '2024-02-29'); // leap day
  for (const bad of ['2026-02-30', '2025-02-29', '2026-13-01', '2026-00-10', '2026-11-00', '2026-1-5', '12/11/2026', '', null, 20261112]) {
    assert.equal(parseDate(bad), null, String(bad));
    assert.equal(isValidDate(bad), false, String(bad));
  }
  assert.equal(isValidDate('2026-11-12'), true);
});

test('addDays crosses months, years and daylight saving changes', () => {
  assert.equal(addDays('2026-11-30', 1), '2026-12-01');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2027-01-01', -1), '2026-12-31');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
  assert.equal(addDays('2026-11-12', 0), '2026-11-12');
  // A whole year one day at a time must land exactly one year later, whatever the time zone.
  let date = '2026-01-01';
  for (let i = 0; i < 365; i++) date = addDays(date, 1);
  assert.equal(date, '2027-01-01');
});

test('addMonths keeps the day, or uses the last day of a shorter month', () => {
  assert.equal(addMonths('2026-11-12', -3), '2026-08-12');
  assert.equal(addMonths('2026-01-15', -1), '2025-12-15');
  assert.equal(addMonths('2026-02-10', -3), '2025-11-10');
  assert.equal(addMonths('2026-03-31', -1), '2026-02-28');
  assert.equal(addMonths('2024-03-31', -1), '2024-02-29');
  assert.equal(addMonths('2026-08-31', -6), '2026-02-28');
  assert.equal(addMonths('2026-12-31', 2), '2027-02-28');
  assert.equal(addMonths('2026-11-12', 0), '2026-11-12');
});

test('weekStart is the Monday of that week', () => {
  assert.equal(weekStart('2026-11-09'), '2026-11-09'); // a Monday
  assert.equal(weekStart('2026-11-12'), '2026-11-09'); // Thursday
  assert.equal(weekStart('2026-11-15'), '2026-11-09'); // Sunday
  assert.equal(weekStart('2026-11-16'), '2026-11-16'); // next Monday
  assert.equal(weekStart('2027-01-01'), '2026-12-28'); // crosses a year end
  assert.equal(weekStart('2026-03-01'), '2026-02-23'); // crosses a month end
});

test('monthStart and monthEnd', () => {
  assert.equal(monthStart('2026-11-12'), '2026-11-01');
  assert.equal(monthEnd('2026-11-12'), '2026-11-30');
  assert.equal(monthEnd('2026-02-01'), '2026-02-28');
  assert.equal(monthEnd('2024-02-10'), '2024-02-29');
  assert.equal(monthEnd('2026-12-31'), '2026-12-31');
});
