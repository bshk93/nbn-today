// nbn-data.js: the shared escaper, CSV parser and team map. Pure node; run
// from the pre-commit hook with every other tests/*.test.js.
const assert = require('assert');
const NBN = require('../nbn-data.js');

// esc covers everything every old copy covered, and more: never less.
assert.strictEqual(NBN.esc(`<a href="x">D'Angelo & co</a>`),
  '&lt;a href=&quot;x&quot;&gt;D&#39;Angelo &amp; co&lt;/a&gt;');
assert.strictEqual(NBN.esc(null), '');
assert.strictEqual(NBN.esc(undefined), '');
assert.strictEqual(NBN.esc(0), '0');
assert.strictEqual(NBN.esc('plain'), 'plain');

// parseCSV: trimmed headers and values, quoted commas, short rows padded.
const rows = NBN.parseCSV('SLUG , NAME,TEAM\ncurry-stephen,"CURRY, STEPHEN",GSW\nx,y\n');
assert.deepStrictEqual(rows, [
  { SLUG: 'curry-stephen', NAME: 'CURRY, STEPHEN', TEAM: 'GSW' },
  { SLUG: 'x', NAME: 'y', TEAM: '' },
]);
assert.deepStrictEqual(NBN.parseLine('a,"b,c",d'), ['a', 'b,c', 'd']);

// The same parse nav.js has always given (its parseCSV is a global pages
// still lean on), so moving a page off its own copy changes nothing.
const fs = require('fs');
const navSrc = fs.readFileSync(require('path').join(__dirname, '..', 'nav.js'), 'utf8');
const navFns = navSrc.slice(navSrc.indexOf('function parseLine('), navSrc.indexOf('// Share a page'));
const nav = new Function(`${navFns}; return { parseCSV, parseLine };`)();
const sample = 'A,B,C\n1,"2,3",4\n x , y \n';
assert.deepStrictEqual(NBN.parseCSV(sample), nav.parseCSV(sample));

// 30 teams, abbreviations upper case, and the map can't be edited by a page.
assert.strictEqual(Object.keys(NBN.TEAMS).length, 30);
assert(Object.keys(NBN.TEAMS).every(k => /^[A-Z]{3}$/.test(k)));
assert(Object.isFrozen(NBN.TEAMS) && Object.isFrozen(NBN));

console.log('all nbn-data checks passed');
