'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createStore, BACKUPS_KEPT, defaultSettings } = require('../src/main/store');

async function tempDir(t) {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'winlog-test-'));
  t.after(() => fsp.rm(dir, { recursive: true, force: true }));
  return dir;
}

function entry(text, date = '2026-11-12') {
  return { id: text, date, text, tag: null, createdAt: 'x', updatedAt: 'x' };
}

const fixedNow = (iso) => () => new Date(iso);
const readJson = async (file) => JSON.parse(await fsp.readFile(file, 'utf8'));

test('first run starts empty without creating a file', async (t) => {
  const dir = await tempDir(t);
  const store = createStore(dir);
  assert.deepEqual(await store.load(), { recovered: null });
  assert.deepEqual(store.getEntries(), []);
  assert.equal(fs.existsSync(path.join(dir, 'wins.json')), false);
});

test('saved entries are on disk and load again in a new session', async (t) => {
  const dir = await tempDir(t);
  const store = createStore(dir);
  await store.load();
  await store.addEntries([entry('a'), entry('b')]);

  const onDisk = await readJson(path.join(dir, 'wins.json'));
  assert.equal(onDisk.schemaVersion, 1);
  assert.deepEqual(onDisk.entries.map((e) => e.text), ['a', 'b']);
  assert.equal(fs.existsSync(path.join(dir, 'wins.json.tmp')), false);

  const again = createStore(dir);
  await again.load();
  assert.deepEqual(again.getEntries().map((e) => e.text), ['a', 'b']);
});

test('saves started at the same time all end up in the file', async (t) => {
  const dir = await tempDir(t);
  const store = createStore(dir);
  await store.load();
  await Promise.all(['a', 'b', 'c', 'd'].map((text) => store.addEntries([entry(text)])));
  const onDisk = await readJson(path.join(dir, 'wins.json'));
  assert.deepEqual(onDisk.entries.map((e) => e.text).sort(), ['a', 'b', 'c', 'd']);
});

test('a temp file left by a crash is ignored', async (t) => {
  const dir = await tempDir(t);
  const first = createStore(dir);
  await first.load();
  await first.addEntries([entry('kept')]);
  await fsp.writeFile(path.join(dir, 'wins.json.tmp'), '{"schemaVersion":1,"entr'); // half-written

  const store = createStore(dir);
  assert.deepEqual(await store.load(), { recovered: null });
  assert.deepEqual(store.getEntries().map((e) => e.text), ['kept']);
});

test('an unreadable wins.json is kept, and an empty list is used when there is no backup', async (t) => {
  const dir = await tempDir(t);
  await fsp.writeFile(path.join(dir, 'wins.json'), '{ this is not json');

  const store = createStore(dir, { now: fixedNow('2026-11-12T18:00:00') });
  const { recovered } = await store.load();

  assert.equal(path.basename(recovered.corruptFile), 'wins.corrupt-2026-11-12T18-00-00.json');
  assert.equal(await fsp.readFile(recovered.corruptFile, 'utf8'), '{ this is not json');
  assert.equal(recovered.backupFile, null);
  assert.deepEqual(store.getEntries(), []);
  assert.deepEqual((await readJson(path.join(dir, 'wins.json'))).entries, []);
});

test('an unreadable wins.json is restored from the newest readable backup', async (t) => {
  const dir = await tempDir(t);
  const backups = path.join(dir, 'backups');
  await fsp.mkdir(backups);
  await fsp.writeFile(
    path.join(backups, 'wins-2026-11-09.json'),
    JSON.stringify({ schemaVersion: 1, entries: [entry('old')] })
  );
  await fsp.writeFile(
    path.join(backups, 'wins-2026-11-10.json'),
    JSON.stringify({ schemaVersion: 1, entries: [entry('good')] })
  );
  await fsp.writeFile(path.join(backups, 'wins-2026-11-11.json'), 'garbage');
  await fsp.writeFile(path.join(dir, 'wins.json'), '');

  const store = createStore(dir);
  const { recovered } = await store.load();

  assert.equal(path.basename(recovered.backupFile), 'wins-2026-11-10.json');
  assert.deepEqual(store.getEntries().map((e) => e.text), ['good']);
  // Written back, so the next start does not depend on the backup again.
  assert.deepEqual((await readJson(path.join(dir, 'wins.json'))).entries.map((e) => e.text), ['good']);
});

