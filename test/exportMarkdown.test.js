'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  PRESETS,
  presetRange,
  isValidRange,
  parseExportOptions,
  winsInRange,
  formatDate,
  tagTitle,
  escapeMarkdown,
  buildExport,
  exportFileName,
} = require('../src/lib/exportMarkdown');

let n = 0;
const win = (date, text, tag = null) => ({
  id: `id-${++n}`,
  date,
  text,
  tag,
  createdAt: `${date}T10:00:00.${String(n).padStart(3, '0')}Z`,
});
const NOV = { from: '2026-11-01', to: '2026-11-30' };

// ----- buildExport -----

test('empty range: no text and a count of 0', () => {
  const wins = [win('2026-10-31', 'Before'), win('2026-12-01', 'After')];
  assert.deepEqual(buildExport(wins, NOV), { text: '', count: 0 });
  assert.deepEqual(buildExport([], NOV), { text: '', count: 0 });
  assert.deepEqual(buildExport(wins, { ...NOV, format: 'text', includeDates: true }), { text: '', count: 0 });
});

test('markdown: a heading per tag A to Z, untagged wins last under "Other"', () => {
  const wins = [
    win('2026-11-03', 'Reviewed 4 pull requests #review', 'review'),
    win('2026-11-02', 'Wrote the onboarding guide'),
    win('2026-11-05', 'Fixed the flaky login test #bugfix', 'bugfix'),
    win('2026-11-04', 'Helped Priya debug the cache #helped-someone', 'helped-someone'),
    win('2026-11-01', 'Fixed a crash on empty lists #bugfix', 'bugfix'),
  ];
  const { text, count } = buildExport(wins, NOV);
  assert.equal(count, 5);
  assert.equal(
    text,
    [
      '## Bugfix',
      '',
      '- Fixed a crash on empty lists',
      '- Fixed the flaky login test',
      '',
      '## Helped someone',
      '',
      '- Helped Priya debug the cache',
      '',
      '## Review',
      '',
      '- Reviewed 4 pull requests',
      '',
      '## Other',
      '',
      '- Wrote the onboarding guide',
    ].join('\n')
  );
});

test('untagged only: plain bullets, no "Other" heading', () => {
  const wins = [win('2026-11-02', 'Second'), win('2026-11-01', 'First')];
  assert.equal(buildExport(wins, NOV).text, '- First\n- Second');
  assert.equal(buildExport(wins, { ...NOV, format: 'text' }).text, '- First\n- Second');
});

test('tagged only: no "Other" heading', () => {
  const { text } = buildExport([win('2026-11-01', 'Did it #work', 'work')], NOV);
  assert.equal(text, '## Work\n\n- Did it');
});

test('wins inside a group are in date order, oldest first, then in the order added', () => {
  const a = win('2026-11-10', 'Later day');
  const b = win('2026-11-02', 'Same day, added first');
  const c = win('2026-11-02', 'Same day, added second');
  assert.equal(buildExport([a, c, b], NOV).text, '- Same day, added first\n- Same day, added second\n- Later day');
});

test('plain text: headings and bullets without Markdown marks or escapes', () => {
  const wins = [
    win('2026-11-01', 'Fixed *the* [bug] in snake_case #bugfix', 'bugfix'),
    win('2026-11-02', '# not a heading'),
  ];
  assert.equal(
    buildExport(wins, { ...NOV, format: 'text' }).text,
    ['Bugfix', '- Fixed *the* [bug] in snake_case', '', 'Other', '- # not a heading'].join('\n')
  );
});

test('include dates: the date is added at the end of each bullet', () => {
  const wins = [win('2026-11-03', 'Shipped it #release', 'release'), win('2026-11-12', 'No tag')];
  assert.equal(
    buildExport(wins, { ...NOV, includeDates: true }).text,
    '## Release\n\n- Shipped it (3 Nov 2026)\n\n## Other\n\n- No tag (12 Nov 2026)'
  );
  assert.equal(
    buildExport(wins, { ...NOV, format: 'text', includeDates: true }).text,
    'Release\n- Shipped it (3 Nov 2026)\n\nOther\n- No tag (12 Nov 2026)'
  );
  assert.ok(!buildExport(wins, NOV).text.includes('2026'), 'dates are off by default');
});

