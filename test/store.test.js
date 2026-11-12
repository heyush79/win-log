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
    welcomeShown: false,
    backupFolder: null,
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

const fullEntry = (id, text, tag = null) => ({
  id,
  date: '2026-11-10',
  text,
  tag,
  createdAt: '2026-11-10T09:00:00.000Z',
  updatedAt: '2026-11-10T09:00:00.000Z',
});

test('editEntry saves the new text, tag and updatedAt, and survives a restart', async (t) => {
  const dir = await tempDir(t);
  const store = createStore(dir, { now: fixedNow('2026-11-12T15:30:00.000Z') });
  await store.load();
  await store.addEntries([fullEntry('a', 'First #bugfix', 'bugfix'), fullEntry('b', 'Second')]);

  const edited = await store.editEntry('a', 'First, improved #review');
  assert.equal(edited.text, 'First, improved #review');
  assert.equal(edited.tag, 'review');
  assert.equal(edited.updatedAt, '2026-11-12T15:30:00.000Z');
  assert.equal(edited.createdAt, '2026-11-10T09:00:00.000Z');

  const again = createStore(dir);
  await again.load();
  assert.deepEqual(again.getEntries(), [edited, fullEntry('b', 'Second')]);
  assert.equal(fs.existsSync(path.join(dir, 'wins.json.tmp')), false);
});

test('editEntry rejects a missing win or invalid text and leaves the file alone', async (t) => {
  const dir = await tempDir(t);
  const store = createStore(dir);
  await store.load();
  await store.addEntries([fullEntry('a', 'First')]);
  const before = await fsp.readFile(path.join(dir, 'wins.json'), 'utf8');

  await assert.rejects(store.editEntry('nope', 'x'), { code: 'NOT_FOUND' });
  await assert.rejects(store.editEntry('a', '   '), { code: 'INVALID_TEXT' });
  await assert.rejects(store.editEntry('a', 'two\nlines'), { code: 'INVALID_TEXT' });

  assert.equal(await fsp.readFile(path.join(dir, 'wins.json'), 'utf8'), before);
  assert.deepEqual(store.getEntries(), [fullEntry('a', 'First')]);
  // The queue still works after the rejections.
  await store.editEntry('a', 'First again');
  assert.equal(store.getEntries()[0].text, 'First again');
});

test('editEntry with unchanged text does not write the file', async (t) => {
  const dir = await tempDir(t);
  const store = createStore(dir);
  await store.load();
  await store.addEntries([fullEntry('a', 'Same')]);
  const file = path.join(dir, 'wins.json');
  const before = (await fsp.stat(file)).mtimeMs;
  await new Promise((resolve) => setTimeout(resolve, 20));
  const result = await store.editEntry('a', '  Same ');
  assert.equal(result.updatedAt, '2026-11-10T09:00:00.000Z');
  assert.equal((await fsp.stat(file)).mtimeMs, before);
});

test('deleteEntry removes one win from disk and memory; a missing win is a no-op', async (t) => {
  const dir = await tempDir(t);
  const store = createStore(dir);
  await store.load();
  await store.addEntries([fullEntry('a', 'First'), fullEntry('b', 'Second'), fullEntry('c', 'Third')]);

  const removed = await store.deleteEntry('b');
  assert.equal(removed.text, 'Second');
  assert.deepEqual(store.getEntries().map((e) => e.id), ['a', 'c']);
  assert.deepEqual((await readJson(path.join(dir, 'wins.json'))).entries.map((e) => e.id), ['a', 'c']);

  assert.equal(await store.deleteEntry('b'), null);
  assert.deepEqual(store.getEntries().map((e) => e.id), ['a', 'c']);
});

test('the first edit or delete of the day backs up the file as it was', async (t) => {
  const dir = await tempDir(t);
  const day1 = createStore(dir, { now: fixedNow('2026-11-10T10:00:00') });
  await day1.load();
  await day1.addEntries([fullEntry('a', 'First'), fullEntry('b', 'Second')]);

  const day2 = createStore(dir, { now: fixedNow('2026-11-11T10:00:00') });
  await day2.load();
  await day2.deleteEntry('a');
  const backup = await readJson(path.join(dir, 'backups', 'wins-2026-11-11.json'));
  assert.deepEqual(backup.entries.map((e) => e.id), ['a', 'b'], 'the deleted win is still in the backup');
});

