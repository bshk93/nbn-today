# NBN — Backlog

Internal working list of what needs doing and what would be nice to have.
Viewable at `/backlog` (admin-only nav link); the member-facing board is `/suggestions`.

Last full review: **2026-10-06**. **31 open items**: 5 P1, 10 P2, 14 P3, plus
2 nice-to-haves (counted from the `###` headings and the § 4 bullets). The
previous count, from 2026-09-19, matched neither its own split nor the
headings, so recount rather than adjust. Not re-measured in the 2026-10-06
review: the Discord backfill counts, `/suggestions`, and the futures/`/invest`
entry.

Legend: **[P1]** correctness/data integrity · **[P2]** should do · **[P3]** nice to have

**Everything in this file is open. There are no strikethroughs and no done
section** — a finished item is deleted, and git history is where it lives
afterwards. If a job is mostly done but leaves something real behind, the entry
is retitled to name *what is left*, never the part that finished. The previous
convention titled such items by their completed half and struck them through,
which made the same list read as both done and open; it is not coming back.

---

## 1. Data integrity / open reconciliation

### [P1] The leaked GitHub PAT still needs rotating — it is off disk, not revoked
`/srv/shiny/nothing-but-stats/.git/config` had `origin` set to
`https://ghp_…@github.com/bshk93/nothing-but-stats` — a personal access token
in plaintext. Flagged 2026-08-18, re-confirmed 2026-08-19, still present when
checked again **2026-08-29**, eleven days later.

**The remote was switched to SSH on 2026-08-29**, so the token is no longer in
any `.git/config` on the box. A sweep of every checkout that day —
`nbn-today`, `nbn-today-dev`, `nbn-api`, `nbn-api-dev`, `nothing-but-stats`,
`footballgm`, `dota2gm` — found this was the only one; the rest were already
SSH.

**What is left is the part that matters: the token is still valid on the
account and has to be rotated on GitHub.** Taking it off disk does not revoke
it, and it was readable for months. It also reached at least two Claude Code
session transcripts under `~/.claude/projects/` (2026-08-29 and an earlier
one), which are not something to scrub — another reason the fix is revocation,
not deletion. Same class as the four webhooks rotated 2026-08-27.

Re-checked 2026-10-06: the remote is still SSH. Whether the token has been
revoked can't be seen from the box. Only the account owner can confirm it, and
this entry should be deleted when they do.

### [P2] The data backup carries live credentials, and its history keeps them
Found 2026-08-19 while building the off-site tarball. `bshk93/nbn-data` is
private, which is why this is P2 and not P1, but it holds working credentials:

- **`members.json`** — 61 members' bearer tokens, every commit.
- **`google-oauth.json`** — the Google refresh token *and* client secret.
- **`sessions.json`** — **in the pushed history from 2026-08-19 to
  2026-10-06.** It was untracked on 2026-08-19, and the next snapshot that
  same afternoon added it back, because the data dir's `.gitignore` had
  `sessions.json          # session ids; …` and git has no trailing comments:
  the whole line was read as one filename. Fixed 2026-10-06: the comments
  moved onto their own lines, `sessions.json` was untracked again, and the
  00:33 UTC snapshot committed the removal. A session only opens the cookie
  allowlist (`/api/auth/me`, `/api/fa/*`), and the old ids lapse after 30 days
  or on sign-out.

Three ways forward, and it wants a decision rather than a default: accept it
(private repo, SSH-only push, the blast radius is one GitHub account), rotate
the Google credential and the member tokens now that they've been in a remote,
or rewrite the history. A rewrite was cheap on 2026-08-19 at ~60 commits; the
repo had ~1,160 by 2026-10-06, and it only gets more expensive.

The weekly Drive tarball deliberately does **not** carry any of this: the
credential files are excluded and `members.json` goes in redacted, tokens
blanked and tenures kept.

### [P1] 104 open cap-sheet diffs across 27 teams, and 20 teams disagree on Team Salary
**Recounted 2026-10-06**, now that the job compares **26-27**. `poopoo.json`
has **144 rows**: **104 open** (this season, or about who is on the roster at
all) and 40 deferred (a future season's figure, or a hold the site has never
computed — see the grouping in `nbn-api/routers/poopoo.py`). It read 73 open
across 25 teams on 2026-08-30, when the season compared was 25-26.

| Category | Rows |
|---|---|
| `player_extra` — on the site, absent from the sheet | 27 |
| `player_team_conflict` — the two sources disagree on whose player he is | 25 |
| `aggregate` — 20 × Guaranteed Salary, 5 × Hard Cap | 25 |
| `mle` / `tpe` / `bae` | 18 |
| `player_status` / `player_salary` / `player_hold` / `player_missing` / `pick_signed` | 9 |
| `player_future_years` (deferred) | 31 |
| `player_hold_uncalculated` (deferred) | 9 |