test('special Markdown characters in the text show as typed', () => {
  const cases = [
    ['Made it *bold* and _quiet_', '- Made it \\*bold\\* and \\_quiet\\_'],
    ['Used `code` here', '- Used \\`code\\` here'],
    ['See [the doc](https://example.com)', '- See \\[the doc\\](https://example.com)'],
    ['![image](x.png)', '- !\\[image\\](x.png)'],
    ['Removed <script>alert(1)</script> tags', '- Removed \\<script>alert(1)\\</script> tags'],
    ['Path C:\\temp\\new', '- Path C:\\\\temp\\\\new'],
    ['5 < 10 and 10 > 5', '- 5 < 10 and 10 > 5'],
    ['Fish &amp; chips &copy; R&D', '- Fish \\&amp; chips \\&copy; R&D'],
    ['~~old~~ new', '- \\~\\~old\\~\\~ new'],
    ['# Looks like a heading', '- \\# Looks like a heading'],
    ['> Looks like a quote', '- \\> Looks like a quote'],
    ['- Looks like a nested bullet', '- \\- Looks like a nested bullet'],
    ['+ Also a bullet', '- \\+ Also a bullet'],
    ['1. Looks like a numbered list', '- 1\\. Looks like a numbered list'],
    ['2) Also numbered', '- 2\\) Also numbered'],
    ['-5% error rate, 3.5x faster', '- -5% error rate, 3.5x faster'],
    ['[ ] Looks like a checkbox', '- \\[ \\] Looks like a checkbox'],
    ['Costs $5 | saves 10%', '- Costs $5 | saves 10%'],
  ];
  for (const [typed, expected] of cases) {
    assert.equal(buildExport([win('2026-11-01', typed)], NOV).text, expected, typed);
  }
});

test('line breaks and runs of spaces inside a win become single spaces', () => {
  const { text } = buildExport([win('2026-11-01', 'First line\nsecond   line\r\n\tthird')], NOV);
  assert.equal(text, '- First line second line third');
});

test('very long text stays whole, on one line', () => {
  const long = `Start ${'word '.repeat(398)}end`; // about 2000 characters
  const { text } = buildExport([win('2026-11-01', long)], NOV);
  assert.equal(text, `- ${long.replace(/\s+/g, ' ')}`);
  assert.equal(text.split('\n').length, 1);
  const many = Array.from({ length: 500 }, (_, i) => win('2026-11-01', `Win number ${i}`));
  assert.equal(buildExport(many, NOV).count, 500);
});

test('range across a year end includes both sides and both end days', () => {
  const wins = [
    win('2026-12-14', 'Day before the range'),
    win('2026-12-15', 'First day'),
    win('2026-12-31', 'New Year’s Eve'),
    win('2027-01-01', 'New Year’s Day'),
    win('2027-01-15', 'Last day'),
    win('2027-01-16', 'Day after the range'),
  ];
  const { text, count } = buildExport(wins, { from: '2026-12-15', to: '2027-01-15', includeDates: true });
  assert.equal(count, 4);
  assert.equal(
    text,
    '- First day (15 Dec 2026)\n- New Year’s Eve (31 Dec 2026)\n- New Year’s Day (1 Jan 2027)\n- Last day (15 Jan 2027)'
  );
});

test('a single-day range works', () => {
  const wins = [win('2026-11-12', 'Today'), win('2026-11-11', 'Yesterday')];
  assert.equal(buildExport(wins, { from: '2026-11-12', to: '2026-11-12' }).text, '- Today');
});

