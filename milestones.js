// =============================================================================
// milestones.js — career milestones in reach, for active players
// =============================================================================
// Shared by the homepage's Milestone Watch card and /preview (one game's
// players). Classic script; `Milestones` is a plain global.
//
// Career totals are regular season only, summed from players/player_seasons.csv.
// That is the same basis as /stats/totals, so a player listed here as passing
// someone for #5 all-time is #5 on that page once they do.
//
// "Active" means on a current roster (data/{abbr}-roster.csv). The stats file
// only knows who played last season, and the offseason moves players around.
//
// Two kinds of milestone:
//   round    a round number at or above that stat's floor (10,000 points)
//   rank     passing the next player up, inside the all-time top 10
//
// "Games away" is the gap divided by the player's per-game rate in their latest
// season with 10+ games (their career rate if they have none). It is an estimate for
// ordering the list and is labelled "~" wherever it is shown.
// =============================================================================

const Milestones = (() => {
  // step: round numbers come every `step`; min: the first one worth a mention.
  const STATS = [
    { key: 'PTS', label: 'points',   step: 1000, min: 5000 },
    { key: 'REB', label: 'rebounds', step: 500,  min: 2500 },
    { key: 'AST', label: 'assists',  step: 500,  min: 2500 },
    { key: 'STL', label: 'steals',   step: 100,  min: 500 },
    { key: 'BLK', label: 'blocks',   step: 100,  min: 500 },
    { key: '3PM', label: 'threes',   step: 250,  min: 1000 },
  ];
  const TOP_N = 10;
  const MIN_GAMES_FOR_RATE = 10;

  const TEAMS = ['atl','bkn','bos','cha','chi','cle','dal','den','det','gsw',
    'hou','ind','lac','lal','mem','mia','mil','min','nop','nyk',
    'okc','orl','phi','phx','por','sac','sas','tor','uta','was'];

  // No field in player_seasons.csv contains a comma except a quoted name, so
  // this handles quotes and nothing more.
  function parseCSV(text) {
    const lines = text.trim().split('\n');
    const split = line => {
      const out = []; let cur = '', q = false;
      for (const ch of line) {
        if (ch === '"') q = !q;
        else if (ch === ',' && !q) { out.push(cur); cur = ''; }
        else cur += ch;
      }
      out.push(cur.replace(/\r$/, ''));
      return out;
    };
    const hdr = split(lines[0]);
    return lines.slice(1).map(l => {
      const c = split(l);
      return Object.fromEntries(hdr.map((h, i) => [h, c[i]]));
    });
  }

  // slug -> { slug, name, G, PTS, ..., latest: {season, G, PTS, ...} }
  function careers(rows) {
    const out = {};
    for (const r of rows) {
      if (!r.SLUG || !/^\d\d-\d\d$/.test(r.SEASON || '')) continue;
      const c = out[r.SLUG] || (out[r.SLUG] = { slug: r.SLUG, name: r.PLAYER, G: 0, seasons: {} });
      const s = c.seasons[r.SEASON] || (c.seasons[r.SEASON] = { G: 0 });
      const g = +r.G || 0;
      c.G += g; s.G += g;
      for (const { key } of STATS) {
        const v = +r[key] || 0;
        c[key] = (c[key] || 0) + v;
        s[key] = (s[key] || 0) + v;
      }
    }
    for (const c of Object.values(out)) {
      const recent = Object.keys(c.seasons).sort().reverse()
        .find(s => c.seasons[s].G >= MIN_GAMES_FOR_RATE);
      c.rateFrom = recent ? c.seasons[recent] : c;
      c.rateSeason = recent || null;
    }
    return out;
  }

  let _loaded = null;
  /** { careers, rosterTeam: slug -> 'ATL' }. Fetched once per page. */
  function load() {
    if (_loaded) return _loaded;
    _loaded = Promise.all([
      fetch('/players/player_seasons.csv').then(r => (r.ok ? r.text() : Promise.reject(new Error(r.status)))),
      ...TEAMS.map(t => fetch(`/data/${t}-roster.csv`).then(r => (r.ok ? r.text() : '')).catch(() => '')),
    ]).then(([seasons, ...rosters]) => {
      const rosterTeam = {};
      rosters.forEach((txt, i) => {
        txt.trim().split('\n').slice(1).forEach(line => {
          const slug = line.split(',')[0].trim();
          if (slug) rosterTeam[slug] = TEAMS[i].toUpperCase();
        });
      });
      return { careers: careers(parseCSV(seasons)), rosterTeam };
    });
    return _loaded;
  }

  /**
   * Every milestone within reach for the given slugs (default: every rostered
   * player), nearest first. `maxGames` drops anything further off than that.
   * Each: { slug, name, team, stat, label, total, target, need, perGame,
   *         gamesAway, kind: 'round'|'rank', rank?, passing? }
   */
  function upcoming(data, { slugs, maxGames = Infinity } = {}) {
    const { careers: all, rosterTeam } = data;
    const pool = (slugs || Object.keys(rosterTeam)).filter(s => all[s] && rosterTeam[s]);
    const out = [];
    for (const st of STATS) {
      // All-time order, retired players included — they are who gets passed.
      const board = Object.values(all).filter(c => c[st.key] > 0)
        .sort((a, b) => b[st.key] - a[st.key]);
      const rankOf = {};
      board.forEach((c, i) => { rankOf[c.slug] = i; });

      for (const slug of pool) {
        const c = all[slug];
        const total = c[st.key] || 0;
        const rf = c.rateFrom;
        const perGame = rf.G ? (rf[st.key] || 0) / rf.G : 0;
        if (perGame <= 0) continue;
        const base = { slug, name: c.name, team: rosterTeam[slug], stat: st.key, label: st.label, total, perGame };

        const target = Math.max(st.min, (Math.floor(total / st.step) + 1) * st.step);
        const need = target - total;
        out.push({ ...base, kind: 'round', target, need, gamesAway: need / perGame });

        // The next man up, if passing him puts this player in the top 10.
        const i = rankOf[slug];
        if (i != null && i > 0 && i <= TOP_N) {
          const ahead = board[i - 1];
          const gap = ahead[st.key] - total + 1;
          out.push({ ...base, kind: 'rank', target: ahead[st.key] + 1, need: gap,
            gamesAway: gap / perGame, rank: i, passing: ahead.name, passingSlug: ahead.slug });
        }
      }
    }
    return out.filter(m => m.gamesAway <= maxGames)
      .sort((a, b) => a.gamesAway - b.gamesAway || b.target - a.target);
  }

  const fmt = n => Math.round(n).toLocaleString('en-US');
  const ordinal = n => {
    const suf = ['th', 'st', 'nd', 'rd'], v = n % 100;
    return n + (suf[(v - 20) % 10] || suf[v] || suf[0]);
  };

  /** "12 from 10,000 points" / "41 from passing Jokic for 2nd all-time". Plain text. */
  function describe(m, shortName = s => s) {
    return m.kind === 'rank'
      ? `${fmt(m.need)} ${m.label} from passing ${shortName(m.passing)} for ${ordinal(m.rank)} all-time`
      : `${fmt(m.need)} from ${fmt(m.target)} ${m.label}`;
  }

  /** "~2 games" / "next game". */
  function eta(m) {
    const g = Math.ceil(m.gamesAway);
    return g <= 1 ? 'next game' : `~${g} games`;
  }

  return { STATS, load, upcoming, describe, eta };
})();
