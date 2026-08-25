# NBN — Resolved Backlog Items

Closed-out entries moved out of `BACKLOG.md` to keep the active list lean.
Same struck-through-title convention; each keeps its resolution summary and,
where useful, the original problem statement below it.

---

### ~~[P2] Pre-commit hook only fills the *top* changelog entry~~ — DONE 2026-08-25
All three gaps closed in `build/hooks/pre-commit`, and the five stuck entries
repaired.

- **Every** pending entry is filled now, not just index 0.
- The bump is skipped outright when no entry is pending — a docs-only commit
  no longer advertises a version `/changelog` has nothing for.
- `version.json` counts as a manual bump only when it is staged **and** differs
  from HEAD. Staged-but-unchanged was the third gap, and it is what produced
  two 0.1.81 entries.

The five stuck entries were each added by the same commit as the entry directly
above them, confirmed one at a time against that commit's `version.json` diff —
so each takes its sibling's number rather than a guessed one:

    idx 129, 130  2026-07-24  0.0.370  (d00b8e6)
    idx 150       2026-07-15  0.0.351  (ed3aa53)
    idx 176       2026-06-25  0.0.326  (ce814ae)
    idx 184       2026-06-23  0.0.315  (e6108f3)

Zero pending entries remain. Tested against a throwaway repo before the hook
went near a real commit: normal commit, docs-only, two entries in one commit,
`version.json` staged unchanged, a real manual minor bump, and a retroactive
changelog-only fix — six cases, all behaving.

**One inherited behaviour left deliberately:** the retroactive branch stamps a
resurrected `pending` entry with the *current* version, not the historical one
it belonged to — the hook has no way to know the latter. Repairing an old entry
therefore means writing its real number directly, which the hook then leaves
alone (no pending entry, early exit). That is how the five above were fixed.

The original entry:

`.git/hooks/pre-commit` sets `changelog[0]['version']` if it's `"pending"`.
A commit that adds two entries, or adds one below the top, leaves `"pending"`
in the file forever. The same five entries are stuck, identified by date —
**do not record their indices here, they shift every commit** (these five were
listed as idx 9, 10, 30, 56, 64 on 2026-08-04 and are idx 14, 15, 35, 61, 69 as
of 2026-08-07, purely from new entries landing on top):

    2026-07-24  ×2  "Team pages: renamed the Overview tab to Roster…"
                    "Draft Picks table: fixed Stepien lock indicator…"
    2026-07-15      "Move the team Salaries chart from Frivolities…"
    2026-06-25      "draft: show '→ TEAM' when draft rights were traded…"
    2026-06-23      "Achievements now award NB¥ on every unlock…"

Fix: fill in *every* pending entry, not just index 0. Then repair the five
(they can be dated back to the commits that introduced them via `git log`).

**Third gap, hit live on 2026-08-24 while committing this very review:** when
`version.json` *is* staged, the hook takes the "manual minor/major bump" branch
and skips the bump — but then still fills a `"pending"` changelog entry with
whatever `version.json` currently says. Staging `version.json` unchanged (an
easy thing to do deliberately, to dodge the second gap below on a docs-only
commit) therefore stamps the new entry with the version that already shipped:
the changelog came out with **two 0.1.81 entries**, and the newest release had
no number of its own. Corrected by hand. The two branches disagree about what
"already staged" means — one reads it as "the author set the version", the
other as "the version is new" — and only the first is true.

**Second gap, same hook (found 2026-08-09):** it bumps `version.json` even when
there is *no* pending entry to stamp. A docs-only commit — BACKLOG, CLAUDE.md, a
spec — therefore advertises a new version on the homepage that `/changelog` has
no entry for. Hit it on `bb821f8`, which took the site to 0.0.401 with the
changelog's newest at 0.0.400; corrected by hand. Fix: skip the bump when
`changelog[0]['version'] != "pending"`, since that is exactly the case where
nothing user-facing shipped.

---

### ~~[P3] PDC dashboard boots with an uncaught rejection if any fetch fails~~ — DONE 2026-08-25
Everything in `boot()` past the role gate now runs inside a `try/catch` that
falls back to `renderGate('offline')` — the same screen a failed `/auth/me`
already produced. The catch re-hides `#app`, `#howto` and `#poext` first,
because `renderGate` draws into `#gate` above them and would otherwise read as
a banner over a half-drawn dashboard.

`poextReload` keeps its own inline banner for a PO-EXT fetch failure; that is a
working panel reporting one bad section, not a broken boot, so it deliberately
does not reach the new catch.

Verified by syntax check and by confirming the three element ids exist. Not
driven in a browser — `/pdc` needs a real session and neither jsdom nor the
puppeteer package is installed on this box.