test('tags that read the same share one heading; a tag called "other" joins "Other"', () => {
  const wins = [
    win('2026-11-01', 'A #helped-someone', 'helped-someone'),
    win('2026-11-02', 'B #helped_someone', 'helped_someone'),
    win('2026-11-03', 'C #other', 'other'),
    win('2026-11-04', 'D'),
  ];
  assert.equal(buildExport(wins, NOV).text, '## Helped someone\n\n- A\n- B\n\n## Other\n\n- C\n- D');
});

test('the tag is taken out of the bullet, but later #words stay', () => {
  const wins = [
    win('2026-11-01', 'Fixed login #bugfix #urgent', 'bugfix'),
    win('2026-11-02', 'Ran the #onboarding session', 'onboarding'),
    win('2026-11-03', '#docs: wrote the guide', 'docs'),
    win('2026-11-04', '#solo', 'solo'),
  ];
  const { text } = buildExport(wins, { ...NOV, format: 'text' });
  assert.equal(
    text,
    ['Bugfix', '- Fixed login #urgent', '', 'Docs', '- wrote the guide', '', 'Onboarding', '- Ran the onboarding session', '', 'Solo', '- solo'].join('\n')
  );
});

test('the wins passed in are not changed or reordered', () => {
  const wins = [win('2026-11-02', 'B'), win('2026-11-01', 'A')];
  const copy = JSON.parse(JSON.stringify(wins));
  buildExport(wins, NOV);
  assert.deepEqual(wins, copy);
});

// ----- Helpers -----

test('escapeMarkdown leaves ordinary text alone', () => {
  const plain = 'Cut page load time from 3.2s to 1.1s (65% faster), saved $500/month!';
  assert.equal(escapeMarkdown(plain), plain);
});

test('tagTitle and formatDate', () => {
  assert.equal(tagTitle('bugfix'), 'Bugfix');
  assert.equal(tagTitle('helped-someone'), 'Helped someone');
  assert.equal(tagTitle('code_review-2'), 'Code review 2');
  assert.equal(tagTitle('élan'), 'Élan');
  assert.equal(formatDate('2026-11-03'), '3 Nov 2026');
  assert.equal(formatDate('2027-01-31'), '31 Jan 2027');
});

test('winsInRange includes both end days', () => {
  const wins = [win('2026-11-01', 'a'), win('2026-11-15', 'b'), win('2026-11-30', 'c'), win('2026-12-01', 'd')];
  assert.deepEqual(winsInRange(wins, '2026-11-01', '2026-11-30').map((w) => w.text), ['a', 'b', 'c']);
});

test('exportFileName names the range and the format', () => {
  assert.equal(exportFileName({ from: '2026-08-13', to: '2026-11-12', format: 'markdown' }), 'wins-2026-08-13-to-2026-11-12.md');
  assert.equal(exportFileName({ from: '2026-01-01', to: '2026-12-31', format: 'text' }), 'wins-2026-01-01-to-2026-12-31.txt');
});

// ----- Range presets -----

test('presets on an ordinary day (12 Nov 2026)', () => {
  const today = '2026-11-12';
  assert.deepEqual(presetRange('this-month', today), { from: '2026-11-01', to: '2026-11-30' });
  assert.deepEqual(presetRange('last-month', today), { from: '2026-10-01', to: '2026-10-31' });
  assert.deepEqual(presetRange('last-3-months', today), { from: '2026-08-13', to: '2026-11-12' });
  assert.deepEqual(presetRange('last-6-months', today), { from: '2026-05-13', to: '2026-11-12' });
  assert.deepEqual(presetRange('this-year', today), { from: '2026-01-01', to: '2026-12-31' });
  assert.equal(presetRange('custom', today), null);
  assert.equal(presetRange('nonsense', today), null);
});

test('presets across a year end (15 Jan 2027)', () => {
  const today = '2027-01-15';
  assert.deepEqual(presetRange('this-month', today), { from: '2027-01-01', to: '2027-01-31' });
  assert.deepEqual(presetRange('last-month', today), { from: '2026-12-01', to: '2026-12-31' });
  assert.deepEqual(presetRange('last-3-months', today), { from: '2026-10-16', to: '2027-01-15' });
  assert.deepEqual(presetRange('last-6-months', today), { from: '2026-07-16', to: '2027-01-15' });
  assert.deepEqual(presetRange('this-year', today), { from: '2027-01-01', to: '2027-12-31' });
});

