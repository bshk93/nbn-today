// Shared achievement engine for NBN member pages.
//
// Used by the member profile page (renders the full badge grid) and the members
// index (shows an X/N completion count). Keeping the ACHIEVEMENTS list and the
// unlock logic here means the two pages can never drift out of sync.
//
// Exposes window.NBNAch = { ACHIEVEMENTS, CAT_LABELS, total,
//                           prepare, computeAchData, countUnlocked, renderAchievements }
//
//   const shared = NBNAch.prepare({ ownerStatsCsv, standingsCsv, bios, awardsCsv,
//                                   allTxns, playerSeasonsCsv, h2hOwnersCsv });
//   const achData = NBNAch.computeAchData(member, shared,
//                                   { betsStats, investStats, tipsReceived });
//   NBNAch.countUnlocked(achData);   // -> number unlocked
//   NBNAch.renderAchievements(achData); // -> HTML string (profile only)
//
// `prepare` does all the heavy parsing once; `computeAchData` is cheap per member,
// so the index can score every member after a single prepare().

(function () {
  'use strict';

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function parseCSV(text) {
    const lines = (text || '').trim().split('\n').filter(Boolean);
    if (lines.length < 2) return [];
    const headers = lines[0].split(',').map(h => h.trim());
    return lines.slice(1).map(line => {
      const vals = line.split(',');
      const obj = {};
      headers.forEach((h, i) => { obj[h] = (vals[i] || '').trim(); });
      return obj;
    });
  }

  // Quote-aware CSV parser — for files with commas inside quoted fields
  // (e.g. PLAYER = "Last, First" in player_seasons.csv / player_awards.csv).
  function splitCSVLine(line) {
    const out = []; let cur = ''; let q = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (q) {
        if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; }
        else cur += c;
      } else {
        if (c === '"') q = true;
        else if (c === ',') { out.push(cur); cur = ''; }
        else cur += c;
      }
    }
    out.push(cur);
    return out;
  }
  function parseCSVQuoted(text) {
    const lines = (text || '').replace(/\r/g, '').trim().split('\n').filter(Boolean);
    if (lines.length < 2) return [];
    const headers = splitCSVLine(lines[0]).map(h => h.trim());
    return lines.slice(1).map(line => {
      const vals = splitCSVLine(line);
      const obj = {};
      headers.forEach((h, i) => { obj[h] = (vals[i] || '').trim(); });
      return obj;
    });
  }

  function seasonDateRange(season) {
    const [yy1, yy2] = season.split('-').map(y => 2000 + parseInt(y, 10));
    return { start: new Date(`${yy1}-10-01`), end: new Date(`${yy2}-09-30`) };
  }
  function memberWasAtTeamInSeason(tenures, team, season) {
    const { start: sStart, end: sEnd } = seasonDateRange(season);
    return (tenures || []).some(t => {
      if (t.team !== team) return false;
      const tStart = new Date(t.start);
      const tEnd = t.end ? new Date(t.end) : new Date('9999-12-31');
      return tStart <= sEnd && tEnd >= sStart;
    });
  }
  function memberAtTeamOnDate(tenures, team, iso) {
    const d = new Date(iso);
    return (tenures || []).some(t => {
      if (t.team !== team) return false;
      const ts = new Date(t.start);
      const te = t.end ? new Date(t.end) : new Date('9999-12-31');
      return ts <= d && te >= d;
    });
  }
  function seasonStartYear(season) { return 2000 + parseInt(season.split('-')[0], 10); }
  // A draft in calendar year Y feeds the season that starts that same year ("Y-(Y+1)").
  function draftSeasonStr(year) {
    const a = year - 2000;
    return `${String(a).padStart(2, '0')}-${String(a + 1).padStart(2, '0')}`;
  }
  // Longest run of consecutive integers present in a Set<number>.
  function longestConsecutiveRun(yearSet) {
    let best = 0;
    for (const y of yearSet) {
      if (yearSet.has(y - 1)) continue;
      let len = 1;
      while (yearSet.has(y + len)) len++;
      best = Math.max(best, len);
    }
    return best;
  }
  const parseMoney = v => Number(String(v).replace(/[^0-9.]/g, '')) || 0;

  // ── Achievement definitions ───────────────────────────────────────────────
  // Each achievement: id, name, icon, cat, desc, optional value(d), tiers[].
  // Each tier: label, tierClass (CSS), sub (sub-label), unlock(d).
  // Tiers are ordered lowest→highest; the highest unlocked tier is displayed.
  const ACHIEVEMENTS = [
    // === GM Performance ===
    {
      id: 'champion', name: 'Champion', icon: '🏆', cat: 'gm',
      desc: 'Win an NBN championship',
      tiers: [
        { label: 'Bronze', tierClass: 'tier-bronze', sub: '1× Champion', unlock: d => d.champSeasons >= 1 },
        { label: 'Silver', tierClass: 'tier-silver', sub: '2× Champion', unlock: d => d.champSeasons >= 2 },
        { label: 'Gold', tierClass: 'tier-gold', sub: '3× Champion', unlock: d => d.champSeasons >= 3 },
      ],
    },
    {
      id: 'finals', name: 'Finals Run', icon: '🎖️', cat: 'gm',
      desc: 'Reach the NBN Finals',
      tiers: [
        { label: 'Bronze', tierClass: 'tier-bronze', sub: '1× Finals', unlock: d => d.finalsSeasons >= 1 },
        { label: 'Silver', tierClass: 'tier-silver', sub: '3× Finals', unlock: d => d.finalsSeasons >= 3 },
        { label: 'Gold', tierClass: 'tier-gold', sub: '5× Finals', unlock: d => d.finalsSeasons >= 5 },
      ],
    },
    {
      id: 'conf', name: 'Conf Royalty', icon: '👑', cat: 'gm',
      desc: 'Win a Conference Finals',
      tiers: [
        { label: 'Bronze', tierClass: 'tier-bronze', sub: '1× Conf Finals', unlock: d => d.confSeasons >= 1 },
        { label: 'Silver', tierClass: 'tier-silver', sub: '3× Conf Finals', unlock: d => d.confSeasons >= 3 },
        { label: 'Gold', tierClass: 'tier-gold', sub: '5× Conf Finals', unlock: d => d.confSeasons >= 5 },
      ],
    },
    {
      id: 'playoff', name: 'Postseason', icon: '🏟️', cat: 'gm',
      desc: 'Qualify for the playoffs',
      tiers: [
        { label: 'Bronze', tierClass: 'tier-bronze', sub: '3 appearances', unlock: d => d.playoffSeasons >= 3 },
        { label: 'Silver', tierClass: 'tier-silver', sub: '5 appearances', unlock: d => d.playoffSeasons >= 5 },
        { label: 'Gold', tierClass: 'tier-gold', sub: '7 appearances', unlock: d => d.playoffSeasons >= 7 },
      ],
    },
    {
      id: 'top_dog', name: 'Top Dog', icon: '1️⃣', cat: 'gm',
      desc: 'Finish as the #1 overall seed',
      tiers: [
        { label: '#1 Seed', tierClass: 'tier-on', sub: '#1 Overall Seed', unlock: d => d.seasons.some(s => +s.SEED_NUM === 1) },
      ],
    },
    {
      id: 'foty', name: 'FOTY', icon: '🏢', cat: 'gm',
      desc: 'Win Franchise of the Year',
      tiers: [
        { label: 'FOTY', tierClass: 'tier-on', sub: 'Franchise of the Year', unlock: d => d.seasons.some(s => s.FOTY === 'TRUE') },
      ],
    },
    {
      id: 'coty', name: 'COTY', icon: '📋', cat: 'gm',
      desc: 'Win Coach of the Year',
      tiers: [
        { label: 'COTY', tierClass: 'tier-on', sub: 'Coach of the Year', unlock: d => d.seasons.some(s => s.COTY === 'TRUE') },
      ],
    },
    {
      id: 'off_guru', name: 'Juggernaut', icon: '⚡', cat: 'gm',
      desc: 'Best offensive rating in a season',
      tiers: [
        { label: 'Best OFF', tierClass: 'tier-on', sub: 'League-best OFF_RTG', unlock: d => d.hadBestOffRtg },
      ],
    },
    {
      id: 'def_guru', name: 'Lockdown', icon: '🛡️', cat: 'gm',
      desc: 'Best defensive rating in a season',
      tiers: [
        { label: 'Best DEF', tierClass: 'tier-on', sub: 'League-best DEF_RTG', unlock: d => d.hadBestDefRtg },
      ],
    },
    {
      id: 'bridesmaid', name: 'Bridesmaid', icon: '💔', cat: 'gm',
      desc: 'Lost in the Finals 2+ times without winning',
      tiers: [
        { label: 'Cursed', tierClass: 'tier-on', sub: '2+ Finals, 0 rings', unlock: d => d.finalsSeasons >= 2 && d.champSeasons === 0 },
      ],
    },
    {
      id: 'wire_to_wire', name: 'Wire to Wire', icon: '🥇', cat: 'gm',
      desc: 'Hold the #1 overall seed and win the title in the same season',
      tiers: [
        { label: 'Wire to Wire', tierClass: 'tier-on', sub: '#1 Seed → Champion',
          unlock: d => d.seasons.some(s => +s.SEED_NUM === 1 && s.PLAYOFF_RESULT === 'Champion') },
      ],
    },
    {
      id: 'big_season', name: 'Win Machine', icon: '💪', cat: 'gm',
      desc: 'Wins in a single regular season',
      value: d => `${d.maxSeasonWins}-win best season`,
      tiers: [
        { label: 'Bronze', tierClass: 'tier-bronze', sub: '50-win season', unlock: d => d.maxSeasonWins >= 50 },
        { label: 'Silver', tierClass: 'tier-silver', sub: '60-win season', unlock: d => d.maxSeasonWins >= 60 },
        { label: 'Gold', tierClass: 'tier-gold', sub: '70-win season', unlock: d => d.maxSeasonWins >= 70 },
      ],
    },
    {
      id: 'mr_consistent', name: 'Mr. Consistent', icon: '📏', cat: 'gm',
      desc: 'Consecutive playoff appearances',
      tiers: [
        { label: 'Bronze', tierClass: 'tier-bronze', sub: '3 straight playoffs', unlock: d => d.maxPlayoffStreak >= 3 },
        { label: 'Silver', tierClass: 'tier-silver', sub: '4 straight playoffs', unlock: d => d.maxPlayoffStreak >= 4 },
        { label: 'Gold', tierClass: 'tier-gold', sub: '5+ straight playoffs', unlock: d => d.maxPlayoffStreak >= 5 },
      ],
    },
    {
      id: 'cinderella', name: 'Cinderella', icon: '🩴', cat: 'gm',
      desc: 'Make a deep playoff run as a #6 seed or lower',
      tiers: [
        { label: 'Bronze', tierClass: 'tier-bronze', sub: 'Conf Finals as a 6+ seed', unlock: d => d.cinderellaConf },
        { label: 'Silver', tierClass: 'tier-silver', sub: 'Finals as a 6+ seed', unlock: d => d.cinderellaFinals },
        { label: 'Gold', tierClass: 'tier-gold', sub: 'Champion as a 6+ seed', unlock: d => d.cinderellaTitle },
      ],
    },
    {
      id: 'dynasty', name: 'Dynasty', icon: '🏛️', cat: 'gm',
      desc: 'Win championships in consecutive seasons',
      tiers: [
        { label: 'Bronze', tierClass: 'tier-bronze', sub: 'Back-to-back titles', unlock: d => d.dynastyStreak >= 2 },
        { label: 'Silver', tierClass: 'tier-silver', sub: 'Three-peat', unlock: d => d.dynastyStreak >= 3 },
        { label: 'Gold', tierClass: 'tier-gold', sub: 'Four-peat', unlock: d => d.dynastyStreak >= 4 },
      ],
    },
    {
      id: 'tankathon', name: 'Tankathon', icon: '🪣', cat: 'gm',
      desc: 'Finish a season with the league\'s worst record',
      tiers: [
        { label: 'Tankathon', tierClass: 'tier-on', sub: 'League-worst record', unlock: d => d.tankathon },
      ],
    },

    // === Longevity ===
    {
      id: 'seasoned', name: 'Seasoned GM', icon: '📅', cat: 'longevity',
      desc: 'Seasons managed',
      tiers: [
        { label: 'Bronze', tierClass: 'tier-bronze', sub: '2 seasons', unlock: d => d.seasons.length >= 2 },
        { label: 'Silver', tierClass: 'tier-silver', sub: '4 seasons', unlock: d => d.seasons.length >= 4 },
        { label: 'Gold', tierClass: 'tier-gold', sub: '6+ seasons', unlock: d => d.seasons.length >= 6 },
      ],
    },
    {
      id: 'wins', name: 'Winning Ways', icon: '🏀', cat: 'longevity',
      desc: 'Career regular-season wins',
      value: d => `${d.regWins} regular-season wins`,
      tiers: [
        { label: 'Bronze', tierClass: 'tier-bronze', sub: '', unlock: d => d.regWins >= 100 },
        { label: 'Silver', tierClass: 'tier-silver', sub: '', unlock: d => d.regWins >= 250 },
        { label: 'Gold', tierClass: 'tier-gold', sub: '', unlock: d => d.regWins >= 400 },
      ],
    },

    // === Draft ===
    {
      id: 'draft_whisperer', name: 'Draft Whisperer', icon: '🔮', cat: 'draft',
      desc: 'Draft a player who later makes an All-NBN team',
      tiers: [
        { label: 'Bronze', tierClass: 'tier-bronze', sub: 'Drafted an All-NBN 3rd Teamer', unlock: d => d.bestDrafteeAllNbn <= 3 },
        { label: 'Silver', tierClass: 'tier-silver', sub: 'Drafted an All-NBN 2nd Teamer', unlock: d => d.bestDrafteeAllNbn <= 2 },
        { label: 'Gold', tierClass: 'tier-gold', sub: 'Drafted an All-NBN 1st Teamer', unlock: d => d.bestDrafteeAllNbn <= 1 },
      ],
    },
    {
      id: 'draft_architect', name: 'Draft Architect', icon: '🏗️', cat: 'draft',
      desc: 'Win a title with homegrown (self-drafted) players on the roster',
      tiers: [
        { label: 'Bronze', tierClass: 'tier-bronze', sub: 'Champion w/ 3 homegrown', unlock: d => d.maxHomegrown >= 3 },
        { label: 'Silver', tierClass: 'tier-silver', sub: 'Champion w/ 5 homegrown', unlock: d => d.maxHomegrown >= 5 },
        { label: 'Gold', tierClass: 'tier-gold', sub: 'Champion w/ 7 homegrown', unlock: d => d.maxHomegrown >= 7 },
      ],
    },
    {
      id: 'lottery_darling', name: 'Lottery Darling', icon: '🎱', cat: 'draft',
      desc: 'Make a top-4 draft selection in consecutive years',
      tiers: [
        { label: 'Bronze', tierClass: 'tier-bronze', sub: '3 straight top-4 picks', unlock: d => d.lotteryStreak >= 3 },
        { label: 'Silver', tierClass: 'tier-silver', sub: '4 straight top-4 picks', unlock: d => d.lotteryStreak >= 4 },
        { label: 'Gold', tierClass: 'tier-gold', sub: '5+ straight top-4 picks', unlock: d => d.lotteryStreak >= 5 },
      ],
    },
    {
      id: 'steal', name: 'Steal of the Draft', icon: '💎', cat: 'draft',
      desc: 'Draft a future All-Star outside the lottery',
      tiers: [
        { label: 'Bronze', tierClass: 'tier-bronze', sub: 'All-Star picked outside top 14', unlock: d => d.stealPick > 14 },
        { label: 'Silver', tierClass: 'tier-silver', sub: 'All-Star picked outside top 30', unlock: d => d.stealPick > 30 },
        { label: 'Gold', tierClass: 'tier-gold', sub: 'All-Star picked outside top 45', unlock: d => d.stealPick > 45 },
      ],
    },

    // === Player Development ===
    {
      id: 'mvp_maker', name: 'MVP Maker', icon: '👑', cat: 'development',
      desc: 'Have a player win MVP on your roster',
      tiers: [
        { label: 'MVP Maker', tierClass: 'tier-on', sub: 'Rostered an MVP winner', unlock: d => d.mvpMaker },
      ],
    },
    {
      id: 'star_factory', name: 'Star Factory', icon: '⭐', cat: 'development',
      desc: 'All-Star selections by your players',
      value: d => `${d.allStarCount} All-Star selection${d.allStarCount === 1 ? '' : 's'}`,
      tiers: [
        { label: 'Bronze', tierClass: 'tier-bronze', sub: '3 All-Star selections', unlock: d => d.allStarCount >= 3 },
        { label: 'Silver', tierClass: 'tier-silver', sub: '8 All-Star selections', unlock: d => d.allStarCount >= 8 },
        { label: 'Gold', tierClass: 'tier-gold', sub: '15 All-Star selections', unlock: d => d.allStarCount >= 15 },
      ],
    },

    // === Front Office (trades + signings) ===
    {
      id: 'all_in', name: 'All-In', icon: '🃏', cat: 'trades',
      desc: 'First-round picks sent in a single trade',
      tiers: [
        { label: 'Bronze', tierClass: 'tier-bronze', sub: '3 firsts in one trade', unlock: d => d.maxFirstsSent >= 3 },
        { label: 'Silver', tierClass: 'tier-silver', sub: '4 firsts in one trade', unlock: d => d.maxFirstsSent >= 4 },
        { label: 'Gold', tierClass: 'tier-gold', sub: '5+ firsts in one trade', unlock: d => d.maxFirstsSent >= 5 },
      ],
    },
    {
      id: 'fleecer', name: 'Fleecer', icon: '🦊', cat: 'trades',
      desc: 'First-round picks acquired in a single trade',
      tiers: [
        { label: 'Bronze', tierClass: 'tier-bronze', sub: '3 firsts in one trade', unlock: d => d.maxFirstsRecv >= 3 },
        { label: 'Silver', tierClass: 'tier-silver', sub: '4 firsts in one trade', unlock: d => d.maxFirstsRecv >= 4 },
        { label: 'Gold', tierClass: 'tier-gold', sub: '5+ firsts in one trade', unlock: d => d.maxFirstsRecv >= 5 },
      ],
    },
    {
      id: 'wheeler_dealer', name: 'Wheeler Dealer', icon: '🤝', cat: 'trades',
      desc: 'Career trades completed',
      value: d => `${d.tradeCount} trade${d.tradeCount === 1 ? '' : 's'} completed`,
      tiers: [
        { label: 'Bronze', tierClass: 'tier-bronze', sub: '5 trades', unlock: d => d.tradeCount >= 5 },
        { label: 'Silver', tierClass: 'tier-silver', sub: '15 trades', unlock: d => d.tradeCount >= 15 },
        { label: 'Gold', tierClass: 'tier-gold', sub: '30 trades', unlock: d => d.tradeCount >= 30 },
      ],
    },
    {
      id: 'polyamorous', name: 'Polyamorous', icon: '♻️', cat: 'trades',
      desc: 'Pull off a multi-team trade',
      tiers: [
        { label: 'Bronze', tierClass: 'tier-bronze', sub: '3-team trade', unlock: d => d.maxTradeTeams >= 3 },
        { label: 'Silver', tierClass: 'tier-silver', sub: '4-team trade', unlock: d => d.maxTradeTeams >= 4 },
        { label: 'Gold', tierClass: 'tier-gold', sub: '5+-team trade', unlock: d => d.maxTradeTeams >= 5 },
      ],
    },
    {
      id: 'blank_check', name: 'Blank Check', icon: '💸', cat: 'trades',
      desc: 'Total value of your biggest free-agent signing',
      tiers: [
        { label: 'Bronze', tierClass: 'tier-bronze', sub: '$100M contract', unlock: d => d.maxSignValue >= 100e6 },
        { label: 'Silver', tierClass: 'tier-silver', sub: '$200M contract', unlock: d => d.maxSignValue >= 200e6 },
        { label: 'Gold', tierClass: 'tier-gold', sub: '$300M contract', unlock: d => d.maxSignValue >= 300e6 },
      ],
    },

    // === Rivalries ===
    {
      id: 'nemesis', name: 'Nemesis', icon: '😈', cat: 'rivalries',
      desc: 'Dominate an opponent head-to-head (min. 10 games)',
      value: d => d.nemesis ? `${d.nemesis.w}-${d.nemesis.l} vs ${d.nemesis.team}` : '',
      tiers: [
        { label: 'Bronze', tierClass: 'tier-bronze', sub: '70%+ win rate vs a team', unlock: d => d.nemesis && d.nemesis.pct >= 0.70 },
        { label: 'Silver', tierClass: 'tier-silver', sub: '80%+ win rate vs a team', unlock: d => d.nemesis && d.nemesis.pct >= 0.80 },
        { label: 'Gold', tierClass: 'tier-gold', sub: '90%+ win rate vs a team', unlock: d => d.nemesis && d.nemesis.pct >= 0.90 },
      ],
    },
    {
      id: 'punching_bag', name: 'Punching Bag', icon: '🥊', cat: 'rivalries',
      desc: 'An opponent owns you head-to-head (min. 10 games)',
      value: d => d.punchingBag ? `${d.punchingBag.w}-${d.punchingBag.l} vs ${d.punchingBag.team}` : '',
      tiers: [
        { label: 'Bronze', tierClass: 'tier-bronze', sub: '≤30% win rate vs a team', unlock: d => d.punchingBag && d.punchingBag.pct <= 0.30 },
        { label: 'Silver', tierClass: 'tier-silver', sub: '≤20% win rate vs a team', unlock: d => d.punchingBag && d.punchingBag.pct <= 0.20 },
        { label: 'Gold', tierClass: 'tier-gold', sub: '≤10% win rate vs a team', unlock: d => d.punchingBag && d.punchingBag.pct <= 0.10 },
      ],
    },

    // === Betting ===
    {
      id: 'high_roller', name: 'High Roller', icon: '🎰', cat: 'betting',
      desc: 'Total bets placed',
      tiers: [
        { label: 'Bronze', tierClass: 'tier-bronze', sub: '10 bets', unlock: d => (d.bets.wager_count || 0) >= 10 },
        { label: 'Silver', tierClass: 'tier-silver', sub: '25 bets', unlock: d => (d.bets.wager_count || 0) >= 25 },
        { label: 'Gold', tierClass: 'tier-gold', sub: '50 bets', unlock: d => (d.bets.wager_count || 0) >= 50 },
      ],
    },
    {
      id: 'up_big', name: 'Up Big', icon: '💰', cat: 'betting',
      desc: 'Lifetime net NB¥ profit from bets',
      tiers: [
        { label: 'Bronze', tierClass: 'tier-bronze', sub: 'NB¥5k profit', unlock: d => (d.bets.net_pnl || 0) >= 5000 },
        { label: 'Silver', tierClass: 'tier-silver', sub: 'NB¥15k profit', unlock: d => (d.bets.net_pnl || 0) >= 15000 },
        { label: 'Gold', tierClass: 'tier-gold', sub: 'NB¥40k profit', unlock: d => (d.bets.net_pnl || 0) >= 40000 },
      ],
    },
    {
      id: 'hot_streak', name: 'Hot Streak', icon: '🔥', cat: 'betting',
      desc: 'Most consecutive bet wins',
      tiers: [
        { label: 'Bronze', tierClass: 'tier-bronze', sub: '3 in a row', unlock: d => (d.bets.best_streak || 0) >= 3 },
        { label: 'Silver', tierClass: 'tier-silver', sub: '5 in a row', unlock: d => (d.bets.best_streak || 0) >= 5 },
        { label: 'Gold', tierClass: 'tier-gold', sub: '7 in a row', unlock: d => (d.bets.best_streak || 0) >= 7 },
      ],
    },
    {
      id: 'odds', name: 'Against All Odds', icon: '🍀', cat: 'betting',
      desc: 'Win a fixed-odds bet at 3× payout or higher',
      tiers: [
        { label: 'Lucky', tierClass: 'tier-on', sub: '3× fixed-odds win', unlock: d => (d.bets.max_odds_win || 0) >= 3 },
      ],
    },
    {
      id: 'tipper', name: 'Big Tipper', icon: '💸', cat: 'betting',
      desc: 'Total NB¥ sent in tips',
      tiers: [
        { label: 'Bronze', tierClass: 'tier-bronze', sub: 'NB¥500 sent', unlock: d => (d.bets.tips_sent || 0) >= 500 },
        { label: 'Silver', tierClass: 'tier-silver', sub: 'NB¥2k sent', unlock: d => (d.bets.tips_sent || 0) >= 2000 },
        { label: 'Gold', tierClass: 'tier-gold', sub: 'NB¥5k sent', unlock: d => (d.bets.tips_sent || 0) >= 5000 },
      ],
    },
    {
      id: 'beloved', name: 'Crowd Favorite', icon: '❤️', cat: 'betting',
      desc: 'Total NB¥ received in tips',
      tiers: [
        { label: 'Bronze', tierClass: 'tier-bronze', sub: 'NB¥500 received', unlock: d => d.tipsReceived >= 500 },
        { label: 'Silver', tierClass: 'tier-silver', sub: 'NB¥2k received', unlock: d => d.tipsReceived >= 2000 },
        { label: 'Gold', tierClass: 'tier-gold', sub: 'NB¥5k received', unlock: d => d.tipsReceived >= 5000 },
      ],
    },

    // === Investing ===
    {
      id: 'floor_trader', name: 'Floor Trader', icon: '📊', cat: 'investing',
      desc: 'Total investment trades made',
      tiers: [
        { label: 'Bronze', tierClass: 'tier-bronze', sub: '5 trades', unlock: d => (d.invest.trade_count || 0) >= 5 },
        { label: 'Silver', tierClass: 'tier-silver', sub: '25 trades', unlock: d => (d.invest.trade_count || 0) >= 25 },
        { label: 'Gold', tierClass: 'tier-gold', sub: '75 trades', unlock: d => (d.invest.trade_count || 0) >= 75 },
      ],
    },
    {
      id: 'in_the_green', name: 'In the Green', icon: '📈', cat: 'investing',
      desc: 'Achieve a positive lifetime realized return',
      tiers: [
        { label: 'Profitable', tierClass: 'tier-on', sub: 'Positive P&L', unlock: d => (d.invest.realized_pnl || 0) > 0 },
      ],
    },
    {
      id: 'moonshot', name: 'Moonshot', icon: '🚀', cat: 'investing',
      desc: 'Best single trade profit',
      tiers: [
        { label: 'Bronze', tierClass: 'tier-bronze', sub: 'NB¥250 profit', unlock: d => (d.invest.best_single_trade || 0) >= 250 },
        { label: 'Silver', tierClass: 'tier-silver', sub: 'NB¥1k profit', unlock: d => (d.invest.best_single_trade || 0) >= 1000 },
        { label: 'Gold', tierClass: 'tier-gold', sub: 'NB¥2.5k profit', unlock: d => (d.invest.best_single_trade || 0) >= 2500 },
      ],
    },
    {
      id: 'bear_raider', name: 'Bear Raider', icon: '🐻', cat: 'investing',
      desc: 'Profit from a short position',
      tiers: [
        { label: 'Shorted', tierClass: 'tier-on', sub: 'Profitable short', unlock: d => !!d.invest.ever_shorted_profitably },
      ],
    },
  ];

  const CAT_LABELS = {
    gm: 'GM Performance',
    longevity: 'Longevity',
    draft: 'Draft',
    development: 'Player Development',
    trades: 'Front Office',
    rivalries: 'Rivalries',
    betting: 'Betting',
    investing: 'Investing',
  };
  const CAT_ORDER = ['gm', 'longevity', 'draft', 'development', 'trades', 'rivalries', 'betting', 'investing'];

  // Parse all the shared (member-agnostic) data once. Cheap to call per page load,
  // and lets computeAchData stay fast enough to run for every member.
  function prepare(raw) {
    const allSeasons = parseCSV(raw.standingsCsv);

    const seasonBests = {};
    const seasonWorstPct = {};
    for (const r of allSeasons) {
      if (!seasonBests[r.SEASON]) seasonBests[r.SEASON] = { maxOff: -Infinity, maxDef: -Infinity };
      seasonBests[r.SEASON].maxOff = Math.max(seasonBests[r.SEASON].maxOff, +r.OFF_RTG);
      seasonBests[r.SEASON].maxDef = Math.max(seasonBests[r.SEASON].maxDef, +r.DEF_RTG);
      const p = +r.PCT;
      if (!(r.SEASON in seasonWorstPct) || p < seasonWorstPct[r.SEASON]) seasonWorstPct[r.SEASON] = p;
    }

    const allTxns = raw.allTxns || [];
    const trades = allTxns.filter(t => t.type === 'trade');
    const signs = allTxns.filter(t => t.type === 'sign');

    const seasonRows = parseCSVQuoted(raw.playerSeasonsCsv);
    const teamBySlugSeason = {};
    for (const r of seasonRows) teamBySlugSeason[`${r.SLUG}|${r.SEASON}`] = r.TEAM;

    const awardRows = parseCSVQuoted(raw.awardsCsv);
    const allNbnLevel = {};
    const allStarSlugs = new Set();
    for (const a of awardRows) {
      if (a.AWARD === 'All-Star') allStarSlugs.add(a.SLUG);
      const m = /All-NBN (First|Second|Third) Team/.exec(a.AWARD || '');
      if (m) {
        const lvl = m[1] === 'First' ? 1 : m[1] === 'Second' ? 2 : 3;
        if (!(a.SLUG in allNbnLevel) || lvl < allNbnLevel[a.SLUG]) allNbnLevel[a.SLUG] = lvl;
      }
    }

    return {
      bios: raw.bios || {},
      allSeasons, seasonBests, seasonWorstPct,
      trades, signs,
      seasonRows, teamBySlugSeason,
      awardRows, allNbnLevel, allStarSlugs,
      ownerRows: parseCSV(raw.ownerStatsCsv),
      h2hRows: parseCSV(raw.h2hOwnersCsv),
    };
  }

  // Compute the achievement data object for one member.
  //   shared    — result of prepare()
  //   perMember — { betsStats, investStats, tipsReceived }
  function computeAchData(member, shared, perMember) {
    perMember = perMember || {};
    const tenures = member.tenures || [];
    const bios = shared.bios;

    const memberSeasons = shared.allSeasons.filter(r =>
      memberWasAtTeamInSeason(tenures, r.TEAM, r.SEASON));

    const hadBestOffRtg = memberSeasons.some(ms => {
      const b = shared.seasonBests[ms.SEASON];
      return b && +ms.OFF_RTG >= b.maxOff - 0.001;
    });
    const hadBestDefRtg = memberSeasons.some(ms => {
      const b = shared.seasonBests[ms.SEASON];
      return b && +ms.DEF_RTG >= b.maxDef - 0.001;
    });

    const regWins = memberSeasons.reduce((sum, s) => sum + (+s.W || 0), 0);
    const champSeasons = memberSeasons.filter(s => s.PLAYOFF_RESULT === 'Champion').length;
    const finalsSeasons = memberSeasons.filter(s => ['Champion', 'Runner-Up'].includes(s.PLAYOFF_RESULT)).length;
    const confSeasons = memberSeasons.filter(s => ['Champion', 'Runner-Up', 'Conf Finals'].includes(s.PLAYOFF_RESULT)).length;
    const playoffSeasons = memberSeasons.filter(s => s.PLAYOFF_RESULT !== 'Missed').length;

    const maxSeasonWins = memberSeasons.reduce((m, s) => Math.max(m, +s.W || 0), 0);
    const playoffYears = new Set(memberSeasons.filter(s => s.PLAYOFF_RESULT !== 'Missed').map(s => seasonStartYear(s.SEASON)));
    const maxPlayoffStreak = longestConsecutiveRun(playoffYears);

    // Draftees: attribute to whoever managed the drafting team the season the draft feeds.
    const myDraftees = [];
    for (const slug in bios) {
      const p = bios[slug];
      if (!p || !p.draft_team || !p.draft_year) continue;
      if (!memberWasAtTeamInSeason(tenures, p.draft_team, draftSeasonStr(+p.draft_year))) continue;
      myDraftees.push({ slug, year: +p.draft_year, round: +p.draft_round || null, pick: +p.draft_pick || null });
    }
    let bestDrafteeAllNbn = 99, stealPick = 0;
    for (const d of myDraftees) {
      if (d.slug in shared.allNbnLevel) bestDrafteeAllNbn = Math.min(bestDrafteeAllNbn, shared.allNbnLevel[d.slug]);
      if (d.pick && shared.allStarSlugs.has(d.slug)) stealPick = Math.max(stealPick, d.pick);
    }
    const top4Years = new Set(myDraftees.filter(d => d.round === 1 && d.pick && d.pick <= 4).map(d => d.year));
    const lotteryStreak = longestConsecutiveRun(top4Years);

    // Player development: awards earned by players while on this member's team.
    let mvpMaker = false, allStarCount = 0;
    for (const a of shared.awardRows) {
      const baseSeason = (a.SEASON || '').split(' ')[0];
      const team = shared.teamBySlugSeason[`${a.SLUG}|${baseSeason}`];
      if (!team || !memberWasAtTeamInSeason(tenures, team, baseSeason)) continue;
      if (a.AWARD === 'Most Valuable Player') mvpMaker = true;
      if (a.AWARD === 'All-Star') allStarCount++;
    }

    // Draft Architect: homegrown players on a championship roster.
    let maxHomegrown = 0;
    for (const c of memberSeasons.filter(s => s.PLAYOFF_RESULT === 'Champion')) {
      let n = 0;
      for (const r of shared.seasonRows) {
        if (r.SEASON !== c.SEASON || r.TEAM !== c.TEAM) continue;
        const bio = bios[r.SLUG];
        if (bio && bio.draft_team === c.TEAM) n++;
      }
      maxHomegrown = Math.max(maxHomegrown, n);
    }

    const lowSeed = memberSeasons.filter(s => +s.SEED_NUM >= 6);
    const cinderellaConf = lowSeed.some(s => ['Conf Finals', 'Runner-Up', 'Champion'].includes(s.PLAYOFF_RESULT));
    const cinderellaFinals = lowSeed.some(s => ['Runner-Up', 'Champion'].includes(s.PLAYOFF_RESULT));
    const cinderellaTitle = lowSeed.some(s => s.PLAYOFF_RESULT === 'Champion');

    const champYears = new Set(memberSeasons.filter(s => s.PLAYOFF_RESULT === 'Champion').map(s => seasonStartYear(s.SEASON)));
    const dynastyStreak = longestConsecutiveRun(champYears);

    const tankathon = memberSeasons.some(s => +s.PCT <= shared.seasonWorstPct[s.SEASON] + 1e-9);

    // Trades / front office.
    let maxFirstsSent = 0, maxFirstsRecv = 0, tradeCount = 0, maxTradeTeams = 0;
    for (const txn of shared.trades) {
      const teamsInvolved = (txn.details && txn.details.teams) || [];
      if (teamsInvolved.some(t => memberAtTeamOnDate(tenures, t, txn.date))) {
        tradeCount++;
        maxTradeTeams = Math.max(maxTradeTeams, teamsInvolved.length);
      }
      let sent = 0, recv = 0;
      for (const tr of (txn.details && txn.details.transfers) || []) {
        const firsts = (tr.assets || []).filter(a => a.type === 'pick' && a.round === 1).length;
        if (!firsts) continue;
        if (memberAtTeamOnDate(tenures, tr.from_team, txn.date)) sent += firsts;
        if (memberAtTeamOnDate(tenures, tr.to_team, txn.date)) recv += firsts;
      }
      maxFirstsSent = Math.max(maxFirstsSent, sent);
      maxFirstsRecv = Math.max(maxFirstsRecv, recv);
    }

    let maxSignValue = 0;
    for (const txn of shared.signs) {
      const d = txn.details || {};
      if (!memberAtTeamOnDate(tenures, d.team, txn.date)) continue;
      const sals = (d.contract && d.contract.salaries) || {};
      let total = 0;
      for (const k in sals) total += parseMoney(sals[k]);
      maxSignValue = Math.max(maxSignValue, total);
    }

    // Rivalries: best / worst all-time head-to-head (min 10 games).
    const myH2H = shared.h2hRows.find(r => r.OWNER === member.name);
    let nemesis = null, punchingBag = null;
    if (myH2H) {
      for (const k in myH2H) {
        if (k === 'OWNER') continue;
        const m = /^(\d+)-(\d+)$/.exec(myH2H[k] || '');
        if (!m) continue;
        const w = +m[1], l = +m[2], g = w + l;
        if (g < 10) continue;
        const pct = w / g;
        if (!nemesis || pct > nemesis.pct) nemesis = { team: k, w, l, pct };
        if (!punchingBag || pct < punchingBag.pct) punchingBag = { team: k, w, l, pct };
      }
    }

    return {
      owner: shared.ownerRows.find(r => r.owner === member.name) || null,
      seasons: memberSeasons,
      regWins, champSeasons, finalsSeasons, confSeasons, playoffSeasons,
      hadBestOffRtg, hadBestDefRtg,
      maxSeasonWins, maxPlayoffStreak,
      bestDrafteeAllNbn, stealPick, lotteryStreak, maxHomegrown,
      mvpMaker, allStarCount,
      cinderellaConf, cinderellaFinals, cinderellaTitle,
      dynastyStreak, tankathon,
      maxFirstsSent, maxFirstsRecv, tradeCount, maxTradeTeams, maxSignValue,
      nemesis, punchingBag,
      bets: perMember.betsStats || {},
      invest: perMember.investStats || {},
      tipsReceived: perMember.tipsReceived || 0,
    };
  }

  function countUnlocked(achData) {
    return ACHIEVEMENTS.reduce((n, ach) =>
      n + (ach.tiers.some(t => { try { return t.unlock(achData); } catch (e) { return false; } }) ? 1 : 0), 0);
  }

  // Highest unlocked tier index per achievement (-1 if locked). Used to detect
  // unlock/upgrade transitions server-side for notifications.
  function tierStatus(achData) {
    const out = {};
    for (const ach of ACHIEVEMENTS) {
      let idx = -1;
      for (let i = 0; i < ach.tiers.length; i++) {
        try { if (ach.tiers[i].unlock(achData)) idx = i; } catch (e) { /* skip */ }
      }
      out[ach.id] = idx;
    }
    return out;
  }

  function renderAchievements(achData) {
    let html = '';
    for (const cat of CAT_ORDER) {
      const group = ACHIEVEMENTS.filter(a => a.cat === cat);
      html += `<div class="ach-cat"><div class="ach-cat-label">${CAT_LABELS[cat]}</div><div class="ach-grid">`;
      for (const ach of group) {
        let unlockedTier = null;
        for (const tier of [...ach.tiers].reverse()) {
          try { if (tier.unlock(achData)) { unlockedTier = tier; break; } } catch (e) { /* skip */ }
        }
        const locked = !unlockedTier;
        const displayTier = unlockedTier || ach.tiers[0];
        const tierClass = locked ? 'tier-locked' : displayTier.tierClass;
        const tierLabel = locked ? 'Locked' : displayTier.label;
        const tierSub = locked ? ach.desc : displayTier.sub;
        let valStr = '';
        if (ach.value) { try { valStr = ach.value(achData); } catch (e) { /* skip */ } }
        const titleText = valStr ? (tierSub ? `${tierSub} — ${valStr}` : valStr) : tierSub;
        html += `<div class="ach-card${locked ? ' locked' : ''}" title="${esc(titleText)}" tabindex="0">
          <span class="ach-icon">${ach.icon}</span>
          <div class="ach-name">${esc(ach.name)}</div>
          <span class="ach-tier ${tierClass}">${esc(tierLabel)}</span>
          <div class="ach-info">${esc(titleText)}</div>
        </div>`;
      }
      html += `</div></div>`;
    }
    return html;
  }

  const api = {
    ACHIEVEMENTS, CAT_LABELS,
    total: ACHIEVEMENTS.length,
    prepare, computeAchData, countUnlocked, tierStatus, renderAchievements,
  };
  // Browser pages read window.NBNAch; the server-side notifier require()s this file.
  if (typeof window !== 'undefined') window.NBNAch = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