The original entry:

`pdc/index.html`'s boot does `await Promise.all([...])` over `/fa/state`,
`/fa/pool`, `/players`, `/ovr/current`, `/team-map` with **no `catch`**. Any one
of them failing leaves the page half-rendered — header and "How this works"
panel drawn, no board, no queue — plus an unhandled rejection in the console and
no message to the viewer. The realistic trigger is a role revoked mid-session or
an API hiccup, since `/api/auth/me` has already resolved by then and the gate
has passed.

Note `/auth/me` itself *is* handled (it renders the "can't reach the league API"
gate), so this is specifically the second wave of fetches. `renderGate('offline')`
already exists and is the obvious thing to reuse. Found 2026-08-09 while building
a test harness against the dashboard, not in real use.

---

### ~~[P3] Retire season-summary's league-history workaround~~ — DONE 2026-08-25
Removed. `season-summary/index.html` now takes the legacy rows straight off
`league-history.csv` with a plain season filter; the per-season dedup map and
the CHAMPION-from-brackets override are gone.

Verified against live data before removing: the CSV has 6 rows, one per season,
and every CHAMPION already matches its ROUND 4 bracket winner (20-21 ATL,
21-22 ATL, 22-23 PHX, 23-24 CLE, 24-25 PHX, 25-26 ORL). Replaying both the old
and the new code against the real files gives byte-identical rows, so nothing
on the page moves.

The original entry:

`season-summary/index.html` deduplicates league-history rows by season and
overrides CHAMPION from bracket data, calling them "CSV join artifacts". The
cause is now known and fixed in the Python build (R counted playoff wins per
player row). The cutover landed 2026-08-19, so `league-history.csv` now has 6
rows — one champion per season, each matching the finals bracket winner — and
**that workaround is dead code today**: it deduplicates rows that no longer
duplicate and overrides a CHAMPION that is already right.

---

### ~~[P3] The data backup commits 144 no-op snapshots a day~~ — DONE 2026-08-23
`poopoo.py` rewrote `poopoo.json` on every 10-minute run whether or not the
diff had changed, and `nbs-snapshot` committed each rewrite. Re-measured on the
day it was fixed: **558 of the backup's 646 commits** were one changed line,
`generated_at`, and nothing else — 87% of a history whose reason for existing
is that you can read it to spot logical corruption.

Fixed by `write_report` in `build/poopoo.py`: the report is written only when
its content minus `generated_at` differs from what is already on disk. Freshness
is preserved without a diff — the file's mtime is bumped on every run either
way, so nginx's `Last-Modified` says when the job last *ran* while
`generated_at` now says when the answer last *changed*. `/poopoo` reads both,
and shows "Unchanged since …" when they differ.

The 558 commits already in the backup are left alone; rewriting that history
would cost more than it returns, and it stops growing today.

**Confirmed holding, 2026-08-24.** The measurement above was taken the day of
the fix; this is the day after. The backup was committing 128–143 times a day
through 2026-08-22, with 38 of the last 40 commits touching `poopoo.json` and
nothing else. Since the fix landed at 20:57 on 2026-08-23 there have been
**zero** snapshot commits, and `poopoo.json`'s `generated_at` has sat at 15:50
while its mtime keeps moving. The history is readable again.

### ~~[P2] PDC dashboard — committee review pipeline~~ — DONE, and now in use 2026-08-24
**Closed 2026-08-24 on verification, not on the build being finished** — the
build was done on 2026-08-09 and this entry stayed open on its own two
conditions, both of which are now met:

- **`fac` / `fac_head` are granted.** 13 members hold `fac`, 2 hold `fac_head`
  (Jonny, chuck), 3 hold `agent`. The "nobody holds these roles" note below is
  stale.
- **The pipeline is open and has run.** `fa-state.json` reads `mode: "ffa"`,
  not `closed`; 85 players have been through it (82 rounds closed, 3 open),
  with real ballots finalized. The "it is `closed` today" paragraph below
  described the state on 2026-08-09.

Original entry, for the record:

Owners submit trades / FA offers / extensions for committee approval, reviewed
on `pdc.nbn.today`. Full spec for the **free agency** half in
`docs/pdc-free-agency-spec.md` — data model, endpoints, Discord gates, and an
8-phase build order where nothing before Phase 7 is visible to a logged-out
visitor. Trades and extensions reuse the shape later.

15 decisions settled, no design questions outstanding — session cookie on
`.nbn.today` for cross-subdomain auth (scoped to `/api/fa/*` only); GM drafts an
offer, owner submits; FFA's 24h clock closes the offer window; submission final
per § 3.14 except that any sub-committee member may **remand** an offer back for
revision.

