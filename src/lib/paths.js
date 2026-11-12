'use strict';

// "Is this file inside that folder?" Used to keep exports and backups out of Win Log's
// own data folder, where they could replace the live files.
//
// Pure: it only looks at the path text. Resolve symlinks first (fs.realpath) when the
// answer has to hold on disk.

const nodePath = require('node:path');

/**
 * True if `target` is `folder` itself or anywhere inside it. Both must be absolute paths.
 * Mac and Windows file systems ignore letter case, so there ".../Win Log/WINS.JSON" is
 * the same file as ".../win log/wins.json".
 */
function isInside(folder, target, platform = process.platform) {
  const p = platform === 'win32' ? nodePath.win32 : nodePath.posix;
  const ignoreCase = platform === 'win32' || platform === 'darwin';
  const clean = (value) => {
    const resolved = p.resolve(value);
    return ignoreCase ? resolved.toLowerCase() : resolved;
  };
  const relative = p.relative(clean(folder), clean(target));
  if (relative === '') return true;
  // Outside: the way there starts by going up, or (Windows) it is on another drive.
  return relative !== '..' && !relative.startsWith(`..${p.sep}`) && !p.isAbsolute(relative);
}

module.exports = { isInside };
