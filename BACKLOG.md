# NBN — Backlog

Internal working list of what needs doing and what would be nice to have.
Viewable at `/backlog` (admin-only nav link); the member-facing board is `/suggestions`.

Last reviewed: **2026-08-25** (against version 0.1.105). **35 open items** — 8 P1, 13 P2, 9 P3, plus 5 nice-to-haves.

Legend: **[P1]** correctness/data integrity · **[P2]** should do · **[P3]** nice to have

**Everything in this file is open. There are no strikethroughs and no done
section** — a finished item is deleted, and git history is where it lives
afterwards. If a job is mostly done but leaves something real behind, the entry
is retitled to name *what is left*, never the part that finished. The previous
convention titled such items by their completed half and struck them through,
which made the same list read as both done and open; it is not coming back.

---

## 1. Data integrity / open reconciliation

### [P1] Plaintext GitHub token in the retired Shiny checkout
`/srv/shiny/nothing-but-stats/.git/config` has `origin` set to
`https://ghp_…@github.com/bshk93/nothing-but-stats` — a personal access token
in plaintext, still valid on the account. Flagged 2026-08-18, unanswered,
re-confirmed present 2026-08-19. The project is retired; rotate the token and
switch that remote to SSH (or delete it).

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

### [P1] 9 cap-sheet diffs across 6 teams still unreconciled
`/poopoo` (`build/poopoo.py` → `poopoo.json`, regenerated 2026-08-09) reports:

| Team | Diffs | Fields |
|---|---|---|
| PHI | 2 | Guaranteed Salary, MANON CHRIS |
| UTA | 3 | Guaranteed Salary, HALL PJ, POST QUINTEN |
| BKN | 1 | MLE Used |
| LAC | 1 | MLE Used |
| TOR | 1 | TPE Remaining |
| WAS | 1 | MLE Used |

