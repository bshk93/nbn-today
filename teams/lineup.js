// =============================================================================
// teams/lineup.js — shared depth-chart / starting-five logic
// =============================================================================
// Extracted from teams/team.js so pages other than a team page can compute a
// projected lineup. team.js injects an entire page into document.body on load,
// so anything that only wants the lineup math cannot import it from there.
//
// Loaded as a classic script; both names below are plain globals. team.js pulls
// it in dynamically (see `lineupReady` there) rather than via a <script> tag,
// because team pages are 11-line shells that load only team.js.
//
// Input rows are the *augmented* roster objects team.js builds — the only two
// fields read here are:
//   _posList  string[]  the player's eligible positions (bio `pos`)
//   OVR       number-ish current overall rating
// Any caller producing objects with those two fields can use this.
//
//   DEPTH_SLOTS           the five lineup slots, PG→C
//   computeStartingFive   best legal one-player-per-slot assignment
// =============================================================================

const DEPTH_SLOTS = ['PG', 'SG', 'SF', 'PF', 'C'];

// Depth-chart ordering for the 'depth' roster mode: a starting five (one player
// per slot, PG→C) followed by everyone else in OVR order. A player only
// qualifies for a slot if that position is one of their eligible positions
// (bio `pos`), and each player fills at most one slot.
//
// Picking each slot greedily in PG→C order would strand slots — the best SF on
// a team listed "SF · C" can leave C empty even when they were the only player
// eligible there. So every legal assignment is scored and the best one wins,
// ranked by: most slots filled first, then highest OVR at PG, then SG, and so
// on down the order. With no conflicts that reduces to exactly "the highest
// rated player at each position, in order"; with conflicts it prefers a full
// five, and breaks the remaining ties in favour of the earlier slot.
//
// Candidates per slot are capped at the top 5 by OVR — five slots can never
// need a sixth-deep option at any one position — so the search is at most 6^5.
function computeStartingFive(players) {
  const ovrOf = p => parseFloat(p.OVR) || 0;
  const candidates = DEPTH_SLOTS.map(slot =>
    players
      .filter(p => (p._posList || []).includes(slot))
      .sort((a, b) => ovrOf(b) - ovrOf(a))
      .slice(0, DEPTH_SLOTS.length)
  );

  // [filled, ovr@PG, ovr@SG, …]; an empty slot scores -1 so any filled slot beats it.
  const scoreOf = assign => [
    assign.filter(Boolean).length,
    ...assign.map(p => (p ? ovrOf(p) : -1)),
  ];
  const better = (a, b) => {
    if (!b) return true;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] > b[i];
    return false;
  };

  const used = new Set();
  const cur = new Array(DEPTH_SLOTS.length).fill(null);
  let best = null, bestScore = null;

  (function search(i) {
    if (i === DEPTH_SLOTS.length) {
      const score = scoreOf(cur);
      if (better(score, bestScore)) { bestScore = score; best = [...cur]; }
      return;
    }
    for (const p of candidates[i]) {
      if (used.has(p)) continue;
      used.add(p); cur[i] = p;
      search(i + 1);
      used.delete(p); cur[i] = null;
    }
    cur[i] = null;          // leaving the slot empty is always a legal branch
    search(i + 1);
  })(0);

  return best || new Array(DEPTH_SLOTS.length).fill(null);
}