test('a failed edit or delete leaves the saved data and memory unchanged', async (t) => {
  const dir = await tempDir(t);
  const store = createStore(dir);
  await store.load();
  await store.addEntries([fullEntry('a', 'First')]);

  await fsp.mkdir(path.join(dir, 'wins.json.tmp')); // makes the next write fail
  await assert.rejects(store.editEntry('a', 'Changed'));
  await assert.rejects(store.deleteEntry('a'));
  assert.deepEqual(store.getEntries(), [fullEntry('a', 'First')]);
  assert.deepEqual((await readJson(path.join(dir, 'wins.json'))).entries, [fullEntry('a', 'First')]);
});

test('adds, edits and deletes started together are applied in order', async (t) => {
  const dir = await tempDir(t);
  const store = createStore(dir);
  await store.load();
  await Promise.all([
    store.addEntries([fullEntry('a', 'First')]),
    store.addEntries([fullEntry('b', 'Second')]),
    store.editEntry('a', 'First edited'),
    store.deleteEntry('b'),
    store.addEntries([fullEntry('c', 'Third')]),
  ]);
  assert.deepEqual((await readJson(path.join(dir, 'wins.json'))).entries.map((e) => e.text), ['First edited', 'Third']);
});

// ----- Import -----

test('importEntries adds new wins only and never changes existing ones', async (t) => {
  const dir = await tempDir(t);
  const store = createStore(dir);
  await store.load();
  await store.addEntries([fullEntry('a', 'Mine'), fullEntry('b', 'Also mine')]);

  const plan = await store.importEntries([
    fullEntry('a', 'DIFFERENT IN THE BACKUP'),
    fullEntry('b', 'Also mine'),
    fullEntry('c', 'From the backup'),
  ]);
  assert.deepEqual(plan.toAdd.map((e) => e.id), ['c']);
  assert.equal(plan.same, 1);
  assert.equal(plan.different, 1);

  const again = createStore(dir);
  await again.load();
  assert.deepEqual(again.getEntries(), [fullEntry('a', 'Mine'), fullEntry('b', 'Also mine'), fullEntry('c', 'From the backup')]);
});

test('importEntries with nothing new does not write the file', async (t) => {
  const dir = await tempDir(t);
  const store = createStore(dir);
  await store.load();
  await store.addEntries([fullEntry('a', 'Mine')]);
  const file = path.join(dir, 'wins.json');
  const before = await fsp.readFile(file, 'utf8');
  const mtime = (await fsp.stat(file)).mtimeMs;
  await new Promise((resolve) => setTimeout(resolve, 20));
  const plan = await store.importEntries([fullEntry('a', 'Other text')]);
  assert.deepEqual(plan.toAdd, []);
  assert.equal(await fsp.readFile(file, 'utf8'), before);
  assert.equal((await fsp.stat(file)).mtimeMs, mtime);
});

test('an import is compared with the wins as they are when it runs, not when it was planned', async (t) => {
  const dir = await tempDir(t);
  const store = createStore(dir);
  await store.load();
  // The same win arrives through "add" just before the import that also contains it.
  const [, plan] = await Promise.all([
    store.addEntries([fullEntry('x', 'Added first')]),
    store.importEntries([fullEntry('x', 'From the backup'), fullEntry('y', 'New')]),
  ]);
  assert.deepEqual(plan.toAdd.map((e) => e.id), ['y']);
  assert.deepEqual(store.getEntries().map((e) => e.text), ['Added first', 'New']);
});

test('the first import of the day backs up the file as it was', async (t) => {
  const dir = await tempDir(t);
  const day1 = createStore(dir, { now: fixedNow('2026-11-10T10:00:00') });
  await day1.load();
  await day1.addEntries([fullEntry('a', 'Mine')]);
  const day2 = createStore(dir, { now: fixedNow('2026-11-11T10:00:00') });
  await day2.load();
  await day2.importEntries([fullEntry('b', 'Imported')]);
  const before = await readJson(path.join(dir, 'backups', 'wins-2026-11-11.json'));
  assert.deepEqual(before.entries.map((e) => e.id), ['a']);
});

test('backupText is exactly what wins.json holds after a save', async (t) => {
  const dir = await tempDir(t);
  const store = createStore(dir);
  await store.load();
  await store.addEntries([fullEntry('a', 'Mine')]);
  assert.equal(store.backupText(), await fsp.readFile(path.join(dir, 'wins.json'), 'utf8'));
});

