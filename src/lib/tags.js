'use strict';

// A tag is "#" followed by a letter, then letters, digits, "_" or "-".
// The "#" must not follow a letter, digit, "&", "/" or "#", so "issue#12",
// "C#", "&#39;" and "page/#anchor" are not tags. "#123" is not a tag either.
const TAG_RE = /(?<![\p{L}\p{N}_&/#])#(\p{L}[\p{L}\p{N}_-]*)/u;

/**
 * Finds the first tag in the text.
 * Returns { tag, index, length }: the tag (lowercase, without "#"), where its "#" is in
 * the text and how many characters "#tag" takes up there. Returns null if there is no tag.
 */
function findTag(text) {
  const match = TAG_RE.exec(text);
  if (!match) return null;
  const name = match[1].replace(/[-_]+$/, ''); // "#bugfix-" is the tag "bugfix"
  return { tag: name.toLowerCase(), index: match.index, length: name.length + 1 };
}

/** Returns the first tag in the text, lowercase and without "#", or null. */
function extractTag(text) {
  const found = findTag(text);
  return found ? found.tag : null;
}

// What may follow a tag that still counts as "the tag is at the end": spaces,
// punctuation and more tags, as in "Fixed login #bugfix #urgent."
const ONLY_TAGS_AND_PUNCTUATION = /^(?:[\s.,;:!?]|#[\p{L}\p{N}_-]+)*$/u;

/**
 * The text without its tag, for exports where wins are already grouped by tag.
 * - A tag at the end is removed: "Fixed login #bugfix" becomes "Fixed login".
 * - A tag at the start is removed: "#docs: wrote the guide" becomes "wrote the guide".
 * - A tag used as a word in the sentence keeps the word:
 *   "Ran the #onboarding session" becomes "Ran the onboarding session".
 * - If nothing readable would be left ("#solo"), only the "#" is dropped.
 * Only the first tag is touched; any later #words stay as typed.
 */
function textWithoutTag(text) {
  const found = findTag(text);
  if (!found) return text.trim();
  const word = text.slice(found.index + 1, found.index + found.length);
  const before = text.slice(0, found.index);
  const after = text.slice(found.index + found.length);
  const hashDropped = (before + word + after).trim();

  let result;
  if (before.trim() === '') {
    result = after.replace(/^[\s:,;–—-]+/u, '');
  } else if (ONLY_TAGS_AND_PUNCTUATION.test(after)) {
    const rest = after.trim();
    const gap = rest === '' || /^[.,;:!?]/.test(rest) ? '' : ' ';
    result = before.trimEnd() + gap + rest;
  } else {
    return hashDropped;
  }
  result = result.trim();
  return /[\p{L}\p{N}]/u.test(result) ? result : hashDropped;
}

module.exports = { findTag, extractTag, textWithoutTag };
