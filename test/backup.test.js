'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  SCHEMA_VERSION,
  cleanImportedEntry,
  parseBackup,
  planImport,
  importSummary,
  safeDeviceName,
  folderBackupName,
  folderBackupsOf,
  folderBackupsToDelete,
} = require('../src/lib/backup');

const NOW = new Date('2026-11-12T10:00:00.000Z');
const entry = (id, text = `Win ${id}`, date = '2026-11-10') => ({
  id,
  date,
  text,
  tag: null,
  createdAt: '2026-11-10T09:00:00.000Z',
  updatedAt: '2026-11-10T09:30:00.000Z',
});
const backup = (entries, schemaVersion = SCHEMA_VERSION) => JSON.stringify({ schemaVersion, entries });

// ----- parseBackup -----

test('a backup made by Win Log is read back unchanged', () => {
  const wins = [entry('a', 'First #bugfix'), entry('b', 'Second')];
  wins[0].tag = 'bugfix';
  assert.deepEqual(parseBackup(backup(wins), NOW), { entries: wins, skipped: 0 });
});

test('an empty backup is valid', () => {
  assert.deepEqual(parseBackup(backup([]), NOW), { entries: [], skipped: 0 });
});

test('files that are not a Win Log backup are refused', () => {
  const notBackups = [
    'not json at all',
    '',
    'null',
    '[]',
    '"text"',
    '{}',
    '{"entries": []}',
    '{"schemaVersion": 1}',
    '{"schemaVersion": "1", "entries": []}',
    '{"schemaVersion": 1, "entries": {}}',
  ];
  for (const text of notBackups) {
    assert.throws(() => parseBackup(text, NOW), { code: 'NOT_BACKUP' }, text);
  }
});

test('a backup from a newer version is refused, not half-read', () => {
  assert.throws(() => parseBackup(backup([entry('a')], SCHEMA_VERSION + 1), NOW), { code: 'NEWER_VERSION' });
});

test('items that are not usable wins are skipped and counted', () => {
  const text = backup([
    entry('good'),
    null,
    42,
    'a string',
    [],
    { id: 'no-date', text: 'x' },
    { id: 'bad-date', date: '2026-02-30', text: 'x' },
    { id: 'no-text', date: '2026-11-10' },
    { id: 'empty-text', date: '2026-11-10', text: '   ' },
    { id: 'number-text', date: '2026-11-10', text: 5 },
    { id: '', date: '2026-11-10', text: 'empty id' },
    { id: 7, date: '2026-11-10', text: 'number id' },
    { id: 'x'.repeat(101), date: '2026-11-10', text: 'long id' },
    { id: 'too-long', date: '2026-11-10', text: 'x'.repeat(2001) },
  ]);
  const { entries, skipped } = parseBackup(text, NOW);
  assert.deepEqual(entries.map((e) => e.id), ['good']);
  assert.equal(skipped, 13);
});

test('a repeated id in the file is only taken once: the first one', () => {
  const { entries, skipped } = parseBackup(backup([entry('a', 'first copy'), entry('a', 'second copy')]), NOW);
  assert.deepEqual(entries.map((e) => e.text), ['first copy']);
  assert.equal(skipped, 1);
});

test('the tag always comes from the text, whatever the file says', () => {
  const liar = { ...entry('a', 'Fixed it #BugFix'), tag: '<script>' };
  const none = { ...entry('b', 'No tag in this text'), tag: 'made-up' };
  const { entries } = parseBackup(backup([liar, none]), NOW);
  assert.deepEqual(entries.map((e) => e.tag), ['bugfix', null]);
});

test('only known fields are kept, and line breaks in a text become spaces', () => {
  const odd = { ...entry('a', '  two\nlines\r\nhere  '), extra: 'dropped' };
  const { entries } = parseBackup(backup([odd]), NOW);
  assert.deepEqual(Object.keys(entries[0]), ['id', 'date', 'text', 'tag', 'createdAt', 'updatedAt']);
  assert.equal(entries[0].text, 'two lines here');
});

test('a "__proto__" key in the file is ignored and changes nothing', () => {
  const raw = '{"schemaVersion":1,"entries":[{"id":"a","date":"2026-11-10","text":"x","__proto__":{"polluted":true}}]}';
  const { entries } = parseBackup(raw, NOW);
  assert.deepEqual(Object.keys(entries[0]), ['id', 'date', 'text', 'tag', 'createdAt', 'updatedAt']);
  assert.equal(entries[0].polluted, undefined);
  assert.equal({}.polluted, undefined);
});

test('missing or broken timestamps are filled in', () => {
  const noStamps = { id: 'a', date: '2026-11-10', text: 'No stamps' };
  const badStamps = { id: 'b', date: '2026-11-10', text: 'Bad stamps', createdAt: 'yesterday', updatedAt: 12 };
  const onlyCreated = { id: 'c', date: '2026-11-10', text: 'One stamp', createdAt: '2026-11-10T09:00:00.000Z' };
  const { entries } = parseBackup(backup([noStamps, badStamps, onlyCreated]), NOW);
  assert.equal(entries[0].createdAt, NOW.toISOString());
  assert.equal(entries[0].updatedAt, NOW.toISOString());
  assert.equal(entries[1].createdAt, NOW.toISOString());
  assert.equal(entries[2].updatedAt, '2026-11-10T09:00:00.000Z');
});

test('cleanImportedEntry returns null for anything that is not a win', () => {
  assert.equal(cleanImportedEntry(undefined, NOW), null);
  assert.equal(cleanImportedEntry({}, NOW), null);
  assert.deepEqual(cleanImportedEntry(entry('a'), NOW), entry('a'));
});

// ----- planImport: merge by id, never overwrite -----

