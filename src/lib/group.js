'use strict';

// Ordering, week grouping and counts for the My Wins window and the tray.
// Shared by the main process (require) and pages (<script> tag after dates.js,
// where it becomes window.winlogGroup).

(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./dates'));
  else root.winlogGroup = factory(root.winlogDates);
})(typeof globalThis === 'object' ? globalThis : this, function (dates) {
  /** Newest first: by date, then by when the win was added. */
  function compareNewestFirst(a, b) {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? 1 : -1;
    return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
  }

  function sortNewestFirst(entries) {
    return [...entries].sort(compareNewestFirst);
  }

  /**
   * Groups wins by week, weeks starting on Monday.
   * Returns [{ weekStart: 'YYYY-MM-DD', entries }], newest week first, newest win first.
   */
  function groupByWeek(entries) {
    const groups = [];
    let current = null;
    for (const entry of sortNewestFirst(entries)) {
      const start = dates.weekStart(entry.date);
      if (!current || current.weekStart !== start) {
        current = { weekStart: start, entries: [] };
        groups.push(current);
      }
      current.entries.push(entry);
    }
    return groups;
  }

  /** Number of wins dated in the same calendar month as `today` ("YYYY-MM-DD"). */
  function countInMonth(entries, today) {
    const month = today.slice(0, 7);
    return entries.filter((entry) => entry.date.slice(0, 7) === month).length;
  }

  /** Number of wins dated `date`. */
  function countOnDate(entries, date) {
    return entries.filter((entry) => entry.date === date).length;
  }

  /** [{ tag, count }] for every tag in use: most used first, then A–Z. */
  function tagCounts(entries) {
    const counts = new Map();
    for (const entry of entries) {
      if (entry.tag) counts.set(entry.tag, (counts.get(entry.tag) || 0) + 1);
    }
    return [...counts]
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count || (a.tag < b.tag ? -1 : a.tag > b.tag ? 1 : 0));
  }

  return { compareNewestFirst, sortNewestFirst, groupByWeek, countInMonth, countOnDate, tagCounts };
});