**All 8 phases built** (0–6 on 2026-08-08, 7–8 on 2026-08-09): roles, the
server-side FA pool, the whole offer/ballot API, `teams/lineup.js`, the session
cookie, the dashboard, its own host at **`pdc.nbn.today`** — same docroot,
`/` → `/pdc/index.html`, so every fetch stays same-origin — the two Discord
feeds (both channels set and live in the running process), the team-facing ⋯
menu and offer form on `/free-agency`, and the 1,000-ball ballot with
per-player finalize/unlock.

**Nothing is left to build. The pipeline opens when the FAC head sets `mode` to
`rounds` or `ffa`** — it is `closed` today, so every offer menu reads "Free
agency is closed." and `POST /api/fa/offers` 422s.

Built since (2026-08-12/13), none of it reflected in the 2026-08-10 review:

- **§ 4.7 agent stage** — a third role (`agent`) between a closed offer window
  and a sub-committee ballot: claim off a shared queue, negotiate, then advance
  or finalize. A claim permanently bars the agent's own team from bidding on
  that player. Documented in CLAUDE.md; spec in `docs/pdc-free-agency-spec.md`.
- **§ 4.3b void/restore** — head-only, reason required, `voided` simply left out
  of `LIVE_STATUSES`. `tests/test_fa_offers.py`.
- **`ffa-extend`** — the one path allowed to move a single player's deadline.
- **Member inbox** — `routers/inbox.py` (`GET /api/inbox`, read / read-all) and
  `/inbox`. Closes the "Member inbox system" suggestion on the member board.

The dashboard is now in the Ctrl+K jump box as "PDC Committee", role-gated via
`ROLE_PAGES` in `nav.js` — resolved lazily when search is first opened, and not
at all for a logged-out visitor, so nav.js still makes no request on an ordinary
page load.

One thing to do before the first round:

- **Nobody holds `fac` or `fac_head`** (checked 2026-08-09 — `bryn` is the only
  member with any of these roles, as `admin`). Admin passes every head check, so
  the board is operable today, but **admin does not get a ballot**: `cast_ballot`
  gates on being *assigned*, not on a role, so even admin has to put themselves
  on a sub-committee to vote. Grant the real roles at `/members/`.

### ~~[P1] No `extension` transaction type at all~~ — Phase A + E shipped 2026-08-21
`"extension"` is now in `_VALIDATORS`, the `create_transaction` type whitelist,
and `_detail_models`. `POST /api/validate/extension` and `POST /api/transactions`
(type=`extension`) both work against real production data — see
`nbn-api/docs/extensions.md` for the check list and `nbn-api/tests/test_extensions.py`
for the boundary tests. Eligibility derivation reuses `_bird_tenure`'s ledger
walk (including its synthetic draft-event seed), which is what let this ship
without the ledger backfill below as a prerequisite (D1 in the pipeline doc).
Cap thresholds for 27-28+ are still zero in Cap Settings, so
`extension_cap_position` correctly reports "cannot evaluate" until the
committee enters real figures — that's the one thing still actually blocking
a *real* extension from being scored end-to-end, not a code gap.

**Everything this paragraph listed as still open has since shipped** (all on
2026-08-21, each closed in its own entry): the Extension mode in
`/transaction-sim` and the office form at `/transactions`; the `/api/poext/*`
committee pipeline (Phase C) and the `/extensions` team-facing page (Phase D);
and the § 4.5 six-month trade-freeze check in `_validate_trade` (Phase F).

**The one residual was split out rather than lost** — the zeroed 27-28+ cap and
apron thresholds noted above are now their own `[P1]` entry in `BACKLOG.md`,
since retiring this entry would otherwise have buried the only thing still
stopping a live extension from being scored. Original text of the paragraph
referred to below. See
`docs/poext-extension-pipeline.md` § 7 for the full phase list.

### ~~[P2] No Extension mode in `/transaction-sim` or the `/transactions` office form~~ — shipped 2026-08-21
Both now call `POST /api/validate/extension`. `transaction-sim/index.html` got
a fourth "Extension" tab (its own form, not a variant of the signing one — an
extension adds years on top of a live contract rather than replacing a
current-season figure). The office form at `/transactions` got a real
Extension type: team is derived from the roster once a player is picked
(§ 6.2 — only the incumbent may extend, same as `sign_pick`/`convert_twoway`),
and picking a player calls the validator with an empty contract purely to
read back the existing deal and seed the first salary row at the correct
starting season (§ 6.2 rule 10). The live rubric and its EAPS-field reveal
generalize for free — `_extension_fact_sheet` now carries `trailing_hold`
(reusing `_preview_fa_hold`, same as a signing), closing the same "office form
can ask for an EAPS answer it has nowhere to collect" gap fixed for
`sign_pick`/`convert_twoway` on 2026-08-11/12. Verified end-to-end in a real
headless browser against production (`barlow-dominick`/SAS) on both pages.