Worst Team Salary disagreements (site − sheet): BKN +$19.21M, NOP +$13.23M,
OKC +$10.84M, DAL +$8.20M, MIA +$7.52M, UTA +$6.79M.

**Six of the 20 are explained (2026-10-06), and the site is right on all
six: the sheet missed August moves the ledger has.** The committee needs to
enter these on the sheet; nothing on the site changes.

| Team | Site − sheet | What the sheet is missing | Ledger |
|---|---|---|---|
| CHI | +$2,449,421 | Patrick Williams, minimum | `sign` 2026-08-18 |
| PHI | +$2,449,421 | Gary Payton II, minimum (sheet still has his UFA hold) | `sign` 2026-08-19 |
| PHX | +$2,449,421 | Adem Bona, minimum | `sign` 2026-08-15 |
| POR | +$2,449,421 | DeAnthony Melton, minimum | `sign` 2026-08-15 |
| ATL | +$3,000,000 | Ben Sheppard, Bird re-sign (sheet still has his RFA hold) | `sign` 2026-08-20 |
| CHA | +$3,000,000 | Cam Johnson ($23M) in, Kelly Oubre ($20M) out | `trade` 336040099f5a23e8, 2026-08-16 |

$2,449,421 is the 26-27 minimum for a player with 2 years' experience. Two
loose ends from the same check:

- **The diff job never flagged Bona.** PHX shows no `player_extra` row for
  him, though he is on the site's PHX roster and not on the sheet. The
  aggregate row was the only sign. Worth finding out why the player match
  let him through, since other gaps could hide the same way.
- **The CHA trade should also move NOP's figure**, but NOP is +$13.23M, so
  more than this trade is wrong there.

Most of the sheet's figures still carry fractional cents (ATL `209,015,000.3`)
and the site's never do. So the sheet is doing arithmetic the site isn't.
Proration or partial guarantees are the obvious suspects.

Each team sees its own rows on its page (the Cap Health card). That is
reporting, not reconciliation: every row is still open.

### [P1] Picks conveyance — 90 picks still not cleanly modeled
`poopoo.json` `picks.counts`, **recounted 2026-10-06** (2026-08-07 in brackets):

- `clean_match` 321, `clean_match_frozen` 7 — fine
- `needs_investigation` **11** (32) — no explanation yet
- `same_owner_diff_representation` **56** (35) — right owner, structure differs from the sheet
- `committee_lag` **21** (18) — site is ahead of / behind the committee sheet
- `richness_gap` **2** (3) — sheet expresses conditions the model can't hold

`needs_investigation` fell by two thirds, mostly into
`same_owner_diff_representation` — owners now agree and only the shape
differs. The 11 left are still the real blocker to trusting `/api/picks` end
to end. Committee tasks for individual picks go in `pick-committee-notes.json`
(the Picks tab on `/committees/rosters`).

### [P2] Discord backfill not finished
- Trades: 437 of 485 raw messages submitted; ~50 multi-team trades still
  flagged, needing a human from/to judgment call per trade. Not crowd-source-able
  — needs an admin/committee pass.
- FA signings: 1498 of 2081 submitted; 162 flagged, 538 skipped. The 162 were
  member-facing at `/cleanup` from 2026-08-16 until that game was retired
  2026-09-19; they are back to being a committee job with no queue behind them.
Spec in `nbn-api/docs/discord-transaction-backfill.md`. **The 538 skipped FA
rows' open question is resolved**, checked against the real file 2026-08-16:
496 of 538 have no sign/option language at all (renounce/waiver/retirement/
trade-block chatter) — the parser correctly excluded them, this is not a
hidden gap pool. Not worth a full re-audit for v1.

### [P1] 27-28/28-29/29-30 still need a committee-entered cap estimate
Split out 2026-08-24 from the now-closed extension entry. Originally filed as
"fix is data, not code, get the committee to enter real 27-28+ figures" — that
premise was wrong: the league doesn't announce a season's real cap until that
season, so there was never a real number to enter, and the item would have sat
here permanently.