test('wins with new ids are added; nothing else is', () => {
  const mine = [entry('a'), entry('b')];
  const plan = planImport(mine, [entry('b'), entry('c'), entry('d')]);
  assert.deepEqual(plan.toAdd.map((e) => e.id), ['c', 'd']);
  assert.equal(plan.same, 1);
  assert.equal(plan.different, 0);
});

test('a win that differs in the backup is counted, never added or replaced', () => {
  const mine = [entry('a', 'My current text'), entry('b', 'Same', '2026-11-10')];
  const theirs = [entry('a', 'Older text from the backup'), entry('b', 'Same', '2026-11-09')];
  const plan = planImport(mine, theirs);
  assert.deepEqual(plan.toAdd, []);
  assert.equal(plan.same, 0);
  assert.equal(plan.different, 2);
  assert.equal(mine[0].text, 'My current text', 'existing wins are not touched');
});

test('importing into an empty list adds everything (moving to a new computer)', () => {
  const theirs = [entry('a'), entry('b'), entry('c')];
  assert.deepEqual(planImport([], theirs), { toAdd: theirs, same: 0, different: 0 });
});

test('importing the same backup twice adds nothing the second time', () => {
  const theirs = [entry('a'), entry('b')];
  const first = planImport([], theirs);
  const second = planImport(first.toAdd, theirs);
  assert.deepEqual(second, { toAdd: [], same: 2, different: 0 });
});

test('planImport copes with a repeated id and with broken items in the existing list', () => {
  const plan = planImport([null, 5, entry('a')], [entry('b', 'one'), entry('b', 'two'), entry('a')]);
  assert.deepEqual(plan.toAdd.map((e) => e.text), ['one']);
  assert.equal(plan.same + plan.different, 2);
});

// ----- importSummary -----

test('the summary says what will happen in plain words', () => {
  assert.deepEqual(importSummary({ toAdd: [entry('a'), entry('b')], same: 0, different: 0 }, 0), ['2 wins will be added.']);
  assert.deepEqual(importSummary({ toAdd: [entry('a')], same: 3, different: 2 }, 1), [
    '1 win will be added.',
    '5 wins are already in Win Log and will stay as they are.',
    '2 of them are different in the backup. Your current versions are kept.',
    '1 item in the file could not be read and will be skipped.',
  ]);
  assert.deepEqual(importSummary({ toAdd: [], same: 1, different: 0 }, 0), [
    'There is nothing new to add.',
    '1 win is already in Win Log and will stay as it is.',
  ]);
  assert.deepEqual(importSummary({ toAdd: [], same: 0, different: 1 }, 2), [
    'There is nothing new to add.',
    '1 win is already in Win Log and will stay as it is.',
    '1 of them is different in the backup. Your current version is kept.',
    '2 items in the file could not be read and will be skipped.',
  ]);
});

// ----- Backup folder file names -----

test('safeDeviceName keeps letters, digits and dashes only', () => {
  assert.equal(safeDeviceName('Ayushs-MacBook-Pro.local'), 'Ayushs-MacBook-Pro');
  assert.equal(safeDeviceName('DESKTOP-4F2K9QX'), 'DESKTOP-4F2K9QX');
  assert.equal(safeDeviceName('my pc (work)/../etc'), 'my-pc-work-etc');
  assert.equal(safeDeviceName('..'), 'computer');
  assert.equal(safeDeviceName(''), 'computer');
  assert.equal(safeDeviceName(undefined), 'computer');
  assert.equal(safeDeviceName('x'.repeat(100)).length, 40);
  assert.match(safeDeviceName(`${'a'.repeat(39)}-b`), /^a{39}$/, 'no dash left at the end after cutting');
});

test('folderBackupName names the computer and the day', () => {
  assert.equal(folderBackupName('Ayushs-MacBook-Pro', '2026-11-12'), 'win-log-backup-Ayushs-MacBook-Pro-2026-11-12.json');
});

test('only backups made by this computer are listed, oldest first', () => {
  const names = [
    'win-log-backup-mac-2026-11-12.json',
    'win-log-backup-mac-2026-11-10.json',
    'win-log-backup-mac-2-2026-11-11.json', // another computer whose name starts the same
    'win-log-backup-other-pc-2026-11-09.json',
    'win-log-backup-2026-11-12.json', // a manual "Export backup"
    'win-log-backup-mac-2026-11-11.json.winlog-tmp',
    'win-log-backup-mac-2026-11-1.json',
    'win-log-backup-mac-2026-11-11.json.bak',
    'holiday-photos.zip',
  ];
  assert.deepEqual(folderBackupsOf(names, 'mac'), ['win-log-backup-mac-2026-11-10.json', 'win-log-backup-mac-2026-11-12.json']);
  assert.deepEqual(folderBackupsOf(names, 'mac-2'), ['win-log-backup-mac-2-2026-11-11.json']);
  assert.deepEqual(folderBackupsOf(names, 'nobody'), []);
});

test('pruning keeps the newest backups of this computer and never names another file', () => {
  const mine = Array.from({ length: 16 }, (_, i) => `win-log-backup-mac-2026-11-${String(i + 1).padStart(2, '0')}.json`);
  const others = ['win-log-backup-old-laptop-2025-01-01.json', 'notes.txt', 'win-log-backup-2026-11-01.json'];
  const toDelete = folderBackupsToDelete([...others, ...mine], 'mac', 14);
  assert.deepEqual(toDelete, ['win-log-backup-mac-2026-11-01.json', 'win-log-backup-mac-2026-11-02.json']);
  assert.deepEqual(folderBackupsToDelete(mine.slice(0, 14), 'mac', 14), []);
  assert.deepEqual(folderBackupsToDelete(others, 'mac', 14), []);
});