// ----- Settings added in 1.0 -----

test('settings: welcomeShown and backupFolder are validated', async (t) => {
  const dir = await tempDir(t);
  const file = path.join(dir, 'settings.json');
  await fsp.writeFile(file, JSON.stringify({ welcomeShown: 'yes', backupFolder: 'relative/path' }));
  const store = createStore(dir);
  await store.loadSettings();
  assert.equal(store.getSettings().welcomeShown, false);
  assert.equal(store.getSettings().backupFolder, null);

  await fsp.writeFile(file, JSON.stringify({ welcomeShown: true, backupFolder: dir }));
  const good = createStore(dir);
  await good.loadSettings();
  assert.equal(good.getSettings().welcomeShown, true);
  assert.equal(good.getSettings().backupFolder, dir);

  for (const bad of [5, '', {}, ['x'], 'x'.repeat(5000)]) {
    await fsp.writeFile(file, JSON.stringify({ backupFolder: bad }));
    const store2 = createStore(dir);
    await store2.loadSettings();
    assert.equal(store2.getSettings().backupFolder, null, JSON.stringify(bad).slice(0, 30));
  }
});

// ----- Extra backups in a folder the user chose -----

async function storeWithBackupFolder(t, options = {}) {
  const dir = await tempDir(t);
  const folder = await tempDir(t);
  const store = createStore(dir, { hostname: 'Test-Mac.local', now: fixedNow('2026-11-12T10:00:00'), ...options });
  await store.load();
  await store.loadSettings();
  return { dir, folder, store };
}

test('backup folder: choosing it saves a first copy named after this computer', async (t) => {
  const { dir, folder, store } = await storeWithBackupFolder(t);
  await store.addEntries([fullEntry('a', 'Mine')]);
  const status = await store.setBackupFolder(folder);
  assert.equal(status.folder, folder);
  assert.equal(status.error, null);
  assert.ok(status.savedAt instanceof Date);
  assert.deepEqual(await fsp.readdir(folder), ['win-log-backup-Test-Mac-2026-11-12.json']);
  assert.equal(
    await fsp.readFile(path.join(folder, 'win-log-backup-Test-Mac-2026-11-12.json'), 'utf8'),
    await fsp.readFile(path.join(dir, 'wins.json'), 'utf8')
  );
  const again = createStore(dir);
  await again.loadSettings();
  assert.equal(again.getSettings().backupFolder, folder, 'the choice is saved');
});

test('backup folder: every change updates today\'s copy', async (t) => {
  const { dir, folder, store } = await storeWithBackupFolder(t);
  await store.setBackupFolder(folder);
  await store.addEntries([fullEntry('a', 'First')]);
  await store.editEntry('a', 'First, edited');
  await store.addEntries([fullEntry('b', 'Second')]);
  await store.deleteEntry('b');
  await store.flush();
  const copy = await readJson(path.join(folder, 'win-log-backup-Test-Mac-2026-11-12.json'));
  assert.deepEqual(copy.entries.map((e) => e.text), ['First, edited']);
  assert.deepEqual(copy, await readJson(path.join(dir, 'wins.json')));
  assert.deepEqual(await fsp.readdir(folder), ['win-log-backup-Test-Mac-2026-11-12.json'], 'no temp files left');
});

test('backup folder: only the newest 14 copies from this computer are kept; nothing else is touched', async (t) => {
  const { folder, store } = await storeWithBackupFolder(t);
  const keep = ['notes.txt', 'win-log-backup-Old-Laptop-2020-01-01.json', 'win-log-backup-2020-01-01.json', 'win-log-backup-Test-Mac-2-2020-01-01.json'];
  for (const name of keep) await fsp.writeFile(path.join(folder, name), 'not ours');
  for (let day = 1; day <= 20; day++) {
    await fsp.writeFile(path.join(folder, `win-log-backup-Test-Mac-2026-10-${String(day).padStart(2, '0')}.json`), '{}');
  }
  await store.setBackupFolder(folder);
  const names = await fsp.readdir(folder);
  const mine = names.filter((n) => n.startsWith('win-log-backup-Test-Mac-2026')).sort();
  assert.equal(mine.length, BACKUPS_KEPT);
  assert.equal(mine[0], 'win-log-backup-Test-Mac-2026-10-08.json');
  assert.equal(mine[mine.length - 1], 'win-log-backup-Test-Mac-2026-11-12.json');
  for (const name of keep) assert.equal(await fsp.readFile(path.join(folder, name), 'utf8'), 'not ours', name);
});

