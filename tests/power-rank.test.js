// Unit tests for /power-rank.js — the homepage Power Rankings card's rules.
//
// Pure: no browser, no network. Runs from the pre-commit hook.
//
//     node tests/power-rank.test.js
//
// What is pinned:
//   - A voted edition shows for 30 days after it is published, then the
//     computed ranking takes over.
//   - The computed ranking is by rating, ties share a rank, and movement is
//     against the ranks from the earlier ratings.
//   - Form is regular season only, newest first: streak and last 10.

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const g = { console };
vm.createContext(g);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'power-rank.js'), 'utf8'), g);
const { pick, computed, form, isFresh } = g.PowerRank;
const PowerRank_latest = g.PowerRank.latest;

let failed = 0;
function eq(name, got, want) {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a === b) { console.log(`ok   ${name}`); return; }
  failed++;
  console.log(`FAIL ${name}: got ${a}, want ${b}`);
}

// ── pick ──
const eds = [
  { id: 'a', published_at: '2026-09-16T12:00:00Z' },
  { id: 'b', published_at: null },
  { id: 'c', published_at: '2026-10-20T08:00:00Z' },
];
eq('the newest published edition, while fresh', pick(eds, '2026-11-11').id, 'c');
eq('30 days on, still fresh', pick(eds, '2026-11-19').id, 'c');
eq('31 days on, stale', pick(eds, '2026-11-20'), null);
eq('an edition published after today is not the newest', pick(eds, '2026-10-01').id, 'a');
eq('nothing published', pick([{ id: 'x' }], '2026-11-11'), null);
eq('a stale edition is still the latest', PowerRank_latest(eds, '2026-12-25').id, 'c');
eq('but not fresh', isFresh(PowerRank_latest(eds, '2026-12-25'), '2026-12-25'), false);

// ── computed ──
const teams = [
  { team: 'ORL', rating: 6.2 }, { team: 'PHX', rating: 4.0 }, { team: 'CHI', rating: 4.0 },
  { team: 'OKC', rating: 1.5 }, { team: 'BOS', rating: null },
];
const rows = computed(teams, { ORL: 1.0, PHX: 5.0, CHI: 3.0 });
eq('ranked by rating, ties share a rank', rows.map(r => `${r.rank}${r.team}`), ['1ORL', '2CHI', '2PHX', '4OKC']);
eq('ties are marked', rows.map(r => r.tied), [false, true, true, false]);
eq('moves against the earlier ranks', rows.map(r => r.move), [2, 0, -1, 0]);
eq('a team missing a week ago is new', rows[3].prev, null);
eq('no earlier ratings: no movement, not "new"', computed(teams, {}).every(r => r.prev === undefined && r.move === 0), true);

// ── form ──
const G = (date, home, away, hs, as, gametype = 'REG') =>
  ({ date, home_team: home, away_team: away, home_score: hs, away_score: as, gametype });
const games = [
  G('2026-10-21', 'ORL', 'MIA', 100, 90),
  G('2026-10-23', 'MIA', 'ORL', 99, 95),   // L
  G('2026-10-25', 'ORL', 'BOS', 110, 100), // W
  G('2026-10-27', 'NYK', 'ORL', 90, 101),  // W
  G('2026-10-29', 'ORL', 'NYK', 105, 98),  // W
  G('2026-11-01', 'ORL', 'PHI', 80, 90, 'PLAYOFF'),
  G('2026-11-02', 'BOS', 'MIA', 100, 90),
];
eq('streak and last 10', form(games, 'ORL'), { streak: 'W3', last10: '4–1', games: 5 });
eq('through a date', form(games, 'ORL', '2026-10-24'), { streak: 'L1', last10: '1–1', games: 2 });
eq('no games, no form', form(games, 'LAL'), null);

if (failed) { console.log(`\n${failed} failed`); process.exit(1); }
console.log('\nall passed');
