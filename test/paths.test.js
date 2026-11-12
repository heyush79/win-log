'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { isInside } = require('../src/lib/paths');

const MAC_DATA = '/Users/sam/Library/Application Support/Win Log';
const WIN_DATA = 'C:\\Users\\Sam\\AppData\\Roaming\\Win Log';

test('the folder itself and everything below it is inside', () => {
  assert.equal(isInside(MAC_DATA, MAC_DATA, 'darwin'), true);
  assert.equal(isInside(MAC_DATA, `${MAC_DATA}/`, 'darwin'), true);
  assert.equal(isInside(MAC_DATA, `${MAC_DATA}/wins.json`, 'darwin'), true);
  assert.equal(isInside(MAC_DATA, `${MAC_DATA}/backups/wins-2026-11-12.json`, 'darwin'), true);
  assert.equal(isInside(WIN_DATA, `${WIN_DATA}\\wins.json`, 'win32'), true);
  assert.equal(isInside(WIN_DATA, `${WIN_DATA}\\backups\\x.json`, 'win32'), true);
  assert.equal(isInside('/data', '/data/a/b/c.txt', 'linux'), true);
});

test('parents, siblings and look-alike names are outside', () => {
  assert.equal(isInside(MAC_DATA, '/Users/sam/Library/Application Support', 'darwin'), false);
  assert.equal(isInside(MAC_DATA, '/Users/sam/Documents/wins.json', 'darwin'), false);
  assert.equal(isInside(MAC_DATA, `${MAC_DATA} copy/wins.json`, 'darwin'), false);
  assert.equal(isInside(MAC_DATA, `${MAC_DATA}2`, 'darwin'), false);
  assert.equal(isInside(WIN_DATA, 'C:\\Users\\Sam\\Documents\\wins.json', 'win32'), false);
  assert.equal(isInside(WIN_DATA, `${WIN_DATA} Backup\\wins.json`, 'win32'), false);
});

test('a path that climbs out with ".." is outside; one that only looks like it is inside', () => {
  assert.equal(isInside(MAC_DATA, `${MAC_DATA}/../Other/wins.json`, 'darwin'), false);
  assert.equal(isInside(MAC_DATA, `${MAC_DATA}/backups/../wins.json`, 'darwin'), true);
  assert.equal(isInside('/data', '/data/..hidden/file', 'linux'), true, 'a folder whose name starts with two dots');
  assert.equal(isInside('/data', '/data/...', 'linux'), true);
  assert.equal(isInside(WIN_DATA, `${WIN_DATA}\\..\\Other\\wins.json`, 'win32'), false);
});

test('letter case is ignored on Mac and Windows, and kept on Linux', () => {
  assert.equal(isInside(MAC_DATA, '/users/SAM/library/application support/WIN LOG/Wins.JSON', 'darwin'), true);
  assert.equal(isInside(WIN_DATA, 'c:\\users\\sam\\appdata\\roaming\\win log\\WINS.JSON', 'win32'), true);
  assert.equal(isInside('/data/Win Log', '/data/win log/wins.json', 'linux'), false);
});

test('Windows: other drives, network shares and both kinds of slash', () => {
  assert.equal(isInside(WIN_DATA, 'D:\\Users\\Sam\\AppData\\Roaming\\Win Log\\wins.json', 'win32'), false);
  assert.equal(isInside(WIN_DATA, '\\\\server\\share\\Win Log\\wins.json', 'win32'), false);
  assert.equal(isInside('\\\\server\\share\\Win Log', '\\\\server\\share\\Win Log\\wins.json', 'win32'), true);
  assert.equal(isInside('\\\\server\\share\\Win Log', '\\\\server\\other\\Win Log\\wins.json', 'win32'), false);
  assert.equal(isInside(WIN_DATA, 'C:/Users/Sam/AppData/Roaming/Win Log/wins.json', 'win32'), true);
});