test('a file from a newer version is refused and left untouched', async (t) => {
  const dir = await tempDir(t);
  const content = JSON.stringify({ schemaVersion: 2, entries: [], newField: true });
  await fsp.writeFile(path.join(dir, 'wins.json'), content);

  const store = createStore(dir);
  await assert.rejects(store.load(), { code: 'NEWER_SCHEMA' });
  assert.equal(await fsp.readFile(path.join(dir, 'wins.json'), 'utf8'), content);
  assert.deepEqual(await fsp.readdir(dir), ['wins.json']);
});

test('backs up once per day, before the first save, with the previous contents', async (t) => {
  const dir = await tempDir(t);
  let now = new Date('2026-11-12T09:00:00');
  const store = createStore(dir, { now: () => now });
  await store.load();

  await store.addEntries([entry('day1-a')]); // no wins.json yet, nothing to back up
  assert.equal(fs.existsSync(path.join(dir, 'backups')), false);

  now = new Date('2026-11-13T09:00:00');
  await store.addEntries([entry('day2-a')]);
  await store.addEntries([entry('day2-b')]);
  const backup = await readJson(path.join(dir, 'backups', 'wins-2026-11-13.json'));
  assert.deepEqual(backup.entries.map((e) => e.text), ['day1-a']);
});

test(`keeps only the newest ${BACKUPS_KEPT} backups`, async (t) => {
  const dir = await tempDir(t);
  const backups = path.join(dir, 'backups');
  await fsp.mkdir(backups);
  for (let day = 1; day <= 20; day++) {
    const name = `wins-2026-10-${String(day).padStart(2, '0')}.json`;
    await fsp.writeFile(path.join(backups, name), '{}');
  }
  await fsp.writeFile(path.join(backups, 'notes.txt'), 'not a backup');

  const store = createStore(dir, { now: fixedNow('2026-11-12T09:00:00') });
  await store.load();
  await store.addEntries([entry('a')]); // creates wins.json, nothing to back up yet
  await store.addEntries([entry('b')]); // backs up wins.json, then prunes
  const names = (await fsp.readdir(backups)).sort();
  const winsBackups = names.filter((n) => n.startsWith('wins-'));
  assert.equal(winsBackups.length, BACKUPS_KEPT);
  assert.equal(winsBackups.at(-1), 'wins-2026-11-12.json');
  assert.equal(winsBackups[0], 'wins-2026-10-08.json');
  assert.ok(names.includes('notes.txt'), 'other files are left alone');
});

test('a failed save leaves the saved data and memory unchanged', async (t) => {
  const dir = await tempDir(t);
  const store = createStore(dir);
  await store.load();
  await store.addEntries([entry('a')]);

  // Make the temp path a directory so opening it for writing fails.
  await fsp.mkdir(path.join(dir, 'wins.json.tmp'));
  await assert.rejects(store.addEntries([entry('b')]));

  assert.deepEqual(store.getEntries().map((e) => e.text), ['a']);
  assert.deepEqual((await readJson(path.join(dir, 'wins.json'))).entries.map((e) => e.text), ['a']);

  // The queue keeps working after a failure.
  await fsp.rm(path.join(dir, 'wins.json.tmp'), { recursive: true });
  await store.addEntries([entry('c')]);
  assert.deepEqual(store.getEntries().map((e) => e.text), ['a', 'c']);
});

test('settings: defaults when there is no settings.json, and no file is created', async (t) => {
  const dir = await tempDir(t);
  const store = createStore(dir, { platform: 'darwin' });
  await store.loadSettings();
  assert.deepEqual(store.getSettings(), {
    reminderTime: '18:00',
    reminderDays: [1, 2, 3, 4, 5],
    shortcut: 'Control+Alt+W',
    openAtLogin: true,
    loginItemSetUp: false,
    lastPromptedDate: null,
  });
  assert.equal(fs.existsSync(path.join(dir, 'settings.json')), false);
});

test('settings: changes are saved and load again in a new session', async (t) => {
  const dir = await tempDir(t);
  const store = createStore(dir);
  await store.loadSettings();
  await store.updateSettings({ reminderTime: '17:30', reminderDays: [5, 1] });
  await store.updateSettings({ lastPromptedDate: '2026-11-12' });

  const again = createStore(dir);
  await again.loadSettings();
  const s = again.getSettings();
  assert.equal(s.reminderTime, '17:30');
  assert.deepEqual(s.reminderDays, [1, 5]);
  assert.equal(s.lastPromptedDate, '2026-11-12');
  assert.equal(s.shortcut, defaultSettings().shortcut);
  assert.equal(fs.existsSync(path.join(dir, 'settings.json.tmp')), false);
});