### ~~[P2] The `/pdc` PO-EXT committee pipeline is still a stub~~ — shipped 2026-08-21
`routers/poext.py`: proposals, the agent stage (claim/release/advance/
return-to-agent), sub-committee assignment, accept/reject voting, finalize/
unlock, `GET /api/poext/eligible` and `GET /api/poext/proposals`. `/pdc`'s
PO-EXT panel is a real dashboard, `/extensions` is the team-facing proposal
page, and the roster page's ⋯ menu has a "Propose extension…" shortcut into
it. Private `pdc-alerts` Discord posts on submit/remand/void/restore/
finalize. 76 tests across `test_extensions.py`/`test_poext.py`/
`test_poext_notify.py`.

~~§ 4.5's six-month trade-freeze check isn't wired into `_validate_trade`~~ —
shipped 2026-08-21, `_check_extension_trade_restriction` in `transactions.py`,
15 tests in `test_extension_trade_freeze.py`.

~~No public Discord announcement on an agreed extension~~ — shipped 2026-08-21
(D9): `poext_notify.notify_player_finalized` posts full detail to
`pdc-alerts` always, and on `outcome == "agreed"` also posts to `#roster-log`
(full detail, via `roster_log_relay._send`) and `fa-news` (name-only, no team,
no `$`, through the sole `_news()` choke point). 26 tests in
`test_poext_notify.py`.

Two more real bugs found in a follow-up audit (2026-08-21), both fixed and
deployed same day:
- `_extension_eligibility_check` scored a `trade_floor`-basis (lower-bound-
  only) short derived length as a hard fail instead of "can't confirm" —
  32 real rostered players, including Tyler Herro, read as ineligible off
  a ledger gap rather than a real disqualification. Now warns and allows
  when the basis isn't definite (`test_extensions.py`).
- Neither `_validate_extension` nor `_apply_extension` checked that the
  `team` field in the request actually holds the player — every sibling type
  (`_apply_sign`, `sign_pick`, `convert_twoway`) does. A wrong-team request
  would have priced and applied an extension against a player on someone
  else's roster. Both now refuse with a named-holder 422/check
  (`test_apply_extension.py`, `test_extensions.py`).
- `discord_notify.py` had no `"extension"` case at all — an agreed extension
  posted nothing (or malformed) to `pdc-alerts`. Fixed, tested
  (`test_discord_notify.py`).

**Real remaining gaps**, not just polish:
- The extend-and-trade mechanism (§ 2.11 — Team A proposing on Team B's
  behalf) is unbuilt; `kind="extend_and_trade"` is reserved but has no
  submission path of its own.
- Cap thresholds for 27-28+ are still $0 and EAPS is still unset in Cap
  Settings, so `extension_cap_position` and the 140%-of-EAPS branch of
  `extension_max_year1` report "cannot evaluate"/warn on every real
  extension until the committee enters real figures — a data gap, not code.
- § 6.3's rookie-scale and non-expiring-veteran windows need a regular-
  season start date the system doesn't track anywhere (shared gap with
  § 3.12 proration); only the expiring-veteran June 30 deadline is enforced.
- Committee rulings still needed (`docs/poext-extension-pipeline.md` § 8):
  Q3 (when 140%-of-EAPS applies instead of prior-salary), whether the
  3-proposal cap applies outside the expiring-veteran bucket, and what
  exactly defines an extend-and-trade.
- The ledger backfill (`[P3]` below) is still unrun — lower urgency now that
  both "no record" and `trade_floor` bases correctly warn-and-allow rather
  than block.

### ~~[P1] Nothing backs up NBS_DATA_DIR — the league's whole state is single-copy~~ — DONE 2026-08-18
Closed by the dev-deploy spec's Phases 0-1: `/var/lib/nbs-backup.git` (git dir
outside the work tree) commits the classified set every 10 minutes via
`nbs-snapshot.timer` and pushes to the private `bshk93/nbn-data`, with a
mass-deletion guard that refuses rather than mirroring a wipe. The "cause
unconfirmed" gaps this entry wanted to turn into a `git diff` now are one.

**Both of the pieces this entry left open are now closed too** — re-checked
2026-08-24, which is why it moved out of `BACKLOG.md`:

- **Second destination** (item 11): `nbs-drive-backup.timer` exists and runs
  weekly, last fired 2026-08-23.
