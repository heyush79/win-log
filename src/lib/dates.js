'use strict';

// All entry dates are local calendar dates. Never use toISOString() for them:
// it is UTC and files an evening win under the wrong day in many time zones.

function pad(n) {
  return String(n).padStart(2, '0');
}

/** Local date as YYYY-MM-DD. */
function localDate(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Local date and time that is safe in file names, e.g. 2026-11-12T18-05-09. */
function localFileStamp(d = new Date()) {
  return `${localDate(d)}T${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
}

module.exports = { localDate, localFileStamp };
