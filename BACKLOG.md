# NBN — Backlog

Internal working list of what needs doing and what would be nice to have.
Viewable at `/backlog` (admin-only nav link); the member-facing board is `/suggestions`.

Last full review: **2026-08-30**. **29 open items** as of **2026-09-19**:
7 P1, 8 P2, 12 P3, plus 2 nice-to-haves. (Counted from the `###` headings and
the § 4 bullets. The previous line claimed 35 across a split that matched
neither — no version pin here for the same reason, it went stale within two
commits of being written. The date is what matters.)

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

### [P1] One 24-25 game still lists a player twice — CLE/Hartenstein, unresolved
Found 2026-08-26 by `stats_build/checks.py` on its first run over the corpus,
as three team-games carrying the same player name twice with **different** stat
lines. Two are fixed (see below); the CLE one is what is left, and the other two
are kept here because their reasoning is what a fix for the third would follow:

| File | Team | Date | Name | The two lines |
|---|---|---|---|---|
| `allstats-24-25.csv` | CLE | 2025-04-11 vs @NYK | HARTENSTEIN, ISAIAH | 15min/12pt · 12min/9pt |
| `allstats-24-25.csv` | DAL | 2025-03-29 vs @CHI | WALKER, JABARI | 28min/14pt · 22min/7pt |
| `allstats-24-25.csv` | DEN | 2024-10-29 vs @BKN | HOLIDAY, JRUE | 24min/13pt · 3min/3pt |

Not duplicated rows: in all three the team minutes come to exactly 240 and the
player points sum to `TEAM_PTS`, so the *game* is right and one of the two rows
is **a different player entered under the wrong name**. Every other check passes
— both lines are individually legal — which is why it sat for over a year.

The effect is that one real player is missing a game and another has one that
is not theirs, in career totals, game highs and HOF points alike.

The screenshots were deleted after parsing (deliberately — see
`boxscore_provenance.py`) and provenance only starts in 2026, so there is no
record of the original. But "who was on this roster and did **not** play that
night" narrows it hard, and it resolves two of the three:

- **DEN 2024-10-29 → the second row is almost certainly `HOLIDAY, AARON`.**
  He is the only other Holiday in the league that season and he was **on DEN**.
  His first recorded game is 2024-11-23 — after this one — so a 3min/3pt cameo
  logged under Jrue is exactly the game he is missing. Only the first name is
  wrong.
- **DAL 2025-03-29 → the second row is almost certainly `WALTER, JAKOBE`.**
  35 games for DAL between 2025-01-22 and 2025-04-13, and he played **all six**
  of the games either side of this one but not this one. Walker/Walter,
  Jabari/Jakobe.
- **CLE 2025-04-11 → genuinely unresolved.** There is no second Hartenstein
  anywhere in 24-25. CLE rested four regulars that night (Allen, Garland,
  Haliburton, Brandon Ingram all played the surrounding games) and dressed a
  12-man bench, and every *other* CLE player's date range ended months earlier.
  So the mystery line — 12min, 9pt, 2-3 FG of which 2-3 from three, 3-3 FT, 0
  reb — is either one of those four resting starters, or a player who appears
  nowhere else in the data. Allen is ruled out by the line (a centre with 0
  rebounds and two threes); Garland or Haliburton fit it best.

**Both fixes are edits to a raw, append-only file**, which `allstats_guard`
refuses by design. Use `nbn-api/edit_allstats.py`, built 2026-08-26 for exactly
this — it is dry-run by default, refuses a selector that matches more than the
row you named, and verifies the write against disk cell by cell so it cannot
change anything it did not declare. `allow_shrink=True` is **not** the tool:
it turns off every check at once. Each edit wants its own `--reason`, which is
the only record of why a hand-corrected row differs from what was parsed.

    venv/bin/python edit_allstats.py --file allstats-24-25.csv \
      --where TEAM=DEN DATE=2024-10-29 "PLAYER=HOLIDAY, JRUE" M=3 \
      --set "PLAYER=HOLIDAY, AARON" --reason "..."     # add --apply to write