test('settings: getSettings returns a copy', async (t) => {
  const store = createStore(await tempDir(t));
  await store.loadSettings();
  store.getSettings().reminderDays.push(6);
  assert.deepEqual(store.getSettings().reminderDays, [1, 2, 3, 4, 5]);
});

test('settings: invalid fields fall back to defaults, unknown fields are kept', async (t) => {
  const dir = await tempDir(t);
  await fsp.writeFile(
    path.join(dir, 'settings.json'),
    JSON.stringify({ reminderTime: '25:00', reminderDays: [1, 9], openAtLogin: false, futureField: 1 })
  );
  const store = createStore(dir);
  await store.loadSettings();
  const s = store.getSettings();
  assert.equal(s.reminderTime, '18:00');
  assert.deepEqual(s.reminderDays, [1, 2, 3, 4, 5]);
  assert.equal(s.openAtLogin, false);
  assert.equal(s.futureField, 1);
});

test('settings: an empty day list (reminder off) is kept', async (t) => {
  const dir = await tempDir(t);
  const store = createStore(dir);
  await store.loadSettings();
  await store.updateSettings({ reminderDays: [] });
  const again = createStore(dir);
  await again.loadSettings();
  assert.deepEqual(again.getSettings().reminderDays, []);
});

test('settings: an unreadable settings.json is moved aside and defaults are used', async (t) => {
  const dir = await tempDir(t);
  await fsp.writeFile(path.join(dir, 'settings.json'), '{ broken');
  const store = createStore(dir, { now: fixedNow('2026-11-12T18:00:00') });
  await store.loadSettings();
  assert.equal(store.getSettings().reminderTime, '18:00');
  assert.equal(
    await fsp.readFile(path.join(dir, 'settings.corrupt-2026-11-12T18-00-00.json'), 'utf8'),
    '{ broken'
  );
});

test('settings and wins saves share one queue and do not touch each other', async (t) => {
  const dir = await tempDir(t);
  const store = createStore(dir);
  await store.load();
  await store.loadSettings();
  await Promise.all([
    store.addEntries([entry('a')]),
    store.updateSettings({ lastPromptedDate: '2026-11-12' }),
    store.addEntries([entry('b')]),
  ]);
  assert.deepEqual((await readJson(path.join(dir, 'wins.json'))).entries.map((e) => e.text), ['a', 'b']);
  assert.equal((await readJson(path.join(dir, 'settings.json'))).lastPromptedDate, '2026-11-12');
});

test('settings: the old default shortcut moves to the new default, a custom one is kept', async (t) => {
  const dir = await tempDir(t);
  const file = path.join(dir, 'settings.json');
  await fsp.writeFile(file, JSON.stringify({ shortcut: 'CommandOrControl+Shift+W' }));
  const mac = createStore(dir, { platform: 'darwin' });
  await mac.loadSettings();
  assert.equal(mac.getSettings().shortcut, 'Control+Alt+W');
  const win = createStore(dir, { platform: 'win32' });
  await win.loadSettings();
  assert.equal(win.getSettings().shortcut, 'Control+Alt+Shift+W');

  await fsp.writeFile(file, JSON.stringify({ shortcut: 'Alt+Shift+K' }));
  const custom = createStore(dir, { platform: 'darwin' });
  await custom.loadSettings();
  assert.equal(custom.getSettings().shortcut, 'Alt+Shift+K');

  await fsp.writeFile(file, JSON.stringify({ shortcut: 'Shift+K' })); // not allowed: Shift only
  const invalid = createStore(dir, { platform: 'darwin' });
  await invalid.loadSettings();
  assert.equal(invalid.getSettings().shortcut, 'Control+Alt+W');
});

test('settings: loginItemSetUp is only true when saved as true', async (t) => {
  const dir = await tempDir(t);
  await fsp.writeFile(path.join(dir, 'settings.json'), JSON.stringify({ loginItemSetUp: 'yes' }));
  const store = createStore(dir);
  await store.loadSettings();
  assert.equal(store.getSettings().loginItemSetUp, false);
  await store.updateSettings({ loginItemSetUp: true });
  const again = createStore(dir);
  await again.loadSettings();
  assert.equal(again.getSettings().loginItemSetUp, true);
});
