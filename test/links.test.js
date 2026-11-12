'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { LINKS, REPO_URL, linkUrl, isAllowedUrl } = require('../src/lib/links');

test('there are exactly three links, all https, all on GitHub', () => {
  assert.deepEqual(Object.keys(LINKS).sort(), ['issues', 'releases', 'website']);
  for (const url of Object.values(LINKS)) {
    const { protocol, hostname, username, password, port } = new URL(url);
    assert.equal(protocol, 'https:', url);
    assert.ok(hostname === 'github.com' || hostname.endsWith('.github.io'), url);
    assert.equal(username + password + port, '', url);
  }
  assert.ok(LINKS.releases.startsWith(`${REPO_URL}/releases`));
  assert.ok(LINKS.issues.startsWith(`${REPO_URL}/issues`));
});

test('linkUrl only knows the three names', () => {
  assert.equal(linkUrl('releases'), LINKS.releases);
  assert.equal(linkUrl('issues'), LINKS.issues);
  assert.equal(linkUrl('website'), LINKS.website);
  for (const bad of ['', 'Releases', 'https://example.com', 'constructor', '__proto__', 'toString', 'hasOwnProperty', null, undefined, 1, {}, ['releases']]) {
    assert.equal(linkUrl(bad), null, String(bad));
  }
});

test('isAllowedUrl accepts the exact addresses and nothing that only looks like them', () => {
  for (const url of Object.values(LINKS)) assert.equal(isAllowedUrl(url), true, url);
  const lookalikes = [
    `${LINKS.releases}/`,
    `${LINKS.releases}?x=1`,
    LINKS.releases.replace('https:', 'http:'),
    LINKS.releases.replace('github.com', 'github.com.evil.example'),
    `${REPO_URL}`,
    'https://github.com/',
    'file:///etc/passwd',
    'javascript:alert(1)',
    '',
    null,
    undefined,
    LINKS,
  ];
  for (const url of lookalikes) assert.equal(isAllowedUrl(url), false, String(url));
});

test('the list of links cannot be changed while the app runs', () => {
  assert.ok(Object.isFrozen(LINKS));
});
