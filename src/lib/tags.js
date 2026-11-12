'use strict';

// A tag is "#" followed by a letter, then letters, digits, "_" or "-".
// The "#" must not follow a letter, digit, "&", "/" or "#", so "issue#12",
// "C#", "&#39;" and "page/#anchor" are not tags. "#123" is not a tag either.
const TAG_RE = /(?<![\p{L}\p{N}_&/#])#(\p{L}[\p{L}\p{N}_-]*)/u;

/** Returns the first tag in the text, lowercase and without "#", or null. */
function extractTag(text) {
  const match = TAG_RE.exec(text);
  if (!match) return null;
  return match[1].replace(/[-_]+$/, '').toLowerCase();
}

module.exports = { extractTag };
