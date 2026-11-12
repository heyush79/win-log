'use strict';

// Search and tag filter for the My Wins window.
// Shared by the main process (require) and pages (<script> tag, where it becomes
// window.winlogSearch), so it has no imports.

(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.winlogSearch = factory();
})(typeof globalThis === 'object' ? globalThis : this, function () {
  /** Lowercase without accents, so "cafe" finds "Café". */
  function normalize(text) {
    return String(text)
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .toLowerCase();
  }

  /** Splits a search into words. "#bugfix" becomes "bugfix": tags are stored without "#". */
  function searchTerms(query) {
    if (typeof query !== 'string') return [];
    return normalize(query)
      .split(/\s+/)
      .map((term) => term.replace(/^#+/, ''))
      .filter(Boolean);
  }

  /** True if every word of the search appears in the win's text, tag or date. */
  function matchesSearch(entry, query) {
    const terms = searchTerms(query);
    if (terms.length === 0) return true;
    const haystack = normalize(`${entry.text} ${entry.tag || ''} ${entry.date}`);
    return terms.every((term) => haystack.includes(term));
  }

  // The tag filter value that means "wins without a tag".
  const NO_TAG = '\u0000none';

  /** tag: null for all wins, NO_TAG for wins without a tag, or a tag name. */
  function matchesTag(entry, tag) {
    if (tag === null || tag === undefined) return true;
    if (tag === NO_TAG) return !entry.tag;
    return entry.tag === tag;
  }

  /** Wins that match both the search and the tag filter. */
  function filterWins(entries, { query = '', tag = null } = {}) {
    return entries.filter((entry) => matchesTag(entry, tag) && matchesSearch(entry, query));
  }

  return { normalize, searchTerms, matchesSearch, matchesTag, filterWins, NO_TAG };
});