test('backup folder: a missing folder never stops a win from being saved', async (t) => {
  const { dir, folder, store } = await storeWithBackupFolder(t);
  await store.setBackupFolder(folder);
  await fsp.rm(folder, { recursive: true });
  await store.addEntries([fullEntry('a', 'Still saved')]);
  await store.flush();
  assert.deepEqual((await readJson(path.join(dir, 'wins.json'))).entries.map((e) => e.text), ['Still saved']);
  const status = store.getBackupFolderStatus();
  assert.equal(status.error, 'ENOENT');
  assert.equal(fs.existsSync(folder), false, 'the missing folder is not created again');
  // When the folder is back, the next change is copied again.
  await fsp.mkdir(folder);
  await store.addEntries([fullEntry('b', 'Later')]);
  await store.flush();
  assert.equal(store.getBackupFolderStatus().error, null);
  assert.equal((await fsp.readdir(folder)).length, 1);
});

test('backup folder: only an existing folder can be chosen', async (t) => {
  const { dir, folder, store } = await storeWithBackupFolder(t);
  const file = path.join(folder, 'a-file.txt');
  await fsp.writeFile(file, 'x');
  for (const bad of [file, path.join(folder, 'missing'), 'relative/folder', '', 42, undefined]) {
    await assert.rejects(store.setBackupFolder(bad), { code: 'NOT_A_FOLDER' }, String(bad));
  }
  assert.equal(store.getSettings().backupFolder, null);
  assert.equal(fs.existsSync(path.join(dir, 'settings.json')), false, 'nothing was saved');
});

test('backup folder: turning it off stops the copies and keeps the files', async (t) => {
  const { folder, store } = await storeWithBackupFolder(t);
  await store.setBackupFolder(folder);
  const status = await store.setBackupFolder(null);
  assert.deepEqual(status, { folder: null, savedAt: null, error: null });
  await store.addEntries([fullEntry('a', 'Not copied')]);
  await store.flush();
  const copy = await fsp.readFile(path.join(folder, 'win-log-backup-Test-Mac-2026-11-12.json'), 'utf8');
  assert.ok(!copy.includes('Not copied'));
});

test('backup folder: at startup a missing or outdated copy is caught up, an identical one is left alone', async (t) => {
  const dir = await tempDir(t);
  const folder = await tempDir(t);
  const day1 = createStore(dir, { hostname: 'Test-Mac', now: fixedNow('2026-11-10T10:00:00') });
  await day1.load();
  await day1.loadSettings();
  await day1.setBackupFolder(folder);
  await day1.addEntries([fullEntry('a', 'Mine')]);
  await day1.flush();
  assert.deepEqual(await fsp.readdir(folder), ['win-log-backup-Test-Mac-2026-11-10.json']);

  // Next day, nothing changed: no new file, so quiet days do not push older backups out.
  const day2 = createStore(dir, { hostname: 'Test-Mac', now: fixedNow('2026-11-11T10:00:00') });
  await day2.load();
  await day2.loadSettings();
  await day2.syncBackupFolder();
  assert.deepEqual(await fsp.readdir(folder), ['win-log-backup-Test-Mac-2026-11-10.json']);

  // The copy went missing (or a copy failed earlier): the next start writes it again.
  await fsp.rm(path.join(folder, 'win-log-backup-Test-Mac-2026-11-10.json'));
  const day3 = createStore(dir, { hostname: 'Test-Mac', now: fixedNow('2026-11-12T10:00:00') });
  await day3.load();
  await day3.loadSettings();
  await day3.syncBackupFolder();
  assert.deepEqual(await fsp.readdir(folder), ['win-log-backup-Test-Mac-2026-11-12.json']);
  assert.deepEqual((await readJson(path.join(folder, 'win-log-backup-Test-Mac-2026-11-12.json'))).entries.map((e) => e.id), ['a']);
});

test('backup folder: syncBackupFolder does nothing when no folder is set, and never rejects', async (t) => {
  const { folder, store } = await storeWithBackupFolder(t);
  await store.syncBackupFolder();
  await store.setBackupFolder(folder);
  await fsp.rm(folder, { recursive: true });
  await store.syncBackupFolder(); // folder gone: must not throw
  assert.equal(store.getBackupFolderStatus().error, 'ENOENT');
});