Sharply down from 31 diffs / 12 teams on 2026-08-07 — most of that gap (TOR's
Hard Cap/player rows, NOP, MEM, MIN, IND, PHX entirely, BKN's/WAS's/LAC's
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
  (see `docs/clean-up-the-poopoo-spec.md` § 7) — needs an admin/committee pass.
- FA signings: 1498 of 2081 submitted; 162 flagged (**now member-facing** at
  `/cleanup`, "Discord Backfill" — live 2026-08-16), 538 skipped.
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

### [P1] 27-28/28-29/29-30 minimum salary scales are row-shifted — multi-year minimums fail
Entered 2026-08-10 via `/cap-settings`. Each season's column is the 26-27 scale
shifted **up one experience row** per year out, then escalated:
`season_n[r] == 26-27[r+n] × (1 + 0.05n)` — verified 11/11 rows on 27-28, and
all three seasons match within $4.

That pre-bakes the experience diagonal into the table. The validator already
walks it (`_contract_years_exp` steps the row one per contract year and reads
that season's column), so it **double-steps**: Year 2 of a 3-year minimum reads
$2,571,895 instead of $2,294,372. hkd's own worked example fails validation
today and passes against unshifted tables. Confirmed both ways.

Fix is data, not code — store the **true per-season scale** (same rows as
26-27, escalated, no shift). Corrected tables computed and verified 2026-08-10;
**not written, awaiting a go-ahead** since this is committee-entered data.
Two independent reasons unshifting is the right direction rather than changing
the code:

- A deal signed *in* 27-28 reads that column directly and would be one tier too
  high across the board. The shifted table is only valid for 26-27 signings.
- § 2.1a's Empty Roster Charge takes `scale["0"]` for the current season. Once
  27-28 is the live league year that returns $2,294,370 against a true rookie
  minimum of $1,425,651 — a 61% overcharge per empty slot, counted as real
  guaranteed salary against Hard Cap and both aprons.

Also: all three seasons were saved with `cap`, aprons and EAPS at **0**. Harmless
today (§ 3.11's max-salary check reads a 0 cap as "can't check" and skips rather
than miscalculating) but it is a silent skip, and those fields are needed before
27-28 goes live.

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

### [P3] 48MB of June 1 copies left by the retired stats mirror
Found 2026-08-19 closing Phase 2 item 13. `stats.nbn.today` is **already dead** —
its vhost sits in `sites-available` unenabled, the host does not resolve, and
nothing in the site links to it. `/var/www/stats.nbn.today/files/` still holds
184 files (48MB) from June 1.

Verified before filing this: 11 of the 12 `allstats-*.csv` there are exact byte
prefixes of the live files, and the twelfth (`allstats-playoffs-26.csv`) is a
CRLF-converted, pre-round-fix, 1,400-row copy whose original is kept as
`.bak-round-fix` in the data dir. **Nothing there is unique.**

Left in place deliberately — the dev-deploy spec's rule is that a copy of the
unrebuildable data is never deleted on a judgement call, and 48MB on a disk at
61% is not urgent. This is a disk-space cleanup for whenever someone wants it,
not a data question. Same "which one is real?" trap as the entry below.

### [P3] Stale backups in NBS_DATA_DIR
`player-bios.json.bak` ×4, `allstats-playoffs-26.csv.bak-round-fix`,
`allstats.csv`, `tokens.json`, and `rules/` (retired per CLAUDE.md, 8 files
still on disk). Nothing reads them; they're a "which one is real?" trap.

**That blocker is lifted as of 2026-08-24.** This entry said "don't clear these
until real backups exist", and real backups have existed since 2026-08-18 —
`/var/lib/nbs-backup.git` snapshots every 10 minutes and pushes off-site, so
`player-bios.json` now has proper history and these `.bak` files are no longer
the only copies of it on the machine. Clearing them is a decision someone can
just make now, not something waiting on other work.

**13 more were added 2026-08-24** (`*.bak-rekey2-20260824-010951`) by the slug
re-key, on the same principle the 2026-08-16 pass used. Sweep them with the
rest once the re-key is trusted.

**Not to be confused with the 86 root-level derived copies, which were removed
2026-08-19.** The data-dir root also held a complete shadow set of the build's
86 outputs (`league-history.csv`, `hof.csv`, `{abbr}-seasons.csv`, …) left by the
last R run before the cutover — the build writes to `derived/` and had stopped
maintaining them. Nothing read them: `public/` resolved every one into
`derived/`, no code path referenced a root copy, and the data dir's own
`.gitignore` names them, so they were never in the backup set. They were an
active trap rather than dead weight — the classics skill was reading the root
`league-history.csv` and would have reported eleven 20-21 champions. Different
class from the entries above, which are the *only* copies of unrebuildable
state; these were regenerable in 35s and both engines honour `NBN_OUT_DIR`, so
neither the Python path nor the R rollback recreates them.

---

## 2. Rule automation gaps

The rulebook badges each section 🔒 system-enforced or 👁 manual review.
19 sections carry an enforced badge; the ones below are the gaps worth closing.

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

### [P2] § 3.12 minimum contracts track the scale, but nothing re-prices them
Settled as league policy 2026-08-10 and written into § 3.12: a minimum
contract's salary in any season is **the applicable minimum for that season**,
not the dollar figure recorded when it was signed. The Minimum Salary Scale is
re-set every league year (hkd: "something that will have to be modified on a
yearly basis"), so each revision is worth real money to every minimum deal
running through that season. This is the NBA model and was chosen deliberately
over the alternative (figures fixed at signing).

Nothing implements it. The recorded amounts are refreshed by hand, so a deal
running past a revised season reads at its old figures — **and that season's
Team Salary with it** — until someone updates it. § 3.12's "still manual
review" paragraph says so rather than hiding it.

Deliberately not built on 2026-08-10 because the population was **1**: only two
`sign` transactions in the entire ledger set `signing_method: "minimum"`, and
one of those is single-year. An engine that mutates roster state whenever a
config value is edited is a bad trade for one contract — a typo in
`/cap-settings` would silently re-price the league.

Two things already established, worth not rediscovering:

- **A minimum contract is a pure function of (first season, years of
  experience, scale)** now that `contract.years_experience` exists (§ 3.12,
  added 2026-08-10). The refresh is a job to run, not a deal to reconstruct, so
  building it later costs the same as building it now.
- **Identify them by the ledger's `signing_method`, never by salary level.** 58
  rostered players carry a 27-28+ salary at or below the veteran minimum, but
  they are overwhelmingly second-rounders on **rookie-scale** deals
  (`barnhizer-brooks`, `brea-koby`, `brown-kobe`, …). Rookie scale is a
  different table entirely and must never be re-priced by § 3.12.

Revisit when minimum signings become common, or before any 27-28 cap planning —
whichever comes first. Wants a preview-then-apply shape (show the diff, apply on
confirmation), not an automatic hook on `PUT /api/cap-levels/{season}`.

Related open question for the committee: the 27-28+ scales are projections
using a **simple** 5%-of-base escalator (×1.05, ×1.10, ×1.15), not compounding.
Immaterial at three years out, real by year five. Replace with published NBA
figures when they exist.

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

### [P2] The rulebook's 🔒/👁 badges are hand-maintained and keep going stale
Entered 2026-08-16. The badges are the site's only answer to "is this rule
actually enforced?", and they are curated by hand against code that moves
underneath them. This has already gone wrong twice: § 7.2 read 👁-only for two
and a half weeks after Stepien went live (closed 2026-08-09, above), and
§ 3.12's enforcement story changed twice *in one day* on 2026-08-13.

The inputs to compute them already exist. `transactions.py` names its checks
(`check="roster_size"`, `"two_way_slots"`, `"rookie_scale"`,
`"bird_rights_forfeited"`, … — 20+ literal ids) and its check messages cite
32 distinct `§ x.y` sections. Emit a coverage manifest from `_VALIDATORS` plus
those ids → sections, render the rulebook badges from it, and have
`build/smoke_test.py` fail when a section's badge disagrees with what the code
checks.

Worth more than the badges themselves: it turns this entire section of the
backlog from a curated list into a computed one, which is the only version that
stays true between reviews.

### [P2] No league-wide compliance board — § 2.1 shortfalls are invisible today
Entered 2026-08-16. `/poopoo` answers "does the site match the sheet". Nothing
answers "does the league match the rulebook". Counting `type` off
`player-bios.json` against all 30 `{abbr}-roster.csv`, **recounted 2026-08-24**:

| Condition | Teams |
|---|---|
| Below § 2.1's **14-player minimum** (year-round; two-ways excluded per § 2.2) | **3** — DAL 11, BKN 13, HOU 13 |
| Below § 2.1a's **12-player Empty Roster Charge floor** | **1** — DAL, at 11, so 1 charged slot |
| Above 15, owing a trim before opening night (§ 2.1 offseason ceiling of 20) | **13** — ATL/BOS/CLE/LAC/MEM/PHI/SAS 16, CHA/MIN/UTA 17, MIL 18, LAL/POR 19 |

The teams over 15 are fine for now — § 2.1's offseason ceiling is 20 — but owe a
trim, and no deadline for it appears anywhere on the site. The ones under 14 are
a different matter: **§ 2.1's minimum is year-round, so they are under the line
today**, and only DAL is low enough to actually be charged for it (§ 2.1a's real
floor is 12). DAL's charge presumably computes correctly on its own page.

**The eight-day drift is the argument for the board.** On 2026-08-16 this read
6 teams under 14 and 4 over 15; today it is 3 and 13. Nobody moved a policy —
free agency simply ran. A hand-counted table in a backlog file is out of date
within a week, which is precisely why the count needs to live on a page.

The point is that **the only place any of this is visible is one team page at a
time** — nothing states how many teams are out of compliance, or with what.

One board covering § 2.1 floor/ceiling, § 2.2 two-way slots, hard cap/apron
position, Stepien exposure, open offer sheets and open waiver windows is mostly
assembly of helpers that already exist. It is also the natural home for "who
still has to cut" once a regular-season start date is set, and it fills the
"per-team cap health" nice-to-have (§ 4) from the league side.

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
team-state history; we have 1. Genuinely blocked on time, not effort.

**Corrected 2026-08-16: "revisit around 2029" was the wrong conclusion from the
right diagnosis.** Nothing is recording team-state history *now*, so waiting
until 2029 to start collecting means shipping around 2033. Start the nightly
snapshot (§ 3, "Nothing records team-state over time") and this becomes a
waiting problem instead of a blocked one.

---

## 3. Tooling / infrastructure

### [P1] Cap side-doors leave no diff — only a one-line journald entry
Entered 2026-08-16. `POST /api/transactions` is audited to the dollar. These
change the same state, bypass the ledger entirely, and record almost nothing:

- `PUT /api/players/{slug}` — rewrites `salaries`, `cap_holds`, `guaranteed`,
  `guarantee_dates` (rosters role)
- `PUT /api/roster/{team}`, `PUT /api/deadcap/{team}`, `PUT /api/picks/...`

Each writes a `log_write(info, "PUT players/{slug} (NAME)")`
(`routers/players.py:224`, `roster_picks.py:49,84`) → `logger.info` → journald.
That records *who touched what*, never *what it was before* or *what it became*.
So "who moved UTA's Guaranteed Salary, and when" is unanswerable today — which
is exactly what the two remaining fractional-cent poopoo diffs in §1 need.

Unusually cheap because there is already one choke point: **every** write in the
API funnels through `storage.py:_atomic_write`. Have `_save_json` / `write_csv`
append a `{ts, actor, path, diff}` line to an append-only `edits.jsonl` before
replacing. Obvious surface later: an "Edits" tab beside the ledger on the player
page. Pairs with the backup item above — one is recovery, this is forensics, and
neither exists.

### [P2] `NBN_ADMIN_TOKEN` still wants rotating
Leaked into a transcript by an accidental `export $VAR` typo during the Discord
backfill work (2026-07-10). Flagged then, believed never done — verify before
acting; if it's already rotated, delete this item.

### [P2] No frontend test coverage
`build/smoke_test.py` (166 checks, re-run green 2026-08-24) guards the *data
contract* only — that pages can still find the columns they read. Nothing checks
that a page renders. The API side is now at **31** test files (was 5 when this
was written), so the imbalance is sharper than it reads: the backend is well
covered and the 114 pages have nothing.
Puppeteer + Chromium does work in this environment; a handful of
"page loads, table has rows, no console errors" checks would catch a whole class
of breakage the smoke test can't see.

### [P2] Nothing records team-state over time
Entered 2026-08-16. Every cap figure the site shows is *now* — there is no
history of where a team sat. A nightly append of each team's cap total, apron
position and hard-cap level is ~20 lines against helpers that already exist
(`_compute_team_salary*`), and it pays three ways:

- It is the missing input for § 7.3's second-apron pick freeze (§2 above), which
  is otherwise waiting on time that isn't being banked.
- Cap position over time on the team page, and "when did this team cross the
  first apron" — currently unanswerable.
- The same forensic material the two P1s above want.

Consistent with the standing rule to snapshot state *at* the moment it is true
rather than reconstructing it later by replaying the ledger.

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
- **Per-team cap health on the team page** — `/poopoo` diffs are league-wide and
  internal; a team's own owner can't see that their sheet disagrees with the site.
  The league-wide compliance board in §2 is the same need from the other end;
  do them together if either gets picked up.
- **Franchise records beyond single games** — season-level franchise records
  (best team season, best individual season per franchise) using data the build
  already computes.
- **Player page: contract timeline** — salaries/cap_holds/guarantees are all in
  the bio; a visual year-by-year bar would make option and guarantee dates read
  at a glance.
- **Search over transactions** — `/transactions` lists them; there's no way to
  ask "every trade involving this pick" or "everything TOR did in the 25-26
  league year".
