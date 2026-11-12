'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { shouldPrompt, isValidTime, isValidDays } = require('../src/lib/schedule');

// 12 Nov 2026 is a Thursday. Dates are built from local parts, like the app does.
const at = (day, hours, minutes = 0) => new Date(2026, 10, day, hours, minutes);
const THU = 12;
const FRI = 13;
const SAT = 14;

const defaults = { reminderTime: '18:00', reminderDays: [1, 2, 3, 4, 5], lastPromptedDate: null };
const settings = (overrides = {}) => ({ ...defaults, ...overrides });

test('not before the reminder time', () => {
  assert.equal(shouldPrompt(at(THU, 17, 59), settings()), false);
});

test('at and after the reminder time', () => {
  assert.equal(shouldPrompt(at(THU, 18, 0), settings()), true);
  assert.equal(shouldPrompt(at(THU, 18, 1), settings()), true);
});

test('asleep or off at 18:00: asks at the next check later the same day', () => {
  assert.equal(shouldPrompt(at(THU, 22, 45), settings({ lastPromptedDate: '2026-11-11' })), true);
  assert.equal(shouldPrompt(at(THU, 23, 59), settings()), true);
});

test('only once per day', () => {
  assert.equal(shouldPrompt(at(THU, 18, 30), settings({ lastPromptedDate: '2026-11-12' })), false);
  assert.equal(shouldPrompt(at(THU, 23, 0), settings({ lastPromptedDate: '2026-11-12' })), false);
});

test('never asks for a previous day: a missed day is skipped the next morning', () => {
  // Machine off all Thursday evening, back on Friday morning before 18:00.
  const s = settings({ lastPromptedDate: '2026-11-11' });
  assert.equal(shouldPrompt(at(FRI, 0, 5), s), false);
  assert.equal(shouldPrompt(at(FRI, 9, 0), s), false);
  assert.equal(shouldPrompt(at(FRI, 18, 0), s), true); // Friday's own reminder
});

test('only on enabled days', () => {
  assert.equal(shouldPrompt(at(SAT, 19, 0), settings()), false);
  assert.equal(shouldPrompt(at(SAT, 19, 0), settings({ reminderDays: [6] })), true);
});

test('no days selected means the reminder is off', () => {
  assert.equal(shouldPrompt(at(THU, 20, 0), settings({ reminderDays: [] })), false);
});

test('a reminder time before now asks right away, e.g. after changing it in Settings', () => {
  assert.equal(shouldPrompt(at(THU, 14, 0), settings({ reminderTime: '09:30' })), true);
});

test('an invalid time never prompts', () => {
  assert.equal(shouldPrompt(at(THU, 20, 0), settings({ reminderTime: '' })), false);
  assert.equal(shouldPrompt(at(THU, 20, 0), settings({ reminderTime: '6pm' })), false);
});

test('isValidTime accepts 24-hour HH:MM only', () => {
  for (const ok of ['00:00', '09:05', '18:00', '23:59']) assert.equal(isValidTime(ok), true, ok);
  for (const bad of ['24:00', '9:05', '18:60', '18:00:00', ' 18:00', '', null, 1800]) {
    assert.equal(isValidTime(bad), false, String(bad));
  }
});

test('isValidDays accepts distinct weekdays 0–6, including none', () => {
  assert.equal(isValidDays([]), true);
  assert.equal(isValidDays([0, 1, 2, 3, 4, 5, 6]), true);
  assert.equal(isValidDays([1, 1]), false);
  assert.equal(isValidDays([7]), false);
  assert.equal(isValidDays([1.5]), false);
  assert.equal(isValidDays(['1']), false);
  assert.equal(isValidDays('1,2'), false);
});