- **Restore drill** (item 14): done 2026-08-19 and it passed — a bare clone of
  the backup rebuilt all 86 derived CSVs byte-identically, which is also the
  proof that the tracked set is complete.

Logical corruption is separately covered as of 2026-08-19 by the append-only
guard and `nbs-integrity.timer`. Original entry follows.

Entered 2026-08-16. The "disk failure loses ~4 weeks of work" risk was closed
below for the two **git repos**. The data those repos are meaningless without
never had that protection and still doesn't.

Verified 2026-08-16 — no backup job exists anywhere (`crontab -l`,
`systemctl list-timers`: perry, poopoo, achievements, dota2stats, certbot,
nothing that copies `/var/lib/nothing-but-stats` off this disk). Single copies
of `transactions.json` (2.0 MB — the only record of how every contract and pick
got where it is), `player-bios.json` (664 KB), `fa-offers.json` (672 KB),
`members.json` (61 members and their tokens), `team-state.json`,
`ovr-history.json`. The nearest thing to a backup is five hand-made `.bak-*`
files, newest **2026-07-15** — which this file already lists as a P3 *"which one
is real?"* trap.

**What the risk is not:** torn writes. `storage.py:_atomic_write` does tmp-file
+ `os.replace` for every write in the API (0 direct `json.dump()` call sites
outside it), so readers never see a half-written file. The exposure is a bad
*logical* write — a migration script, a hand-fix, a bulk re-key like the 29
first-last slugs above — and hardware.

Cheapest fix: a nightly `git commit` of the JSON/CSV subset into a private
snapshot repo, with the `.rds`/`allstats` bulk (~90 MB, rarely changes) tar'd
weekly instead. Total is ~100 MB, so retention is a non-issue.

**Second payoff, and the reason to rank this first:** §1 above currently says of
the poopoo cap diffs *"most of that gap closed between that review and this one,
cause unconfirmed."* Daily snapshots turn that into a `git diff`. Same for the
27-28/28-29/29-30 scales that were entered with cap and aprons at 0 — you would
be able to see when, and in which save.

### ~~[P2] 29 first-last player slugs re-keyed — the last 2 closed post-FFA~~ — DONE 2026-08-24
**The last 2 are done 2026-08-24.** `jamaree-bouyea` → `bouyea-jamaree` and
`ariel-hukporti` → `hukporti-ariel`, once both FFA rounds finalized
(`fa-ballots.json` locked 2026-08-19; Bouyea has since signed with MIA on the
18th). 31 references across 13 files: `player-bios.json`, `ovr-history.json`,
`transactions.json` (6), `fa-offers.json` (7), `fa-state.json`,
`fa-ballots.json`, `inboxes.json`, `bio-rewards.json`, `poopoo.json`,
`player-attributes.json` (key only), `mia-roster.csv`, `phx-roster.csv`,
`sac-deadcap.csv`. Backups `*.bak-rekey2-20260824-010951`; `nbn-api` was
stopped for the write so nothing could land a concurrent update.

**Six files the 2026-08-16 pass never had to touch**, because these two were
the only held-back players and they were the ones with live FA state:
`fa-offers.json`, `fa-state.json`, `fa-ballots.json`, `inboxes.json`,
`bio-rewards.json` (composite `slug:field` keys) and `poopoo.json`. Two prose
strings were rewritten along with the references — a frozen validator message
in `fa-offers.json` and two inbox notifications — on the grounds that a dead
slug in a message a member reads is a reference that no longer resolves, not a
historical fact worth preserving.

**Verified end to end**, not just by grep: all 13 files still parse, every diff
against its backup is slug-lines-only (0 non-slug changed lines in any file),
the live API serves both new keys on `/api/players` and `/api/ovr/current`, and
`GET /api/players/hukporti-ariel/gamelog` returns his 5 playoff games — the
split card is healed at the join, not just in the bio. Simulating
`players/index.html`'s card build against live data gives **1 card each**, and
a league-wide scan for the same shape (a bio whose reversed slug is a stats
slug) returns **zero**. Separately, all **1,034** bio keys now equal
`slugify(name)` exactly, so the population is closed, not merely reduced.

**Left as-is, deliberately** (same call as the first pass):
`discord-fa-signings-resolved.json` and `discord-fa-signings-submitted.json`
still carry old-form refs. They are offline backfill bookkeeping, never read at
request time, and `-submitted.json`'s keys are idempotency keys — rewriting one
file and not the other would desync the dedupe and re-submit. The 27 players
from the first pass are old-form in there too; these 2 now match them.
`player-attributes.json`'s `source_slug` stays untouched for the original
reason — it is 2K's own site slug.