**Two of the three were applied on 2026-08-26** and this entry did not say so
until 2026-08-29 — `allstats-edits.jsonl` records both, with the reasoning
above as the `--reason`. DEN 2024-10-29 now reads `HOLIDAY, AARON` on the
3min/3pt line; DAL 2025-03-29 now reads `WALTER, JAKOBE` on the 22min/7pt one.
Re-checked league-wide on 2026-08-29 across all 13 raw files: **exactly one
team-game still lists a player twice**, the CLE one.

So what is actually open is the third case alone, and it is open because it is
genuinely unresolved rather than un-actioned — there is no second Hartenstein
in 24-25, and the candidate list above (Garland or Haliburton fit the line
best) is inference, not evidence. It needs a person to decide, or to stay as
it is.

`check_stats_integrity` reports it weekly until then. Rebuild after any fix —
the derived files hold the old value until one runs.

### [P2] The data backup carries live credentials, and its history keeps them
Found 2026-08-19 while building the off-site tarball. `bshk93/nbn-data` is
private, which is why this is P2 and not P1, but it holds working credentials:

- **`members.json`** — 61 members' bearer tokens, every commit.
- **`google-oauth.json`** — the Google refresh token *and* client secret.
- **`sessions.json` / `tokens.json`** — untracked on 2026-08-19, but they were
  tracked until then even though `.gitignore` named both from the start
  (gitignore does not untrack what is already tracked), so every live session
  id was pushed on each change. **They remain in the pushed history.**

Three ways forward, and it wants a decision rather than a default: accept it
(private repo, SSH-only push, the blast radius is one GitHub account), rotate
the Google credential and the member tokens now that they've been in a remote,
or rewrite the history — cheap today at ~60 commits from 2026-08-18, expensive
later.

The weekly Drive tarball deliberately does **not** carry any of this: the
credential files are excluded and `members.json` goes in redacted, tokens
blanked and tenures kept.

### [P1] 73 open cap-sheet diffs across 25 teams, and 17 teams disagree on Team Salary
**Recounted 2026-08-30**, and it has got much worse rather than better: this
entry read *9 diffs across 6 teams* on 2026-08-09. `/committees/rosters` now reports **136
rows**, of which **73 are open** (this season, or about who is on the roster at
all) and 63 are deferred (a future season's figure, or a hold the site has never
computed — see the grouping in `nbn-api/routers/poopoo.py`).

Two thirds of the growth is new coverage rather than new drift: the job now
compares *every* season column the sheet carries, not just the current one, and
those out-year rows are 61 of the 136. **The current-season aggregate line is
apples-to-apples with the old count, and it went from 2 teams to 17.** Free
agency ran in between.

| Category | Rows |
|---|---|
| `player_future_years` (deferred) | 61 |
| `aggregate` — 17 × Guaranteed Salary, 5 × Hard Cap | 22 |
| `player_extra` — on the site, absent from the sheet | 18 |
| `player_team_conflict` — the two sources disagree on whose player he is | 13 |
| `mle` / `tpe` / `bae` | 14 |
| `player_missing` / `player_salary` / `player_status` / `player_hold_uncalculated` | 8 |

Worst Team Salary disagreements (site − sheet): BKN +$19.21M, OKC +$7.33M,
UTA −$5.08M, MIA +$5.08M, LAL +$4.90M, PHI +$4.60M. **Four teams differ by
exactly ±$2,449,421** (CHI, GSW, PHX, POR) — that is one contract type booked
differently on the two sides, not four independent errors, and it is the
cheapest thread to pull first.

These are now visible to the team that owns them, on its own page (the Cap
Health card, 2026-08-30), which is a reporting fix and not a reconciliation:
every row below is still open.