2026-09-23: `CapLevel.is_estimate` now exists (`nbn-api` `routers/misc.py`),
and `extension_cap_position` / `extension_max_year1` score against an
estimated cap instead of refusing outright — see the `/cap-settings` checkbox.
**What's actually left is committee action, not code**: go into `/cap-settings`
for 27-28/28-29/29-30, enter a projected cap/apron1/apron2/hard_cap (grown off
26-27's real numbers is a reasonable starting point), and check the box. When
the real 27-28 number is announced next season, re-save with the box
unchecked — that flags every extension priced against the estimate for review
via the `flagged_extensions` field the PUT now returns.

| Season | cap | apron1 | apron2 | min scale |
|---|---|---|---|---|
| 25-26 | $154,647,000 | $195,945,000 | $207,824,000 | 11 rows |
| 26-27 | $164,961,000 | $209,015,000 | $221,686,000 | 11 rows |
| 27-28 | **$0** | **$0** | **$0** | 11 rows |
| 28-29 | **$0** | **$0** | **$0** | 11 rows |
| 29-30 | **$0** | **$0** | **$0** | 11 rows |

Re-checked 2026-10-06: all three are still $0 and none is marked as an
estimate. **26-27's EAPS is also still 0**, though 26-27 is now the current
season. 26-27 does have a hard cap now ($252,390,330).

### [P1] 2024 rookie scale has the § 3.10 hold multiplier inverted — not loaded
Found 2026-08-11 while populating `rookie-scale.json` (which had never held
anything; 2025 and 2026 are now loaded and verified to the dollar against every
signed contract in those classes).

A first-rounder's deal rolls into an RFA cap hold worth **250% or 300% of the
Year 4 salary** (§ 3.10's rookie carve-out), and which one turns on whether
Year 4 sits above or below that season's EAPS. § 3.10's direction is consistent
everywhere: the **higher** multiplier belongs to the **lower** salary (150%
above EAPS, 190% at-or-below).

| Draft | Top picks | Rest | Implied boundary |
|---|---|---|---|
| 2026 | 2.5× (1–2) | 3.0× (3–30) | $16.5M–$18.3M |
| 2025 | 2.5× (1–2) | 3.0× (3–30) | $15.4M–$17.2M |
| 2024 | **3.0×** | **2.5×** | **~$7.5M** |

2024 is backwards on both counts — the most expensive deals take the biggest
multiplier, and the implied EAPS is half the neighbouring years'. **The sheet
and the site also disagree on where the line falls**: the sheet splits at picks
9/10, the bios at 11/12, because McCain (#10) and Carter (#11) were re-entered
by hand at some point using the corrected convention.

Affects **only the 28-29 cap holds** for the 2024 first round — Years 1–4 match
the sheet exactly for all 30 picks and are not in question. Correcting the
direction moves 11 players' holds down (−$61.7M, biggest Sarr/WAS −$8.7M) and
19 up (+$56.4M), netting −$5.3M. Most exposed: WAS (1, 4), SAC (2, 5, 25),
CHA (3, 7, 15), DAL (9, 16, 19).

**Decided 2026-08-11: correct 2024 to match 2025/2026 — but blocked on the
sheet being resolved first**, since that's where the figures are maintained and
fixing only the site would just re-open the same divergence from the other end.
Someone also has to choose where the boundary belongs, because 28-29 has no
EAPS on file (`cap-levels.json` has it at 0 — same gap as the minimum-scale
item above; setting a real 28-29 EAPS would make the split compute itself and
would also retire the `eaps_assumption` placeholder `/transactions` has to ask
about).

`build/load_rookie_scale.py` refuses to write any year that fails its § 3.10
direction check or its cross-check against signed contracts, so 2024 stays out
until this is settled and re-running it will pick the year up automatically
once the sheet is fixed. Nothing to change in code. Re-checked 2026-10-06:
`rookie-scale.json` still holds only 2025 and 2026.

### [P3] Two `photo_url` oddities left — an inline data URI and a dead imgur link
Split out 2026-08-29 when the nine `"NA"` bios that this entry was about were
fixed. Those were the substance of it: `ajinca-melvin`, `bridges-jalen`,
`dixon-eric`, `johnson-keshad`, `juzang-johnny`, `mccullar-kevin`,
`newton-tristen`, `pate-dink` and `robinson-jaxson` each carried the literal
three-character string `NA` where a URL belongs, so every load of `/players/`
fired a 404 for `https://nbn.today/players/NA`. All nine are now `""`, which is
what 70 other bios already used and which the page's normal fallback handles.
**`tests/frontend/run.js` now passes all 15 pages** — that 404 was the only
same-origin failure the suite had.

One thing worth keeping from how it was fixed, because the entry described the
fix as a bio edit and that was only half of it: `/players/` reads
`PHOTO_URL` out of `players/player_seasons.csv`, which snapshots the bio at
**build** time. The bio write alone changed nothing on the page — it took a
`build/build.sh` run to re-snapshot. Any future "just fix the bio" of a
snapshotted field is the same two steps.

What is left is two one-offs in the same field, neither of them our defect:

- `wagler-keaton`'s photo is a **~13KB base64 data URI stored inline in
  `player-bios.json`** (measured 2026-10-06; this line used to say ~100KB) —
  it inflates every `GET /api/players` response for one player.
- `da-commish-chuck`'s photo is the only **imgur-hosted** image in the league
  (`i.imgur.com/SaK7v2z.png`), and it 429ed when last checked. The frontend suite reports
  it as a third-party warning on `/players/` and `/draft/` and does not fail on
  it, correctly — but it is a broken image on two real pages.

Both are worth normalising if anyone is in that field anyway. Neither is urgent.

---

## 2. Rule automation gaps

The rulebook badges each section 🔒 system-enforced or 👁 manual review.
Since 2026-08-30 the 🔒 half is **generated** from `nbn-api/rulebook_coverage.py`
and the badges can no longer go stale. As of 2026-10-06, 36 sections are
enforced, 24 still need a human and 20 carry both. The four that are
manual-only (§ 1.2, 3.7, 4.6, 7.3) and the partial coverage behind the 20 are
the gaps worth closing. § 6.1 and § 7.4 left the manual-only list when the
owner self-serve option moves and `stash` shipped. Each section's
`SECTION_REVIEW` note in that file says what is still missing.

### [P3] Extension eligibility backfill — 88 rostered players still missing an acquisition record
`_player_acquisition_index` (§ 3.8's ledger scan, reused for § 6.2 eligibility)
can't find a signing entry for these players, so their contract start date is
unknown and eligibility can't be derived from the ledger.

**Not a blocker for extensions** (decided 2026-08-19,
`docs/poext-extension-pipeline.md` § 2.3a/D1) — a proposal packages whatever
partial ledger history the player has plus the submitting team's own attestation
of when the deal began, and the eligibility check runs off that at warn severity.

**Re-measured 2026-10-06** against the live ledger (2026-08-25 in brackets):

| | Count |
|---|---|
| Rostered players, excluding unsigned draft rights | 513 |
| Missing a signing record | **88** (116) |
| — trade events only | 81 (86) |
| — no ledger events at all | 7 (30) |

- **81 have trade events but no signing.** Acquired by trade with the original
  signing unrecorded, so no rule reaches them — this is the Discord resolver's
  job, not an inference.
- **7 need a person to state the answer**, not a rule. They are the same 7 as
  on 2026-08-25: Giannis (2013), Booker (2015), SGA (2018), Herb Jones (2021)
  and Matkovic (2022) are far past a rookie deal; `tomlin-naeqwan` has no
  `draft_team` on file; and `yang-hansen` rosters at UTA having been drafted by
  DAL with no trade on record, so a DAL signing would put the ledger at odds
  with the roster.
- Unsigned draftees (`type: "draft-rights"`) are *correctly* recordless and
  aren't counted. They get a real signing when they sign one. Don't infer a
  rookie contract from `draft_year`: on 2026-08-25 that would have invented 23
  contracts that don't exist.

### [P2] § 3.9's Bird-tier signing ceilings aren't enforced, so the QO ceiling isn't either
Qualifying offers landed 2026-10-02 (`docs/qualifying-offers.md`), but one
piece of § 3.9 still has nothing to plug into. The Non-QVFA ceiling is "the
greatest of 120% of the final-year salary, 120% of the applicable minimum, or
(for RFAs) the qualifying offer amount", and no Bird-tier first-year ceiling is
checked at all — `_check_bird_rights_tenure` checks the *tier*, not the
amount. The QO amount now exists (`bio["qualifying_offers"][season]["amount"]`),
so the RFA branch is a lookup once the ceiling check itself is built.

Two smaller residuals from the same work:

- **Starter criteria aren't modeled.** The NBA moves a rookie-scale QO up or
  down by whether the player met the starter criteria (games started / minutes
  in the prior seasons). The league adopted the slot table without them; the
  box scores could supply games started if that's ever wanted.
- **An `RFA` tag isn't checked at signing.** A contract can still be entered
  rolling into an `RFA` hold for a player who will have 4+ years by then. The QO
  validator catches it when the team tries to extend (`qo_rfa_eligible`), so it
  can't make a wrong RFA, but the tag itself is misleading until then.

### [P3] Two "current books" checks still read salary without the § 2.1a charge
Signings, offer sheets, offer-sheet decisions, waiver claims and the
simulator's fact sheet all project through one helper since 2026-10-06,
`_signing_books` in `nbn-api/routers/transactions.py`. It adds the real Empty
Roster Charge for the slots still empty after the move, to cap room as well as
the hard cap and aprons. They used to be five copies of the same lines. Change
that math there, never at a caller.

What's left is two checks that judge the team's books *before* the move, off
the raw ex-holds figure with no charge: `_check_bae_eligibility` (§ 3.4) and
the § 1.5.2 buyout-signing apron test, in both `_validate_sign` and the waiver
claim. For a team below 12 they read the team as up to ~$4M lighter than its
real books. They need the current charge (`_real_empty_roster_charge` at today's
count), not the post-move one. The extension check projects a future season,
where today's roster count says nothing, so it is left alone on purpose.

### [P2] Committee lottery draws happen off the site
The constitution (Article V) decides FAC and PO-Ext questions by lottery:
members split balls, and unless one PO-Ext option clears 85% the result is a
draw weighted by the balls. Both pipelines record the balls and the result,
but neither runs the draw — the head draws off-site and records it (FA via
`declare-winner`, PO-EXT via `finalize`'s `outcome`). So the draw itself can't
be checked from the site. Decided 2026-10-04 to keep it off-site for now and
revisit both together; a server-side draw would record the odds and the random
value on the final record.

### [P2] Conditional trade + extension has no workflow
§ 6.2's conditional trade + extension — Team A submits the extension pitch on
Team B's behalf, and the trade goes through only if the player agrees — exists
only as rulebook text. Such an extension is an extend-and-trade, with 5%
raises (defined 2026-10-04; § 3.9's row now points at it).

What's missing: a PO-EXT proposal can't name a trade it depends on, so the
pipeline can't hold a trade until the extension is agreed, or submit a
proposal from Team A for a player headed to Team B. Until then a team marks
a proposal "extend-and-trade" itself (`ExtensionDetails.kind`), which only
tightens the raise limit, and the trade goes through TRC separately.

### [P2] Proration is practiced but undocumented
The league prorates in-season minimum signings, but the rulebook says nothing
about it — zero occurrences of "prorat" anywhere in `rulebook/index.html`.
Confirmed as real practice 2026-08-07.

This matters now that § 3.12 minimums are enforced. `_check_minimum_salary`
lets Year 1 of a signing made on or after opening night fall below the
full-season minimum, with a warning to confirm the proration. A signing before
opening night, and every later contract year, is a hard error. Since
2026-10-06 opening night comes off the schedule
(`_signed_after_opening_night`); before that it was a Jul–Sep guess. A league
year with no schedule on file still uses the guess.

What's left is the rule itself: a § 3.12 subsection stating that in-season
minimum signings prorate, and the basis (days? games?). Then the warning can
become a real computed check. Grant Williams' 2026-04-11 signing ($39,820) is
the live example.

### [P2] § 3.10's rookie-scale hold row isn't built — Prosper's 28-29 hold is still $1
The 250%/300% hold for a player off the final year of a rookie-scale deal has
no implementation, so `_autofill_fa_hold_amounts` would price it as a Bird
percentage. `repair_fa_holds.py` (nbn-api, 2026-09-24) lists the one known case
for a human rather than guessing: `prosper-omax` (DAL), whose 28-29 hold is the
sheet's `$1` stand-in, tagged UFA where a rookie-scale end is usually RFA.

The minimum-contract row of the same table *is* built as of 2026-09-24
(`_minimum_contract_hold`). Before that every minimum deal's hold went through
the Bird percentage; that run repriced 52 of them and added 24 trailing holds
the 2026 FA wave had gone in without. `_check_trailing_hold` now warns on a
sign, offer sheet or extension with no hold after its last year.

Still open with the committee: the 27-28+ minimum scales are projections on a
**simple** 5%-of-base escalator (×1.05, ×1.10, ×1.15), not compounding.
Immaterial at three years out, real by year five. Replace with published NBA
figures when they exist.

### [P2] § 7.1's 120% hold on an unsigned 1st-rounder isn't charged anywhere
The rulebook puts a hold of 120% of the slot's rookie-scale amount on the books
for an unsigned 1st-round pick until he's signed, stashed or forfeited. Nothing
computes it. `draft-rights` bios carry no `salaries`, so
`_compute_team_salary`, cap history, team pages and every validator count the
pick at $0. Found 2026-09-25 building `stash`: Anderson (LAL, pick 21) is
unsigned past Aug 31 with no hold anywhere.

A stashed pick carries no hold (league decision, 2026-09-25), so the rule is:
unsigned, 1st round, no `stash` → hold. `_rookie_scale_contract` already gives
the Year 1 figure. It has to go in the one salary helper every reader shares,
not per page, and it doesn't count as outgoing salary in trade matching.

### [P2] An RFA match doesn't link back to the holds that funded the offer
`rescind_renounce` shipped 2026-08-08 alongside owner self-serve renounce, and
that part is done: every `renounce` stores a `_snapshot` of the bio state it
erases, `rescind_renounce` restores from it, and `/transactions` has the undo
button. § 3.10's cap restrictions are warnings rather than errors there, since
the same mechanism doubles as the correction path for a mistaken renounce.

What is still open: **nothing ties an RFA match back to the holds that paid for
the offer**, so the office picks them out by hand, one renounce at a time. A
renounce also scrubs the player's trading-block entry and the undo does not put
it back.

### [P2] 12 rostered players' Bird tenure doesn't resolve, and `bio["contracts"]` is thin
§ 3.8 tenure is derived from the transaction ledger via `_bird_tenure` and
checked on both the submit and simulator paths by
`_check_bird_rights_declaration`. Claiming more tenure than the ledger supports
is an error. Declaring `bird_rights` for a player the ledger puts on another
team is an error. When the ledger has no answer at all, it's only a warning.

That last case is what's left. **Re-measured 2026-10-06** for 26-27: 12
rostered players have no tier — `anthony-cole` (ATL), `broome-johni` (DAL),
`porter-craig` and `miller-jordan` (DET), `jones-spencer` (LAC), Giannis (MIL),
`jackson-andre` (NOP), SGA (OKC), Booker (PHX), `furphy-johnny` and
`tomlin-naeqwan` (SAC), `yang-hansen` (UTA). Five overlap the extension
backfill's 7 above. (It read 4 on 2026-08-07, in 25-26. The rollover added a
season for every chain to cover.) A Bird signing for any of them passes on a
warning, so the declared tier is the team's word.

`bio["contracts"]` is on 173 of 1,037 bios (2026-10-06; it was 47 of 1,018 on
2026-08-07). Nothing reads it for tenure, but contract *terms* history is
still thin for every pre-2026 deal.

**The old § 1.2 entry was folded in here on 2026-10-06.** It said a team could
declare `bird_rights` with no tenure and pass clean. That stopped being true
when `_check_bird_rights_declaration` started covering `signing_method`; the
warning above is the only residue.

### [P3] The 👁 half of the rulebook badges is still declared by hand
Entered 2026-08-16 as "the badges keep going stale", closed 2026-08-30 for the
🔒 half. `nbn-api/rulebook_coverage.py` now computes it: an `ast` pass finds
every `CheckResult` reachable from `_VALIDATORS` (plus the one in
`routers/waivers.py`), `CHECK_SECTIONS` maps each check id (54 then, 84 on 2026-10-06) to the
§ it enforces, and `tests/test_rulebook_coverage.py` fails if those two sets
disagree — so a new check cannot be added without declaring what it enforces.
`build/check_rulebook_badges.py` rewrites the badges from that manifest and
`build/smoke_test.py` fails when the page drifts. Fifteen badges were wrong the
day it landed.

**What is still hand-declared**, and can't be computed:

- `SECTION_REVIEW` — *why* a section still needs a human. "Partially enforced"
  is a judgement about the gap between a rule and the check covering it, and
  nothing in the code knows it. The notes are reviewed prose, and the test only
  asserts they exist and name a real §, not that they are still true.
  On 2026-10-06 three had gone stale and were fixed: § 3.1 and § 3.8 said
  Bird tenure was "self-declared", though `_check_bird_rights_declaration`
  had checked it against the ledger since August, and § 6.2 carried a count
  that had drifted. The notes aren't shown on `/rulebook` (only the badge
  is), but the hand-written "What's system-enforced" prose there drifts the
  same way: § 3.14 made the same "self-declared" claim and was fixed the
  same day. Nothing checks that prose against the code.
- `SECTION_ENFORCED_BY` — the one section (§ 5.2) the system enforces by simply
  doing the thing, with no check to find.

Closing this properly means the checks carrying their own § and their own
"what's still manual" note at the emit site, so the whole manifest falls out of
the code. That is a 217-site edit for a badge (216 `CheckResult(` sites in `transactions.py` plus one in `waivers.py`, counted 2026-10-06), which is why it wasn't done now.

Three badges sit outside the generated set on purpose — the § 1.5 buyout
bullet, the "Hard Cap Grace Period" sub-heading and § 3.1's "UFA / RFA
Eligibility" sub-heading. Each is a claim about one clause rather than one
section, so nothing keys them to a §, and they stay hand-written.

### [P3] The compliance board doesn't show Stepien exposure
The board is the Compliance tab on `/committees/rosters/`. It runs each team's
`GET /api/cap-history/current` row through `cap-health.js`, so it states no
rule of its own and does no cap math. Everything else this entry used to list
has shipped:

- open offer sheets and waiver windows (2026-09-23, from
  `/api/offer-sheets/open` and `/api/waivers`);
- the Empty Roster Charge in dollars, which `cap_history.build_rows` now reports
  as `empty_roster_charge` (2026-09-19);
- the trim deadline: `in_season` comes from opening night on the schedule, so
  over 15 is a "trim owed before opening night" now and a violation once the
  season starts (2026-09-30).

**Stepien exposure is what's left.** It's computed inside the trade validator
on the submit path, not by anything a page can call. Adding it means giving it
the `cap-health.js` treatment first — a pure function taking its inputs as
arguments — not querying for it from the page. A second copy is how two
surfaces start disagreeing about who is in violation.

### [P3] Other standing manual-review items
The full, current list is `SECTION_REVIEW` in `nbn-api/rulebook_coverage.py`
(and the 👁 badges it produces). Don't keep a second copy here; this one went
stale. The ones that bite most often:

- § 4.5 trade restrictions beyond the extension freeze, § 4.6 Touch Rule
  (multi-team trades)
- § 3.7 DPE — no exception type exists
- § 3.11 the 25/30/35% max tier isn't derived from service time
- § 3.13 option and guarantee structure
- § 6.1 a PLAYER_OPT decision has no automated check
- § 3.15 the 48h match clock and the offer-value cap hold aren't modeled. This
  one isn't in `SECTION_REVIEW`'s § 3.15 note, which mentions only the funding
  link.

### [P3] Trade exceptions still not tradeable
Creation and consumption are both automatic now (§ 4.1a). Trading a TPE isn't
supported — real CBA doesn't allow it either, so this may be "won't do";
worth an explicit decision so it stops resurfacing.

### [P3] § 7.3 second-apron pick freeze — auto-compute deferred
Currently a manual `FROZEN` flag. The four-year lookback needs 4 seasons of
team-state history. Genuinely blocked on time, not effort — but the time is now
being banked, which it wasn't before.

**The clock started 2026-08-25.** `nbn-cap-history.timer` now appends a row per
team per day to `cap-history.jsonl` — Team Salary on both bases, apron position,
hard-cap level, roster counts (`nbn-api/CLAUDE.md` § "Cap history"). The
four-year lookback is satisfiable from **2030-08-25**, so this is now a waiting
problem rather than a blocked one, and the earlier correction stands: had the
snapshot waited until 2029 to start, it would have shipped around 2033.

What this entry is still waiting on is only time. **The one thing that would
lose it is a gap in the series** — the timer is `Persistent=true` so downtime
catches up, but a stretch where it is disabled cannot be reconstructed, since
the whole point is that this is observed, not replayed. If the timer is ever
switched off, note the dates here. Checked 2026-10-06: a row every day from
2026-08-25 to 2026-10-05, no gaps.

---

## 3. Tooling / infrastructure

### [P3] The edit log starts from 2026-08-25, permanently
`edits.jsonl` went live 2026-08-25 — `storage._atomic_write` records a
value-level diff of every write that bypasses the ledger, from the four side
doors (`PUT /api/players/{slug}`, `PUT /api/roster/{team}`,
`PUT /api/deadcap/{team}`, `PUT /api/picks/...`). `GET /api/edits` reads it
back by file, actor or key, and is now public — the player page's "Edit
history" disclosure (below the transactions table, same "Player History" card)
calls it scoped to `key=<slug>` (`nbn-api/CLAUDE.md` § "The edit log").

- **Left, and permanent:** the log starts on 2026-08-25. **The 25-26
  fractional-cent poopoo diffs (PHI, UTA) were the motivating case and it
  cannot answer them** — those edits predate it. This is forensics going forward only.
  Don't re-open this expecting it to explain an old diff.

### [P3] Nothing runs the frontend smoke suite, and authenticated pages are uncovered
`tests/frontend/run.js` shipped 2026-08-25 — puppeteer against a real vhost,
asking each page four things: 200, nothing thrown, every same-origin request
succeeded, and the content the page exists to show actually appeared. It found a
real defect on its first run — the nine `"NA"` `photo_url` bios, fixed
2026-08-29 — which is the argument for the rest of it.

**Coverage went from 18 pages to 43 on 2026-09-19** (22 assertions to 47; a few
pages carry more than one). On 2026-10-06 `run.js` has 48 rows across 42
distinct paths. Run twice that day against `nbn.today`: the second run passed
all 48. The first failed one `/stats/highs/` row and passed on rerun. A likely
cause is `GET /api/game-highs` building its in-memory index on the first
request after a box score lands. Worth knowing before a nightly timer starts
reporting it as a real failure. Every `min` was read off a real render
and then set well below it, so the floors survive the league doing something
ordinary. Two lessons are written into `tests/frontend/README.md` rather than
here, because they are what the next person adding a row needs:

- Where a count can legitimately *shrink*, the row says so — `/ratings-changes`
  produces nothing from a scrape that changed nothing.
- **Don't assert on a worklist.** `/suggestions` and the rosters dashboard's
  reconciliation tabs are public and
  render fine, but their content is a list of things that are *supposed* to
  reach zero. A `min` on either goes red the day the league clears it. A test
  that fails on success is worse than no test, so both are deliberately
  uncovered.

What is left:

- **Nothing runs it.** This is now the whole of the item's value at risk:
  ~42 pages of assertions that only fire when someone remembers. Still true on
  2026-10-06: no timer or hook runs it. Deliberately not
  in the pre-commit hook — it launches a browser, needs the site up and `npm ci`
  done, and takes a couple of minutes, none of which belongs between a commit
  and its author. The two candidates both have a cost worth weighing: a
  `deploy.sh` hook runs in the **live** checkout, which has no `node_modules`,
  and would add those minutes to every deploy; a nightly systemd timer runs
  detached and needs somewhere to report a failure (Discord, like
  `check_stats_integrity.py` already does). The timer is the better shape.
- **No authenticated pages.** `/committees/pdc`, `/free-agency`, `/extensions`,
  `/strikes`, `/committees/stream`, `/transactions`, `/inbox`, `/bet`, `/invest` and team
  edit mode. Confirmed 2026-09-19 that signed out they each render a sign-in
  prompt correctly, so the gap is real but not hiding a defect. Covering them
  means minting a real session against the live API, and a write path exercised
  from a dev page is a real write — so this needs a decision, not just effort.
- **~70 pages still uncovered**, but they are now the thin ones: static prose
  (`/constitution`, `/legal`, `/how-to-rosters`, `/join`), per-stat leaderboard
  pages that share one `table.js`, and the 30 team shells that share one
  `team.js`. The heavy data-driven pages are done.

### [P3] Client-side errors are invisible
Entered 2026-08-16, split 2026-08-25 when the `/api/health` half was done.

114 pages each carry their own inline boot, and a member who hits a broken one
has no way to tell anyone and no way for us to find out. The PDC
uncaught-rejection item (fixed 2026-08-25) was one instance of a general
condition, not the condition itself.

`nav.js` already loads on every page, so a `window.onerror` +
`unhandledrejection` shim posting to a small `/api/clientlog` would cover all
114 at once. **Not started deliberately** — it needs three answers first, and
without them it is an unbounded write path any visitor can drive: where the
log is stored, how long it is kept, and what rate limit it carries.
Complements the frontend-test item above rather than duplicating it: tests
catch what we thought to check, this catches what members actually hit.

**The liveness half is done** — `GET /api/health` shipped 2026-08-25, public
and unauthenticated, 503 when the data directory is unreachable
(`nbn-api/tests/test_health.py`).

### [P3] Fifth copy of the same frontend primitives — `nbn-data.js` is overdue
Entered 2026-08-16. `contract.js` exists because the contract grammar had
already diverged twice; `teams/lineup.js` exists for the same reason. The rest
of the shared primitives never got that treatment, and the count has grown
(2026-08-16 in brackets):

| Helper | Files defining one, 2026-10-06 |
|---|---|
| `TEAMS` abbr → name map | **19** (13) |
| `displayName()` | **11** (11) |
| `parseCSV()` | **11** (10) |
| `parseSalary` / `fmtMoney` | **7** (7) |

Same failure mode as the contract shorthand, just quieter — one page renders
"Wallace, Keaton" and another "Keaton Wallace". **`names.js` (2026-09-23)
covers part of that**: `nbnPlayerName()` is the shared display rule and 28
files load it. But the 11 local `displayName()` copies are still there, so
it's a sixth copy until they're replaced. A root `nbn-data.js` carrying
those six, adopted first in the four heaviest consumers (`teams/team.js`,
`players/index.html`, `cap-summary/`, `transaction-sim/`), then opportunistically.

Note the constraint in CLAUDE.md: the 30 team shells load only `team.js`, so it
has to be pulled in the same injected-script + awaited-promise way
`lineupReady` / `contractReady` are, not by touching the shells.

### [P3] Futures markets: no roster model for opening odds, insider trading open, `/invest` overlaps
Futures markets shipped 2026-09-25 (`docs/nbyen-economy.md` § 4a). Left:

- **Opening odds come from the bookie or the latest power rankings** (by
  average ballot rank, `docs/nbyen-economy.md` § 4a). Rankings go stale
  between editions and ignore everything but opinion. A model would do better:
  rate each roster (`computeStartingFive`, OVR depth, record once games start),
  simulate the season, and seed from that. Also show it beside the market
  price and recompute it on every roster write. It should inform the price,
  not set it.
- **GMs know about their own trades before anyone else.** Betting against
  your own team is refused, but trading on the news isn't (decided 2026-09-25,
  `docs/nbyen-economy.md` § 4a). If it becomes a problem: pause a team's
  outcome while it has an open TRC request (but the pause itself leaks that a
  trade is coming). Decide once there's real trading to look at.
- **`/invest`'s team stocks overlap**: a second team price that doesn't pay
  out on anything. Its money is paused (`invest` in `wallet.KINDS`). Decide
  whether futures replace it.

### [P3] Seed `/suggestions` with the member-facing part of this file
The board is no longer empty (checked 2026-08-08: two live suggestions, #4 MCP
server and #5 comments/editing, seq at 5; #5 is built — threads, status history,
and an Edit button the UI had never exposed despite the PATCH existing since
launch).

What is still open: this file holds plenty that members would have opinions on,
and none of it is in front of them. Seeding the board with that subset is the
job.

---

## 4. Nice to have

- **Extension window UI** — teams submit on `/extensions` (2026-10-04) and the
  validator checks the § 6.3 window. What's missing is a calendar surface
  showing when each window opens and closes, the way FA has one.
- **Cap history chart on the team page** — the rest of per-team cap health
  shipped 2026-08-30: the Cap Health card shows standing against the cap,
  aprons, a hard cap and § 2.1/2.1a/2.2's roster limits, plus this team's own
  rows from the rosters dashboard (`cap-health.js` + `renderCapHealth`, fed by
  `GET /api/poopoo/summary`). What is left is the *history*, and it is data
  rather than work: `GET /api/cap-history?team=UTA` has served a per-day series
  since 2026-08-25, so "when did this team cross the first apron" is a chart
  over an existing endpoint, not a collection problem.