---

Original entry, for the record:

**Done 2026-08-16.** 27 of the 29 mis-keyed slugs (e.g. `keaton-wallace` →
`wallace-keaton`, `mark-sears` → `sears-mark`) were re-keyed in one scripted
pass across `player-bios.json`, `ovr-history.json`, `transactions.json`,
`player-attributes.json`, 15 roster CSVs and 4 dead-cap CSVs. Every file was
backed up first (`*.bak-rekey29-20260816-130436` in NBS_DATA_DIR); verified
afterward that zero old-form keys remain in any of them and the live API
serves the corrected slugs. `player-attributes.json`'s `source_slug` field
was deliberately **not** touched — it's 2K's own site slug, not ours, and
happened to share the same first-last shape by coincidence.

**Held back:** `jamaree-bouyea` and `ariel-hukporti` — both were mid-FFA-clock
at the time (deadline 2026-08-17), with live team bids in `fa-offers.json`
and `fa-state.json`. Re-key those two once that window closes; same script,
just the remaining 2-entry mapping.

**Scope was larger than this entry originally documented** — discovered
5 live dead-cap CSVs and `player-attributes.json` (drives Team Settings'
"Primary Position") that the original writeup missed entirely. Two Discord
backfill bookkeeping files (`discord-fa-signings-resolved.json`,
`discord-transactions-promoted.json`) also carry old-form refs but are
offline-script-only, never read at request time — left as-is.

**The generator is fixed as of 2026-08-10** — `slugFromName` in
`players/index.html` was running `displayName()` (which flips "LAST, FIRST" →
"First Last") *before* slugifying, so the Add Player modal minted a first-last
key every time. That is why this population kept regrowing after the 2026
prospect re-key closed it. The form now slugifies the canonical name in place
(verified: reproduces all 989 correct slugs exactly) and uppercases/normalizes
the name on save.

**Remaining risk is scoped to the 2 held-back players.** `ariel-hukporti`
already had 5 playoff games land under the box-score-derived key
`hukporti-ariel` before this pass — the split-card symptom (stats card with no
contract/cap holds/OVR/roster link, bio card with no stats) — and will keep
splitting further until its re-key happens post-FFA. `jamaree-bouyea` has no
stats history yet, so its cost of waiting really is zero.

### ~~[P2] Two different answers to "what season is it?" (was three)~~ — DONE 2026-08-21
Found 2026-08-19 while building the box score integrity check. Three
independent definitions of the season boundary existed and did not agree:
`nbn-api` `stats_build/buildargs.py` (Sep 30, America/New_York), `nbn-api`
`storage._current_season_str` (Jul 1, UTC), and a hardcoded string in
`boxscores/submit/index.html`. Confirmed live-disagreeing as of 2026-08-21
(today: the first two read "25-26" vs "26-27") — one build day away from
`POST /api/boxscore/commit` writing a file the build couldn't find.

Fixed by unifying all three into `season_clock.py` (new, nbn-api repo root):
one July-1 default, one override store (`league-state.json`, BOD-settable via
`PUT /api/league-year/{season}`, same mechanism the league year already had).
There is no more separate "stats clock" — `_current_league_year()` and
`stats_build.buildargs.resolve_season()` both delegate to it, and the submit
form now reads its default off `GET /api/league-year` instead of a hardcoded
string. `season_clock.DATA_DIR` still honors `NBS_DATA_DIR`, so a scratch-dir
build reads that copy's rollovers rather than the live league's.
`tests/test_season_clock.py` (nbn-api) pins the boundary math and the
rollover-override path.

### ~~[P2] § 3.12 minimum-scale years escalated in the model but not in the league's own sheet~~ — REVERSED 2026-08-13
Jamison Battle's ATL `sign` (txn `c90cd99d35ad3cc0`, `minimum`, § 3.12) had gone
through with a fully empty contract — see the DONE item below — and was
hand-corrected to a 2-year deal: 26-27 guaranteed $2,449,421, 27-28 player
option $2,664,401, `years_experience: 2`, plus the § 3.10 trailing UFA hold
(Early Bird tier, via `_autofill_fa_hold_amounts`) for 28-29 at $3,463,721.