The 2026-08-09 state, kept because the two resolved cases below explain what a
real fix looks like: 9 diffs across 6 teams — PHI 2 (Guaranteed Salary, MANON
CHRIS), UTA 3 (Guaranteed Salary, HALL PJ, POST QUINTEN), BKN/LAC/WAS 1 each
(MLE Used), TOR 1 (TPE Remaining). Sharply down from 31 diffs / 12 teams on
2026-08-07 — most of that gap (TOR's Hard Cap/player rows, NOP, MEM, MIN, IND, PHX entirely, BKN's/WAS's/LAC's
Guaranteed Salary rows) closed between that review and this one, cause
unconfirmed; **DEN's `Hard Cap` diff is the one resolved in this session and is
understood**: § 4.3's contagion rule was firing on cap-room-absorbed trades,
which it shouldn't (see below) — Keldon Johnson's trade to DEN (2026-07-22)
genuinely cleared via cap room once Marvin Bagley's renounce (logged 18s after
the trade, but clearly meant to precede it) is credited, so the resulting First
Apron hard cap was wrong. Fixed in `nbn-api` (shared `_cap_room_absorbed`
predicate now gates both § 4.3 and § 4.4 contagion, not just
`_check_salary_matching`) and reflected in the rulebook (§ 4.2/§ 4.3/§ 1.4);
DEN's `team-state.json` corrected via an audited `set_hard_cap_level`
transaction (txn `7ad3780dd6be8dc9`) rather than a silent edit.

The remaining "Guaranteed Salary" diffs (PHI, UTA) still carry the same
fractional-cent signature the sheet does that the site doesn't:

    PHI  sheet 177,974,132.5  site 180,125,050
    UTA  sheet 145,202,503.2  site 140,118,523

The sheet is doing arithmetic the site isn't — proration or partial guarantees
is the obvious suspect. Chase that before hand-fixing the rest.

### [P1] Picks conveyance — 88 picks still not cleanly modeled
`poopoo.json` `picks.counts` as of 2026-08-07 — **every count identical to
2026-08-04; nothing moved in three days**:

- `clean_match` 323, `clean_match_frozen` 7 — fine
- `needs_investigation` **32** — no explanation yet
- `same_owner_diff_representation` **35** — right owner, structure differs from the sheet
- `committee_lag` **18** — site is ahead of / behind the committee sheet
- `richness_gap` **3** — sheet expresses conditions the model can't hold (was 24 on 2026-07-22; good progress)

`richness_gap` is nearly closed. The 32 `needs_investigation` are now the real
blocker to trusting `/api/picks` end-to-end.

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

### [P1] 27-28/28-29/29-30 have no cap, apron1 or apron2 — all three read $0
Split out 2026-08-24 from the now-closed extension entry, which carried it as a
footnote; retiring that entry would have lost the one thing still blocking a
real extension from being scored.

Checked against live `cap-levels.json` on 2026-08-24 — the three future seasons
have a **full 11-row `min_salary_scale` but `cap`, `apron1` and `apron2` all
zero**:

| Season | cap | apron1 | apron2 | min scale |
|---|---|---|---|---|
| 25-26 | $154,647,000 | $195,945,000 | $207,824,000 | 11 rows |
| 26-27 | $164,961,000 | $209,015,000 | $221,686,000 | 11 rows |
| 27-28 | **$0** | **$0** | **$0** | 11 rows |
| 28-29 | **$0** | **$0** | **$0** | 11 rows |
| 29-30 | **$0** | **$0** | **$0** | 11 rows |

An extension by definition prices seasons beyond the current one, so
`extension_cap_position` reports "cannot evaluate" for every extension anyone
submits. That is the validator behaving correctly — it refuses to score against
a threshold of zero rather than reporting a team comfortably under a $0 cap —
but it means the § 6.2 pipeline that shipped 2026-08-21 cannot actually reach a
cap verdict on a live proposal.

**Fix is data, not code**, and it is committee-entered: real 27-28+ figures via
`/cap-settings`. Pairs with the minimum-scale entry directly below — same file,
same form, same committee, and worth doing in one sitting.

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
once the sheet is fixed. Nothing to change in code.

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

- `wagler-keaton`'s photo is a **~100KB base64 data URI stored inline in
  `player-bios.json`** — it inflates every `GET /api/players` response for one
  player.