test('presets at month ends and in leap years', () => {
  assert.deepEqual(presetRange('last-month', '2026-03-31'), { from: '2026-02-01', to: '2026-02-28' });
  assert.deepEqual(presetRange('last-month', '2024-03-31'), { from: '2024-02-01', to: '2024-02-29' });
  assert.deepEqual(presetRange('this-month', '2024-02-10'), { from: '2024-02-01', to: '2024-02-29' });
  // 31 May minus 3 months is 28 Feb, so the range starts on 1 Mar: three whole months.
  assert.deepEqual(presetRange('last-3-months', '2026-05-31'), { from: '2026-03-01', to: '2026-05-31' });
  assert.deepEqual(presetRange('last-6-months', '2026-08-31'), { from: '2026-03-01', to: '2026-08-31' });
});

test('every preset except custom gives a valid range', () => {
  for (const preset of PRESETS.filter((p) => p !== 'custom')) {
    for (const today of ['2026-01-01', '2026-03-31', '2026-12-31', '2024-02-29']) {
      const { from, to } = presetRange(preset, today);
      assert.equal(isValidRange(from, to), true, `${preset} on ${today}: ${from} to ${to}`);
    }
  }
});

test('isValidRange needs two real dates in order', () => {
  assert.equal(isValidRange('2026-11-01', '2026-11-30'), true);
  assert.equal(isValidRange('2026-11-12', '2026-11-12'), true);
  assert.equal(isValidRange('2026-11-30', '2026-11-01'), false);
  assert.equal(isValidRange('2026-02-30', '2026-03-01'), false);
  assert.equal(isValidRange('', '2026-03-01'), false);
  assert.equal(isValidRange(undefined, null), false);
});

// ----- Options from a page -----

test('parseExportOptions: a preset works out its own dates and ignores dates that were sent', () => {
  const options = parseExportOptions(
    { preset: 'this-month', from: '1999-01-01', to: '1999-01-02', format: 'markdown', includeDates: false, extra: 'x' },
    '2026-11-12'
  );
  assert.deepEqual(options, { preset: 'this-month', from: '2026-11-01', to: '2026-11-30', format: 'markdown', includeDates: false });
});

test('parseExportOptions: custom uses the dates that were sent', () => {
  const options = parseExportOptions(
    { preset: 'custom', from: '2026-12-15', to: '2027-01-15', format: 'text', includeDates: true },
    '2026-11-12'
  );
  assert.deepEqual(options, { preset: 'custom', from: '2026-12-15', to: '2027-01-15', format: 'text', includeDates: true });
});

test('parseExportOptions refuses anything invalid', () => {
  const good = { preset: 'custom', from: '2026-11-01', to: '2026-11-30', format: 'markdown', includeDates: false };
  const today = '2026-11-12';
  assert.throws(() => parseExportOptions(null, today));
  assert.throws(() => parseExportOptions('this-month', today));
  assert.throws(() => parseExportOptions([], today));
  assert.throws(() => parseExportOptions({ ...good, preset: 'all-time' }, today));
  assert.throws(() => parseExportOptions({ ...good, preset: 'toString' }, today));
  assert.throws(() => parseExportOptions({ ...good, format: 'html' }, today));
  assert.throws(() => parseExportOptions({ ...good, includeDates: 'yes' }, today));
  assert.throws(() => parseExportOptions({ ...good, from: '2026-12-01' }, today), { code: 'INVALID_RANGE' });
  assert.throws(() => parseExportOptions({ ...good, to: '2026-11-31' }, today), { code: 'INVALID_RANGE' });
  assert.throws(() => parseExportOptions({ ...good, from: '' }, today), { code: 'INVALID_RANGE' });
  assert.throws(() => parseExportOptions({ ...good, from: 20261101 }, today), { code: 'INVALID_RANGE' });
});