$2,664,401 is the tier-**2** figure for 27-28, flat off the declared
`years_experience: 2` — not tier **3** ($2,756,912), which is what
`_check_minimum_salary` used to compute by escalating one tier per contract
year off the anchor (the "pure function of (first season, years of
experience, scale)" model settled 2026-08-10). Checked against the league's
live source of truth — the **"NBN Rosters and Salaries 2026-27"** Google
Sheet — which already carried Battle's row at exactly `$2,449,421 |
$2,664,401 | $3,463,721`. Flat, not escalating, is the real convention.

Treated Battle's contract as the barometer and reversed the model rather than
the data: `_contract_years_exp` (`nbn-api/routers/transactions.py`) no longer
adds one year of experience per elapsed contract year off the declared
anchor — it returns the declared `years_experience` unchanged for every
season of that contract. A multi-year minimum still raises year over year;
that now comes entirely from each season's own § 3.12 scale table moving
(cap growth), not from the tier climbing. The draft_year proxy fallback
(no `years_experience` declared) is untouched — it still climbs naturally,
because that's real elapsed calendar time, not a contract-year count.
`tests/test_minimum_contract_raises.py` rewritten to pin the flat behavior
(previously pinned the escalating one); full suite green. Verified live:
`POST /api/validate/sign` on Battle's actual contract now reports
`minimum_salary: passed=true` with no tier warning.

### ~~[P1] `sign` accepts a contract with zero salary years~~ — DONE 2026-08-13
Discovered from the Battle signing above: `_apply_sign` (`nbn-api/routers/
transactions.py`) never checked that `contract.salaries` was non-empty before
writing it. A `sign` submitted with `salaries: {}` silently succeeded — no
year got added to the bio, `cap_holds` got *replaced* with whatever was sent
(so an empty submission also erased any existing cap hold on the player), and
the player sat on the roster with no salary at all until someone noticed.

`_check_minimum_salary` had the same hole from the validator side: its loop
is `for yr, raw in (contract.salaries or {}).items()`, so zero years meant
zero iterations, and it fell through to `passed=True, "Every contract year
meets the § 3.12 minimum salary"` — a lie when there were no years to check.
Same vacuous-pass shape as the `_require_validatable`/`_require_trade_validatable`
bugs already fixed for `/api/validate/trade`.