- One player's photo is the only **imgur-hosted** image in the league
  (`i.imgur.com/SaK7v2z.png`), and it currently 429s. The frontend suite reports
  it as a third-party warning on `/players/` and `/draft/` and does not fail on
  it, correctly — but it is a broken image on two real pages.

Both are worth normalising if anyone is in that field anyway. Neither is urgent.

---

## 2. Rule automation gaps

The rulebook badges each section 🔒 system-enforced or 👁 manual review.
Since 2026-08-30 the 🔒 half is **generated** from `nbn-api/rulebook_coverage.py`
and the badges can no longer go stale — 34 sections are enforced, 23 still need
a human, 17 carry both. The six that are manual-only (§ 1.2, 3.7, 4.6, 6.1, 7.3,
7.4) and the partial coverage behind the 17 are the gaps worth closing; each
one's `SECTION_REVIEW` note in that file says what is still missing.

### [P3] Extension eligibility backfill — 116 rostered players still missing an acquisition record
`_player_acquisition_index` (§ 3.8's ledger scan, reused for § 6.2 eligibility)
can't find a `sign`/`sign_pick`/`convert_twoway`/`offer_sheet_decision` entry for
these players, so their contract start date is unknown and eligibility can't be
derived from the ledger.

**Not a blocker for shipping extensions** (decided 2026-08-19,
`docs/poext-extension-pipeline.md` § 2.3a/D1) — a proposal packages whatever
partial ledger history the player has plus the submitting team's own attestation
of when the deal began, and the eligibility check runs off that at warn severity.

**Re-measured 2026-08-25** against the live ledger, and the previous numbers here
(161 of 502, split 97/59/5) were wrong in a way that mattered — acting on them
would have written 23 contracts that do not exist. What is actually true:

| | Count |
|---|---|
| Rostered players | 517 |
| Missing a signing record | **116** (was 151 before that day's backfill) |
| — trade events only | 86 |
| — no ledger events at all | 30 |

- **35 were fixed** on 2026-08-25 by `nbn-api/backfill_rookie_acquisitions.py`:
  2023-2025 draftees, still on the team that drafted them, salaries on file, no
  ledger history at all. For those the absence of a record *is* the evidence —
  the earlier backfill was thorough enough that a gap means they have never
  signed anything but the rookie deal they were drafted into. Written with
  `historical=true`, so no roster, cap or team-state was touched.
- **86 have trade events but no signing.** Acquired by trade with the original
  signing unrecorded, so no rule reaches them — this is the Discord resolver's
  job, not an inference.
- **23 are unsigned 2026 draftees** and are *correctly* recordless. All are
  `type: "draft-rights"` with no salaries, and each already has a `pick`
  transaction from the June 2026 draft. **This is what the old "59 rule-derivable
  from draft_year" figure would have got wrong** — it would have invented a
  rookie contract for every one of them. Nothing to do here; they get a real
  signing when they sign one.
- **7 need a person to state the answer**, not a rule: Giannis (2013), Booker
  (2015), SGA (2018), Herb Jones (2021), Matkovic (2022) are far past a rookie
  deal; `tomlin-naeqwan` has no `draft_team` on file; and `yang-hansen` rosters
  at UTA having been drafted by DAL with no trade on record, so a DAL signing
  would put the ledger at odds with the roster.

### [P1] Qualifying Offers don't exist in the system at all
§ 3.9 defines the QO — it's what makes a sub-4-year free agent an **RFA** rather
than a UFA — but nothing in the API represents one. Three separate consequences,
and the third is already live:

1. **No `qualifying_offer` transaction type.** There is no record that a team
   extended (or declined to extend) a QO. RFA status is asserted by hand, by
   setting `cap_holds[season] = "RFA"` on the bio. `_rfa_eligibility`
   (`transactions.py:2035`) reads exactly that field and nothing else — so the
   RFA/UFA split § 3.9 defines is a manual annotation, not a derivation.
2. **No QO amount anywhere.** § 3.9's Non-QVFA ceiling is "the greatest of 120%
   of the final-year salary, 120% of the applicable minimum, **or (for RFAs) the
   qualifying offer amount**" — and that third branch has no data source, so it
   can't be evaluated. `_BIRD_HOLD_PCT` covers the § 3.10 *hold* (1.3 EQVFA /
   1.2 Non-QVFA); it is not the QO.
3. **The amount formula itself is unratified.** § 3.9 flags it in the rulebook
   as *"a new synthesis modeled on the real NBA CBA, not a rule this league had
   already agreed on"* — pending BOD confirmation.

**This blocks two things.** § 3.15 **offer sheets** are the live one: the whole
matching right flows from RFA status, which flows from a QO the system has no
record of. And the PDC free-agency ballot (`docs/pdc-free-agency-spec.md` § 7.2)
needs a QO line for every RFA — it will ship labelling the figure *estimated*
until this is settled.

Order of operations: get BOD to ratify or amend the § 3.9 formula first, then
add the transaction type and the derived amount. Doing it the other way round
bakes an unratified number into the ledger.

### [P2] Extend-and-trade is referenced but never defined
§ 3.9's raise table has an "Extend-and-trade" row (5% of Year 1, vs 8% for a
normal extension), and § 6.2 repeats the 5% figure — but no section anywhere
defines what an extend-and-trade *is*, when it may be used, or how the
extension and the trade are sequenced.

