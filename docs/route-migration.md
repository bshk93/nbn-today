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

## Lowercase team URLs

`stats/teams/atl -> ATL` (30 symlinks) keep `/stats/teams/atl/` working, as
`teams/atl` did. The old `teams/atl` links still point at `teams/ATL`, which is
now a stub, so `/teams/atl/` forwards as well.

## nbn-api (branch `claude/vigilant-hawking-hog4b2` in that repo)

Ships **before** the site:

- `tests/test_rulebook_coverage.py` reads `nbn-today/about/rulebook/index.html`.
  Against the old path it would read a stub, find no sections and fail.
- `routers/og.py`: `_static_head` reads the moved shells (`/stats/players/`,
  `/stats/boxscores/`, `/history/recap/`), and every card's `og:url` is the new
  address. `tests/test_og.py` follows.
- Every link the API writes (Discord embeds, inbox `link`s, the bet and
  Pick'em posts, Perry and Poeltl) points at the new address, so nothing
  hops through a stub. The Discord bot's slash commands (`/standings`,
  `/h2h`, `/compare`, `/champions`, `/awards`) are command names, not URLs,
  and were left alone.

Links already stored in old inbox messages and old Discord posts keep the old
paths, and keep working through the stubs.

## nginx (by hand, on the box)

The `$nbn_unfurler` map and its location blocks are not in either repo. In
`/etc/nginx/sites-enabled/nbn.today` (a real file, not the `sites-available`
copy), and in `pdc.nbn.today` if it carries the same blocks:

1. Find the location blocks that hand unfurlers to og.py:
   `grep -n 'og/' /etc/nginx/sites-enabled/nbn.today`
2. For the three that moved, add a block for the new path next to the old one,
   identical apart from the path. Keep the old blocks, so old links still
   unfurl with the right card. The new paths are:
   - `/players/` → `/stats/players/` (→ `/api/og/player`)
   - `/boxscores/` → `/stats/boxscores/` (→ `/api/og/boxscore`)
   - `/recap/` → `/history/recap/` (→ `/api/og/recap`)

   `/news/view/`, `/proposals/view/` and `/members/` did not move.
3. Any other `location` that names a moved page path needs the same treatment:
   `grep -nE 'location[^{]*/(teams|players|boxscores|recap|rulebook|draft|standings|calendar|bet|invest|tradeblock|free-agency|transactions|memos|changelog|inbox)' /etc/nginx/sites-enabled/*`
   The CSV and `/data/*.json` rules do **not** change.
4. `sudo nginx -t && sudo systemctl reload nginx`. Never reload without
   `nginx -t`: this is the one step here that can take the site down.
5. Check: `curl -sA Discordbot 'https://nbn.today/stats/players/?p=curry-stephen' | grep og:title`
   should name the player, not "Players".

## Deploy order

1. nbn-api: merge, then `deploy.sh` (it restarts the service).
2. nginx: the steps above.
3. Site: merge, then `deploy.sh`.

If the site goes out before nginx, nothing breaks. Only new-path player,
box score and recap links show the generic card until step 2.
