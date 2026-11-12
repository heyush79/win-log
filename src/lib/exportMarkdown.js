'use strict';

// Builds the text of an export: wins in a date range as bullets grouped by tag,
// either as Markdown or as plain text (for HR tools that do not accept Markdown).
// Pure: no files, no clipboard, no Electron.

const { isValidDate, addDays, addMonths, monthStart, monthEnd } = require('./dates');
const { textWithoutTag } = require('./tags');

const PRESETS = ['this-month', 'last-month', 'last-3-months', 'last-6-months', 'this-year', 'custom'];
const FORMATS = ['markdown', 'text'];
const OTHER = 'Other'; // heading for wins without a tag
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * The date range of a preset, given today's local date.
 * "Last 3 months" ends today and starts the day after the same date three months ago,
 * so on 12 Nov it is 13 Aug – 12 Nov. Returns null for 'custom' or an unknown preset.
 */
function presetRange(preset, today) {
  switch (preset) {
    case 'this-month':
      return { from: monthStart(today), to: monthEnd(today) };
    case 'last-month': {
      const first = addMonths(monthStart(today), -1);
      return { from: first, to: monthEnd(first) };
    }
    case 'last-3-months':
      return { from: addDays(addMonths(today, -3), 1), to: today };
    case 'last-6-months':
      return { from: addDays(addMonths(today, -6), 1), to: today };
    case 'this-year':
      return { from: `${today.slice(0, 4)}-01-01`, to: `${today.slice(0, 4)}-12-31` };
    default:
      return null;
  }
}

/** True if both are real dates and `from` is not after `to`. */
function isValidRange(from, to) {
  return isValidDate(from) && isValidDate(to) && from <= to;
}

/**
 * Checks export options that came from a page and returns a clean copy with the final
 * date range: { preset, from, to, format, includeDates }. Throws if anything is invalid.
 * For a preset other than 'custom' the dates are worked out here; any dates sent are ignored.
 */
function parseExportOptions(raw, today) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Expected export options');
  const { preset, format, includeDates } = raw;
  if (!PRESETS.includes(preset)) throw new Error('Unknown range');
  if (!FORMATS.includes(format)) throw new Error('Unknown format');
  if (typeof includeDates !== 'boolean') throw new Error('Invalid includeDates');
  const range = preset === 'custom' ? { from: raw.from, to: raw.to } : presetRange(preset, today);
  if (!isValidRange(range.from, range.to)) {
    const err = new Error('Invalid date range');
    err.code = 'INVALID_RANGE';
    throw err;
  }
  return { preset, from: range.from, to: range.to, format, includeDates };
}

/** Wins dated from `from` to `to`, both days included. */
function winsInRange(entries, from, to) {
  return entries.filter((entry) => entry.date >= from && entry.date <= to);
}

/** "2026-11-03" as "3 Nov 2026": short, and clear in every country. */
function formatDate(date) {
  const [year, month, day] = date.split('-').map(Number);
  return `${day} ${MONTHS[month - 1]} ${year}`;
}

/** A tag as a heading: "helped-someone" becomes "Helped someone". */
function tagTitle(tag) {
  const words = tag.replace(/[-_]+/g, ' ').trim();
  const [first = '', ...rest] = Array.from(words);
  return first.toUpperCase() + rest.join('');
}

/**
 * Makes text safe to put after "- " in Markdown, so it shows exactly as typed:
 * no accidental bold, links, code, HTML, headings or nested lists.
 */
function escapeMarkdown(text) {
  return (
    text
      .replace(/[\\`*_[\]~]/g, '\\$&') // escapes, code, emphasis, links, strikethrough
      .replace(/<(?=[A-Za-z/!?])/g, '\\<') // HTML tags and <links>
      .replace(/&(?=#?[A-Za-z0-9]+;)/g, '\\&') // entities such as &copy;
      // At the start of the line only:
      .replace(/^[#>]/, '\\$&') // heading, quote
      .replace(/^[-+](?=\s|$)/, '\\$&') // nested bullet
      .replace(/^(\d{1,9})([.)])(?=\s|$)/, '$1\\$2') // numbered list
  );
}

function oneLine(text) {
  return text.replace(/\s+/g, ' ').trim();
}

function compareOldestFirst(a, b) {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
  return 0;
}

/**
 * Builds the export.
 * - Wins are grouped under a heading per tag, headings A–Z, wins without a tag last
 *   under "Other". If no win has a tag, there are no headings at all.
 * - Inside a group, wins are in date order, oldest first.
 * - The tag is taken out of the text (see textWithoutTag); it is already the heading.
 * - format 'markdown': "## Heading" and "- win", with Markdown characters escaped.
 *   format 'text': "Heading" and "- win", exactly as typed.
 * - includeDates adds the date at the end: "- Fixed login (3 Nov 2026)".
 * Returns { text, count }. `text` is '' when there are no wins in the range.
 */
function buildExport(entries, { from, to, format = 'markdown', includeDates = false }) {
  const wins = winsInRange(entries, from, to).sort(compareOldestFirst);
  if (wins.length === 0) return { text: '', count: 0 };
  const markdown = format === 'markdown';

  const groups = new Map(); // heading -> lines, each already in date order
  let anyTag = false;
  for (const win of wins) {
    const clean = oneLine(win.tag ? textWithoutTag(win.text) : win.text);
    const body = markdown ? escapeMarkdown(clean) : clean;
    const line = `- ${body}${includeDates ? ` (${formatDate(win.date)})` : ''}`;
    const title = win.tag ? tagTitle(win.tag) : OTHER;
    if (win.tag) anyTag = true;
    if (!groups.has(title)) groups.set(title, []);
    groups.get(title).push(line);
  }

  if (!anyTag) return { text: groups.get(OTHER).join('\n'), count: wins.length };

  const titles = [...groups.keys()].sort((a, b) => {
    if ((a === OTHER) !== (b === OTHER)) return a === OTHER ? 1 : -1; // "Other" goes last
    const [x, y] = [a.toLowerCase(), b.toLowerCase()];
    return x < y ? -1 : x > y ? 1 : 0;
  });
  const text = titles
    .map((title) => (markdown ? `## ${title}\n\n` : `${title}\n`) + groups.get(title).join('\n'))
    .join('\n\n');
  return { text, count: wins.length };
}

/** A file name for the export, e.g. "wins-2026-08-13-to-2026-11-12.md". */
function exportFileName({ from, to, format }) {
  return `wins-${from}-to-${to}.${format === 'markdown' ? 'md' : 'txt'}`;
}

module.exports = {
  PRESETS,
  FORMATS,
  presetRange,
  isValidRange,
  parseExportOptions,
  winsInRange,
  formatDate,
  tagTitle,
  escapeMarkdown,
  buildExport,
  exportFileName,
};