The row originally cited "§ 8(e)(2)", which is the real NBA CBA's numbering;
this rulebook has Articles I–VII only, so it pointed at nothing. Dangling
citation removed 2026-08-07 — the 5% figure is still correct and still
enforceable, so nothing is blocked, but the mechanism needs writing.

Interacts with `docs/extensions.md`: `ExtensionDetails.kind` already reserves
`"extend_and_trade"` as the value that selects the 5% ceiling.

### [P2] Proration is practiced but undocumented
The league prorates in-season minimum signings, but the rulebook says nothing
about it — zero occurrences of "prorat" anywhere in `rulebook/index.html`.
Confirmed as real practice 2026-08-07.

This matters now that § 3.12 minimums are enforced. `_check_minimum_salary`
works around the gap with a coarse rule: Year 1 of a signing dated outside
Jul–Sep may fall below the full-season minimum (warning, "confirm the
proration"), while the offseason and every later contract year are hard
errors. That's a guess at the season boundary standing in for a rule.

Needs: a § 3.12 subsection stating that in-season minimum signings prorate,
the basis (days? games?), and a season-start date the validator can key off —
at which point the warning can become a real computed check. Grant Williams'
2026-04-11 signing ($39,820) is the live example.

### [P2] One minimum-contract mis-tiering needs manual pricing, plus a hold-placeholder bug in the Aug 2026 FA wave
The re-pricing job this item used to be about now exists:
`nbn-api-dev/reprice_minimum_salaries.py` (2026-09-14, dry-run by default,
`--apply` to write, reuses the same `_min_salary_for`/`_one_year_min_cap_hit`
helpers the signing validator itself checks against, so it can't disagree
with what a fresh signing would be checked against). Population was never
really 1 — that snapshot was taken the day before a 45-contract offseason FA
wave (2026-08-09–08-26). `years_experience` is now persisted onto the
contract record at signing too (`_apply_sign`/`_apply_convert_twoway`,
2026-09-14), so future minimum deals won't need the `draft_year` fallback the
job still falls back to for all 45 of today's, which predate the fix.

First run (2026-09-14) applied 3 corrections: `post-quinten`/`hukporti-ariel`
(trivial $1 rounding drift, 27-28) and `smith-dru` (27-28, $3,450,720 →
$3,219,450) — the last one confirmed to the dollar as fallout of the
now-resolved row-shift bug (the deleted `27-28/28-29/29-30 minimum salary
scales are row-shifted` item, above the § 3.12 entries in this file's history):
his recorded figure matched his correct tier-6 read against the *old, shifted*
table exactly, so he was priced correctly at signing and simply never got the
scale's later fix. Two things still need a human, not the job:

- **One real mis-tiering, unexplained by the shift bug**: `bagley-marvin`
  (drafted 2018 → 8 years' NBA experience, but priced at the tier-2 rate for
  26-27 — a >$1M/season gap). 26-27 is the base table, not a shifted season,
  so this isn't the same mechanical explanation as `smith-dru` — needs someone
  to confirm it's actually wrong before `--apply`.
- **A data bug in the Aug 2026 wave**: `bagley-marvin` 27-28, `battle-jamison`
  28-29, and `cooper-sharife`/`pedulla-sean` 28-29 all carry a stray
  `$0`/`$1` salary entry on the *same* season their own contract also tags as
  a trailing UFA/RFA hold. `_autofill_fa_hold_amounts` skips auto-pricing a
  hold whenever `salaries` already has an entry for that season, so these
  four almost certainly never got a real trailing-hold figure computed at
  all. The re-pricing job now detects this shape and skips it (it can't tell
  a real year from a stub), but doesn't fix it — that's a different bug,
  upstream in whatever produced the stray entry, not a re-pricing question.

Revisit before any 27-28 cap planning.

Related open question for the committee, unchanged: the 27-28+ scales are
projections using a **simple** 5%-of-base escalator (×1.05, ×1.10, ×1.15),
not compounding. Immaterial at three years out, real by year five. Replace
with published NBA figures when they exist.

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

### [P2] 4 players' Bird tenure still unresolved, and `bio["contracts"]` is thin
§ 3.8 tenure itself is settled (2026-08-07): derived from the transaction ledger
via `_bird_tenure`, enforced on both the submit and simulator paths, badge at
🔒 + 👁. 483 of 487 rostered players resolve, with 0 false positives against the
14 real Bird signings on file, and `signing_method="bird_rights"` no longer
bypasses funding validation.

What is still open: **the 4 players who don't resolve**, and `bio["contracts"]`
is still near-empty at 47/1018. The latter is harmless for tenure — nothing
reads it any more — but it means contract *terms* history is thin for every
pre-2026 deal, so anything wanting to know what a deal actually looked like
back then has nowhere to look.

### [P2] § 1.2 soft cap — partly enforced, gap is verification not blocking
Corrected 2026-08-07: the original entry ("over-cap signings lacking a valid
exception aren't blocked, only reviewed") is stale.
`_check_signing_method_funding` already returns `level="error"`, so a declared
method that isn't actually available **does** block. The real remaining hole is
that `signing_method` and `bird_rights_type` are **self-declared and never
verified** — a team can declare `bird_rights` on a player they have no Bird
tenure with and pass clean. Closing it means § 3.8 tenure verification
(below), not a new blocking rule.

### [P3] The 👁 half of the rulebook badges is still declared by hand
Entered 2026-08-16 as "the badges keep going stale", closed 2026-08-30 for the
🔒 half. `nbn-api/rulebook_coverage.py` now computes it: an `ast` pass finds
every `CheckResult` reachable from `_VALIDATORS` (plus the one in
`routers/waivers.py`), `CHECK_SECTIONS` maps each of the 54 check ids to the
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
- `SECTION_ENFORCED_BY` — the one section (§ 5.2) the system enforces by simply
  doing the thing, with no check to find.

Closing this properly means the checks carrying their own § and their own
"what's still manual" note at the emit site, so the whole manifest falls out of
the code. That is a 134-site edit for a badge, which is why it wasn't done now.

Three badges sit outside the generated set on purpose — the § 1.5 buyout
bullet, the "Hard Cap Grace Period" sub-heading and § 3.1's "UFA / RFA
Eligibility" sub-heading. Each is a claim about one clause rather than one
section, so nothing keys them to a §, and they stay hand-written.

### [P3] The compliance board covers roster and cap only — not Stepien, offer sheets or waivers
Entered 2026-08-16 as "no league-wide compliance board"; **the board shipped
2026-09-19** at `/committees/rosters/` (the Compliance tab). It reads `GET /api/cap-history/current` for all
30 teams and runs each row through `cap-health.js` — the same module behind the
team page's Cap Health card and the homepage's chips — so it states no rule of
its own and does no cap math. Today it shows 6 teams below § 2.1's 14-player
floor, 1 owing an Empty Roster Charge, 1 over § 2.2's two-way limit and 7 owing
a trim before opening night, with clickable counters that filter the table.

That closes the part the entry was really about: the counts in this file were
hand-made with a throwaway script, twice, and were stale within a week both
times. Nobody has to write that script again.

What the original entry listed and the board does **not** cover, because no
shared helper produces it yet:

- **Stepien exposure**, open **offer sheets**, open **waiver windows**. Each is
  computed today inside a validator on the submit path, not by anything a page
  can call. Adding one means giving it the `cap-health.js` treatment first — a
  pure function taking its inputs as arguments — not querying for it from the
  page. A second copy is how two surfaces start disagreeing about who is in
  violation.
- **"Who still has to cut."** The 7 teams over 15 are legal until opening
  night, and no regular-season start date exists on the site, so the board says
  a trim is owed without being able to say by when. Whatever fixes § 3.12's
  proration gap (§ 2 above) supplies the same date.
- **The dollar figure of an Empty Roster Charge.** `computeEmptyRosterCharge`
  lives in `teams/team.js`, which injects a whole page into `document.body` on
  load and so cannot be imported; it is not in the cap-history row either. The
  board counts the charge and the team's own page prices it. Extracting that
  function the way `teams/lineup.js` was extracted would close it.

### [P3] Other standing manual-review items
Roughly in order of how often they bite:
- § 4.5 trade restrictions, § 4.6 Touch Rule (multi-team trades)
- § 3.7 DPE — no exception type exists
- § 3.8 Bird Rights tenure never independently verified (self-declared) — promoted to its own P2 entry above
- § 3.10 cap holds, § 3.11 max contracts, § 3.13 contract structure
- § 6.1 options, § 7.4 international rights
- § 3.12 multi-year minimum deals unchecked against the per-year scale
- § 3.15 the 48h match clock and offer-value cap hold aren't modeled

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
switched off, note the dates here.

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

- **Left, and permanent:** the log starts on 2026-08-25. **The two remaining
  fractional-cent poopoo diffs in §1 were the motivating case and it cannot
  answer them** — those edits predate it. This is forensics going forward only.
  Don't re-open this expecting it to explain an old diff.

### [P3] Nothing runs the frontend smoke suite, and authenticated pages are uncovered
`tests/frontend/run.js` shipped 2026-08-25 — puppeteer against a real vhost,
asking each page four things: 200, nothing thrown, every same-origin request
succeeded, and the content the page exists to show actually appeared. It found a
real defect on its first run — the nine `"NA"` `photo_url` bios, fixed
2026-08-29 — which is the argument for the rest of it.

**Coverage went from 18 pages to 43 on 2026-09-19** (22 assertions to 47; a few
pages carry more than one). All 47 pass. Every `min` was read off a real render
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
  43 pages of assertions that only fire when someone remembers. Deliberately not
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
of the shared primitives never got that treatment (counted 2026-08-16):

| Helper | Copies |
|---|---|
| `TEAMS` abbr → name map | **13 files** |
| `displayName()` | **11 files** |
| `parseCSV()` | **10 files** |
| `parseSalary` / `fmtMoney` | **7 files** |

Same failure mode as the contract shorthand, just quieter — one page renders
"Wallace, Keaton" and another "Keaton Wallace". A root `nbn-data.js` carrying
those six, adopted first in the four heaviest consumers (`teams/team.js`,
`players/index.html`, `cap-summary/`, `transaction-sim/`), then opportunistically.

Note the constraint in CLAUDE.md: the 30 team shells load only `team.js`, so it
has to be pulled in the same injected-script + awaited-promise way
`lineupReady` / `contractReady` are, not by touching the shells.

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

- **Extension window UI** — the precondition is met: § 6.2 shipped as a real
  transaction type on 2026-08-21, so the § 6.3 submission windows can now have
  the calendar surface FA has. This is the only part of the extension work
  still outstanding.
- **Cap history chart on the team page** — the rest of per-team cap health
  shipped 2026-08-30: the Cap Health card shows standing against the cap,
  aprons, a hard cap and § 2.1/2.1a/2.2's roster limits, plus this team's own
  rows from the rosters dashboard (`cap-health.js` + `renderCapHealth`, fed by
  `GET /api/poopoo/summary`). What is left is the *history*, and it is data
  rather than work: `GET /api/cap-history?team=UTA` has served a per-day series
  since 2026-08-25, so "when did this team cross the first apron" is a chart
  over an existing endpoint, not a collection problem.

### [P2] The signing and waiver validators still judge off books without the § 2.1a charge
Fixed 2026-09-19 for the surfaces that report a team's *current* books —
`cap_history.build_rows` (so the daily snapshot, `/committees/rosters` and the
homepage card) and `_team_commitment` (so free-agency room) all add
`_real_empty_roster_charge` now. The team page had always charged it, so a
short-handed team read two different Team Salaries depending on the page; DAL,
at 11 standard players, was $1,357,763 apart.

What is left is the *projection* side. `_compute_team_salary` and
`_compute_team_salary_ex_holds` are deliberately still raw, because ~40 callers
use them as a baseline and then apply their own charge for the roster count the
transaction leaves behind — the trade path most visibly
(`current - out + in + charge(after)`). Folding a charge into the helpers would
have every one of those double-count it against a stale pre-transaction count.

So for a team already below 12, `_validate_sign`, `_validate_extension` and the
waiver paths understate projected salary by the charge on the slots *still*
empty after the move. The trade path is unaffected: its 14-player mock is
always at least the real 12-player charge, and it is already computed off the
post-trade count.

The fix is per-validator, not one line: each one that projects a roster count
should price the residual real charge at that count, the way
`_trade_fact_sheet` already prices its mock. Small in dollars — at most 2-3
slots × the rookie minimum, so ~$1.4M-$4M — and it only bites a team that is
both short-handed and within that of a line. Worth doing before a season where
a team sits under 12 for any length of time.

### [P2] Three second-round contracts are still priced off the retired minimum-salary scale
On **2026-09-10** `cap-levels.json`'s `min_salary_scale` was corrected for
**27-28 onward**: every tier from that season on was shifted one index. The old
table carried no real 0-years row at all — its `"0"` was the 1-year figure
(~$2.29M for 27-28, where the rookie minimum is ~$1.43M). 25-26 and 26-27 were
always right, which is why nothing in the current season is affected.

Three § 7.1 second-round scale contracts were entered *before* that correction
and still carry the old figures. Every 26-27 year is correct; only 27-28 onward
is wrong:

| Player | 27-28 | 28-29 | 29-30 | Overstated by |
|---|---|---|---|---|
| Otega Oweh | +$277,523 | +$387,647 | — | $665,170 |
| Joshua Jefferson | +$277,523 | +$387,647 | — | $665,170 |
| Kobe Sanders | +$277,523 | +$387,647 | +$506,591 | $1,171,761 |

Flat tier 1 under the corrected table is $2,294,372 / $2,403,628 / $2,512,883
for 27-28 / 28-29 / 29-30. The trailing § 3.10 RFA hold on each deal is
auto-priced off the cap and is a separate question.

**No current-season figure is wrong**, so nothing is mis-enforced today — but
future-year Team Salary, apron projections and any extension priced off these
reads high, and `/api/validate/sign_pick` would now reject these exact
contracts if they were resubmitted.

Re-pricing an executed contract is the office's call, not a cleanup script's.
The mechanical part is three `PUT /api/players/{slug}` edits, which land in
`edits.jsonl` on their own; what needs deciding first is whether a deal signed
in good faith against a bad table gets corrected or honoured.

Found 2026-09-19 via `tests/test_second_round_scale.py`, which had been failing
since the correction because it pinned the old figures as literals. The test
now derives everything from `cap-levels.json`.
