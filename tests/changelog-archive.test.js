// changelog.json (newest releases) and changelog-archive.json (the rest),
// build/archive_changelog.py. Together they read as one newest-first list.
// Pure node; run from the pre-commit hook.
//
// History has nine version numbers used twice or three times, from before the
// hook stamped every pending entry, and one pair two days out of order
// (0.4.4 dated before 0.4.3). Those are frozen here as known; anything new of
// either kind fails.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const read = f => JSON.parse(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'));
const current = read('changelog.json');
const archive = read('changelog-archive.json');
const all = [...current, ...archive];
const KNOWN_REPEATS = { '0.2.24': 2, '0.0.370': 3, '0.0.351': 2, '0.0.326': 2, '0.0.315': 2,
                        '0.0.127': 2, '0.0.126': 2, '0.0.64': 2, '0.0.17': 2 };
const KNOWN_OUT_OF_ORDER = new Set(['0.4.4>0.4.3']);

assert(current.length >= 1 && current.length <= 300, `changelog.json has ${current.length} entries`);
const count = {};
for (const e of all) {
  assert(Array.isArray(e.changes) && e.changes.length, `${e.version} has no changes`);
  if (e.version !== 'pending') count[e.version] = (count[e.version] || 0) + 1;
}
for (const [v, n] of Object.entries(count)) {
  assert(n <= (KNOWN_REPEATS[v] || 1), `version ${v} appears ${n} times`);
}
for (let i = 1; i < all.length; i++) {
  const a = all[i - 1], b = all[i];
  if (a.date < b.date) assert(KNOWN_OUT_OF_ORDER.has(`${a.version}>${b.version}`),
    `out of order: ${a.version} (${a.date}) before ${b.version} (${b.date})`);
}
console.log(`changelog: ${current.length} current + ${archive.length} archived, newest first`);
