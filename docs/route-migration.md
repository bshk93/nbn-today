# Route migration: every page under its sidebar section (0.15.0)

On 2026-10-26 every page moved to the URL prefix of the sidebar section it
belongs to (`nav.js` `NAV_SECTIONS`), so the address matches the menu:
`/trivia` became `/games/trivia`, `/teams/ATL` became `/stats/teams/ATL`.

## The map

| Section | Prefix | Pages moved under it |
|---|---|---|
| Season | `/season/` (card landing page) | calendar, standings, injuries, award-race (was `/awards/race`) |
| Front Office | `/fo/` (card landing page) | tradeblock, free-agency, extensions, transactions, transaction-sim, cap-summary, finances |
| History | `/history/` (card landing page) | season-summary, champions, hof, awards (with each season's pages), recap, draft (with live, guide, pick) |
| Stats | `/stats/` (the Stat Lab, as before) | teams (all 30), players (with its sub-pages), compare, ratings-changes, owners, h2h, frivolities, boxscores (with submit) |
| NB¥ Corner | `/nbyen/` (Balances, as before) | bet, invest (with fair), donations |
| Games | `/games/` | perry, poeltl, trivia, tetris |
| Media | `/media/` | nbntv-classics, nbnfl |
| About | `/about/` | roles, constitution, rulebook, changelog, inbox, join |
| League Office | `/office/` | suggestions, memos (each memo too), cap-settings, strikes, backlog |

**Not moved:** `/news`, `/proposals`, `/members` (their per-item Discord cards
are routed by path in nginx and nbn-api, so they wait until that side moves),
`/committees` (already nested), the homepage, `/stats/seasons|totals|highs`
(already under their prefix), and `/nbyen/` itself.

**Data URLs did not move.** CSVs such as `/standings/standings-history.csv`,
`/players/player_seasons.csv` and `/nbntv-classics/playoff-classics.csv` are
served by nginx out of `$NBS_DATA_DIR/public` and have nothing to do with where
the pages live. Don't "fix" them to the new prefixes.

## Old URLs

Each old page path keeps an `index.html` redirect stub. The stub forwards to the
new path with `location.replace`, keeping `?query` and `#tab` (with a `<meta
refresh>` fallback), and carries `<meta name="nbn-moved" content="/new/path/">`.
`build/og_tags.py` reads that meta and gives the stub the card of the page it
forwards to, so an old link pasted in Discord still unfurls properly. The stubs
predating this move (`/schedule`, `/pickem`, `/trade-sim`, `/rookie-scale`,
`/trade-retros`, `/pdc`, `/stream`, `/nbnfl/CIN`, `/stats/highs/*`,
`/stats/totals/*`) were repointed straight at the new paths, so nothing hops twice.

Don't delete the stubs: links to the old paths live on in Discord history.

## Server-side follow-up (not in this repo)

The site works without any of this, because every old link goes through a stub.
What's missing until it lands is the per-item Discord card on the **new** URLs
of the moved per-item pages.

1. **nbn-api `routers/og.py`.** Accept `/stats/players/`, `/stats/boxscores/`
   and `/history/recap/` alongside the old paths, and emit the new path in
   `og:url`. Discord embeds that link the site (`discord_notify.py` and similar:
   team, player and rulebook links) should move to the new paths. Until they
   do, they still work through the stubs.
2. **nginx, `nbn.today` *and* `pdc.nbn.today`.** Edit
   `/etc/nginx/sites-enabled/nbn.today`, which is a real file, not the
   `sites-available` copy. The `$nbn_unfurler` rules that hand `/players/`,
   `/boxscores/?game=` and `/recap/` to og.py need the new prefixes added.
   Keep the old ones, so old links still unfurl. Any other path-specific
   `location` rule that names a moved page needs the same.
3. **Order:** nbn-api first, then nginx, then the site. That's the usual
   API-first rule.
