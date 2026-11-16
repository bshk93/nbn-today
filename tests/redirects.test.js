// Old URLs land where their stub folders used to send them (redirects.js).
// Expected values were read off the live stubs on 2026-11-16, before they
// were deleted. Pure node; run from the pre-commit hook.
const assert = require('assert');
const { nbnRedirect, TABLE } = require('../redirects.js');
const fs = require('fs');
const path = require('path');

const CASES = [
  ['/stats/highs/p/', '', '', '/stats/highs/?stat=P'],
  ['/stats/highs/3pm/', '', '#x', '/stats/highs/?stat=3PM#x'],
  ['/stats/highs/3PM/', '', '', '/stats/highs/?stat=3PM'],
  ['/stats/totals/r/', '', '', '/stats/totals/?stat=REB'],
  ['/stats/totals/b', '', '', '/stats/totals/?stat=BLK'],
  ['/stats/totals/a/index.html', '', '', '/stats/totals/?stat=AST'],
  ['/pdc/', '?player=x', '#y', '/committees/pdc/?player=x#y'],
  ['/pdc', '', '', '/committees/pdc/'],
  ['/stream/', '?season=26-27', '', '/committees/stream/?season=26-27'],
  ['/schedule/', '?d=1', '', '/calendar/?d=1'],
  ['/trade-sim/', '?teams=OKC,BOS', '', '/transaction-sim/?teams=OKC,BOS'],
  ['/trade-retros/', '?x=1', '#y', '/frivolities/#retros'],
  ['/pickem/', '?d=2', '', '/bet/?d=2#pickem'],
  ['/rookie-scale/', '', '', '/cap-settings/#rookie-scale'],
  ['/invest/fair/', '?team=ATL', '', '/finances/?team=ATL'],
  ['/nbyen-economy/', '', '', '/nbyen/'],
  ['/nbnfl/CIN/', '', '', '/nbnfl/'],
  ['/players/curry', '', '', null],
  ['/', '', '', null],
];
for (const [p, q, h, want] of CASES) assert.strictEqual(nbnRedirect(p, q, h), want, `${p}${q}${h}`);

// No entry may shadow a page that exists: a table row for a live folder would
// never fire (nginx serves the folder), and means a stub folder came back.
const root = path.join(__dirname, '..');
for (const [from] of TABLE) {
  assert(!fs.existsSync(path.join(root, from, 'index.html')), `${from} still has an index.html`);
}
console.log(`all ${CASES.length} redirect checks passed`);