`offer_sheet` already guarded this (`_apply_offer_sheet` hard-rejects `len(
salaries) < 2` per § 3.15's 2-year minimum); plain `sign` had nothing. Fixed
with a `contract_has_salary_years` error `CheckResult` in `_validate_sign`
(so the office's live rubric catches it before submit) plus the same guard
as a hard 422 in `_apply_sign` (the rubric is advisory; the real gate has to
be at apply time). `tests/test_sign_requires_salary.py` pins both the failing
and the passing case through the real `/api/validate/sign` endpoint.

Also fixed while in this code: the office's contract form used to hide the
Year-1-+-raise% contract helper entirely for `signing_method: "minimum"`,
which is how a minimum signing ended up hand-typed one row at a time with
nothing pre-filled — the direct path to submitting empty. § 3.12 pricing is a
pure function of (season, years of experience, scale), so the minimum method
now gets its own generator (`min-contract-helper` / `generateMinimumContractRows`
in `transactions/index.html`) — guaranteed years + trailing option type/years
+ the existing `years_experience` field — that pulls dollar figures from
`GET /api/cap-levels`'s `min_salary_scale`, instead of asking for typed-in
amounts. Verified end-to-end in a headless browser against the live page.
(Originally escalated one tier per contract year; corrected to flat 2026-08-13
below, same day as the `_contract_years_exp` reversal.)

### ~~[P1] Minimum-contract generator and `_check_minimum_salary` both stale against the 2026-08-13 flat/hardship-cap fixes~~ — DONE 2026-08-13
Caught live entering Nahshon Hyland's 1-yr minimum with GSW (5 years
experience, 26-27): the office's `min-contract-helper` generator prefilled
$2,845,883 (the raw tier-5 figure), but the league's own sheet had $2,449,421
— the § 3.12 veteran-minimum hardship cap, which caps a *genuine 1-year*
minimum deal's cap hit at that season's 2-year-veteran figure regardless of
actual experience tier (`_one_year_min_cap_hit`, `_check_minimum_contract_cap_hit`).
The generator never mirrored that exception, and separately was still
escalating one tier per contract year — stale against the same-day
`_contract_years_exp` flattening (previous entry above). Fixed both in
`generateMinimumContractRows` (`transactions/index.html`): tier is now applied
flat across every generated year, and a genuine 1-year deal (no option) is
additionally capped at that season's `"2"` tier when the player's own tier
sits above it.

Re-submitting at the corrected $2,449,421 then surfaced a second, backend bug:
`_check_minimum_salary` (the `minimum_salary` check) still compared the
submission against the raw uncapped tier via `_min_salary_for`, so it warned
"below this player's minimum for their experience tier" on the *exact same
contract* that `_check_minimum_contract_cap_hit` had just passed as correct —
two checks disagreeing about the same dollar figure. Fixed by threading
`signing_method` into `_check_minimum_salary`: a genuine 1-year `minimum`
deal (single salary year) is now checked against `_one_year_min_cap_hit`
instead of the raw tier, matching the cap-hit check. Multi-year minimums are
untouched — the hardship cap is § 3.12's exception for a 1-year deal only.
`nbn-api/tests/test_one_year_min_cap_hit_consistency.py` pins the fix,
including that a multi-year minimum still warns uncapped and that callers
which don't pass `signing_method` keep the old behavior. Verified live via
`POST /api/validate/sign` before/after.

### ~~[P2] § 5.1 waiver claims described in the rulebook but never implemented~~ — BUILT 2026-08-12/13
Never listed here (spec landed two days after the 2026-08-10 review), recorded
now so it isn't re-proposed. The rulebook had always said a claimed player's
contract transfers, with no code behind it. Spec: `docs/waiver-wire-spec.md`
(v0.2, six decisions settled). Built: `routers/waivers.py` — `GET /api/waivers`,
`POST /api/validate/waiver_claim`, claim / withdraw / resolve — plus the
`#waivers` relay and the surface on `/free-agency`. `tests/test_waivers.py`.

Follows the established shapes rather than inventing new ones: pending claims
are enumerable from the ledger (as `_open_offer_sheets` is), expiry sweeps on
read with no scheduler (as `_sweep_ffa_expiry` does), and claims are **sealed**
— only `pdc-alerts` sees them before the window resolves.

### ~~[P1] Production runs off an unmerged feature branch~~ — RESOLVED, confirmed 2026-08-19
`nbn-api` is on `main`, `picks-conveyance-phase0` is fully merged into it
(`git merge-base --is-ancestor` confirms), and both repos push cleanly to
`origin/main`. `main` describes what is running again. The dev/live split built
on 2026-08-19 depends on that being true — a dev checkout clones `origin/main`,
so a live tree on some other branch would have made the two checkouts silently
different at the same "version". Original entry follows.

`nbn-api` is on branch `picks-conveyance-phase0`, **58 commits ahead of
`main`** — and the systemd service serves directly out of that working
directory, so that branch *is* production. `main` no longer describes what's
running. Decide whether to merge the branch to `main` or rename it.

~~Both repos have 28 unpushed commits each.~~ **Resolved as of 2026-08-07** —
`nbn-today` and `nbn-api` both report 0 unpushed against their upstreams, so
the "disk failure loses ~4 weeks of work" risk is gone. Only the branch
question remains.

### ~~[P3] `/api/rookie-scale` returns empty~~ — DONE 2026-08-11
Populated by `build/load_rookie_scale.py` from the league sheet's
"{year} Rookie Contracts" tabs. 2025 and 2026 are loaded and verified to the
dollar against every signed contract in those classes; `/rookie-scale` renders
them and `GET /api/rookie-scale/contract/{slug}` prefills the office form.
**2024 is deliberately still out** — see the § 3.10 multiplier item in §1.

### ~~[P2] § 7.2 rulebook badge is stale~~ — CLOSED 2026-08-09, fully resolved 2026-08-21
Section read 👁 manual review only, despite Stepien going live 2026-07-23.
Fixed 2026-08-09: badge became 🔒 + 👁 with a "What's system-enforced / Still
manual review" split, since only the Stepien half was actually checked. Once
the companion 7-year advance limit was enforced too (2026-08-21, next entry),
the split no longer applied — § 7.2 is now a single 🔒 system-enforced
section, same as any other fully-covered one.

### ~~[P2] § 7.2 seven-year advance limit unenforced~~ — DONE 2026-08-21
The Stepien half of § 7.2 was enforced 2026-07-23 (`_check_stepien_rule`);
the companion rule — picks may only be traded up to 7 years ahead of the
current league year — had no check. Added `_check_pick_advance_limit`
(nbn-api `routers/transactions.py`), wired into `_validate_trade` right next
to Stepien, so both the submit path and the simulator get it for free. Any
round, not just first-rounders — unlike Stepien.

The horizon isn't a new number: `roster_picks.picks_horizon_target_year`
already computes "current league year + 7" to decide how far the picks
ledger stays populated. Split into `_pick_year_horizon(season)` so the
validator checks a transaction against *its own* season rather than always
today, and so the two can never define "7 years out" two different ways.
`tests/test_pick_advance_limit.py` pins it. Confirmed against live picks
data before deploying: the ledger's newest year (2033) already sits exactly
at the horizon, so this can only ever reject a pick year with no real ledger
row behind it — nothing already on the books was retroactively affected.
