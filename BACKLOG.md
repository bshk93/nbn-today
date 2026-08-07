# NBN — Backlog

Internal working list of what needs doing and what would be nice to have.
Not linked from nav; the member-facing board is `/suggestions` (currently empty).

Last reviewed: **2026-08-07** (against version 0.0.383).

Legend: **[P1]** correctness/data integrity · **[P2]** should do · **[P3]** nice to have

---

## 1. Data integrity / open reconciliation

### [P1] 31 cap-sheet diffs across 12 teams still unreconciled
`/poopoo` (`build/poopoo.py` → `poopoo.json`, regenerated 2026-08-07) reports:

| Team | Diffs | Fields |
|---|---|---|
| TOR | 9 | Guaranteed Salary, Hard Cap, MLE Used, TPE Remaining, Moses Moody, Luke Kennard, Trayce Jackson-Davis, Jordan Hawkins, Ryan Nembhard |
| NOP | 3 | Guaranteed Salary, MLE Used, Tre Mann |
| UTA | 3 | Guaranteed Salary, HALL PJ, POST QUINTEN |
| WAS | 3 | Guaranteed Salary, MLE Used, MCCOLLUM CJ |
| BKN | 2 | Guaranteed Salary, Keldon Johnson |
| LAC | 2 | Guaranteed Salary, MLE Used |
| MEM | 2 | Guaranteed Salary, MLE Used |
| MIN | 2 | Guaranteed Salary, Mark Williams |
| PHI | 2 | Guaranteed Salary, MANON CHRIS |
| DEN | 1 | Hard Cap |
| IND | 1 | Tobias Harris |
| PHX | 1 | Daniel Gafford |

**This got worse, not better** — 22/9 teams on 2026-08-04 → 31/12 now. New since
then: MEM, PHX, WAS; TOR grew 7→9, MIN 1→2. Nothing resolved.
Committee fixes were sent 2026-07-13; these are what survived.

"Guaranteed Salary" now recurs on 9 of the 12 teams. The earlier hunch was that
this is one systemic cause — partly right, but not a single missing addend: the
deltas run in **both** directions and aren't a constant. The real tell is that 5
of the 9 sheet values carry fractional cents while every site value is a clean
integer:

    BKN  sheet 178,853,658.6  site 157,458,309
    MEM  sheet 187,745,791.1  site 202,789,791
    PHI  sheet 177,974,132.5  site 180,125,050
    TOR  sheet 211,462,407.4  site 200,902,663
    UTA  sheet 145,202,503.2  site 140,118,523

The sheet is doing arithmetic the site isn't — proration or partial guarantees
is the obvious suspect. Chase that before hand-fixing 31 rows.

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
- Trades: 437 of 485 raw messages submitted; 153 flagged unresolved.
- FA signings: 1498 of 2081 submitted; 162 flagged, 538 skipped.
Spec in `nbn-api/docs/discord-transaction-backfill.md`. The 538 skipped FA rows
have never been triaged — decide whether they're genuinely out of scope or a gap.

### [P3] 28 player slugs are still in first-last order
e.g. `keaton-wallace`, `mark-sears`, `armando-bacot` instead of `wallace-keaton`.
(32 flag on a naive check; 4 are false positives with multi-word last names —
`da-silva-tristan`, `de-larrea-sergio`, etc.)

This is a **different population** from the 2026 prospect re-key, which is done:
24 of the 28 have `draft_year: null` (undrafted), the rest are scattered across
2024/2025/2026. Duplicate `/players` cards are resolved either way — 0 duplicate
names across 1018 bios.

Slugs are permanent keys by design (CLAUDE.md § Data model); re-keying orphans
stats/awards/OVR references. If none of these players ever accumulate stats, the
cost of leaving them is zero. Probably accept and close rather than fix — but
worth an explicit decision so it stops getting rediscovered.

### [P3] Stale backups in NBS_DATA_DIR
`player-bios.json.bak` ×4, `allstats-playoffs-26.csv.bak-round-fix`,
`allstats.csv`, `tokens.json`, and `rules/` (retired per CLAUDE.md, 8 files
still on disk). Nothing reads them; they're a "which one is real?" trap.

---

## 2. Rule automation gaps

The rulebook badges each section 🔒 system-enforced or 👁 manual review.
19 sections carry an enforced badge; the ones below are the gaps worth closing.

### [P1] No `extension` transaction type at all
§ 6.2 and § 6.3 (extensions, submission windows) have **no** representation in
the API. `transactions.py` implements: `sign`, `pick`, `option`, `guarantee`,
`release`, `renounce`, `trade`, `convert_twoway`, `sign_pick`, `void_player`,
`set_hard_cap`, `offer_sheet`. An extension today is entered as a `sign`, which
loses the fact that it was an extension and skips every § 6.2 constraint.
This is the largest single hole in transaction coverage.

### [P2] § 7.2 seven-year advance limit unenforced
The Stepien half of § 7.2 *is* enforced (`_check_stepien_rule`,
`transactions.py:2687`, with `tests/test_stepien_rule.py`). The companion rule —
picks may only be traded 7 years out — has no check. Cheap to add next to the
existing one.

### [P2] § 7.2 rulebook badge is stale
Section still reads 👁 manual review only, despite Stepien going live
2026-07-23. Should be 🔒 + 👁. Badge accuracy is the whole point of the system;
one wrong badge undermines the rest.

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

### [P2] `rescind_renounce` not implemented
§ 3.15 explicitly says so: on an RFA match, rescinding renouncements is done by
hand. Small, well-specified transaction type.

### [P2] § 1.2 soft cap — partly enforced, gap is verification not blocking
Corrected 2026-08-07: the original entry ("over-cap signings lacking a valid
exception aren't blocked, only reviewed") is stale.
`_check_signing_method_funding` already returns `level="error"`, so a declared
method that isn't actually available **does** block. The real remaining hole is
that `signing_method` and `bird_rights_type` are **self-declared and never
verified** — a team can declare `bird_rights` on a player they have no Bird
tenure with and pass clean. Closing it means § 3.8 tenure verification
(below), not a new blocking rule.

### ~~[P2] § 3.8 Bird Rights tenure never verified~~ — DONE 2026-08-07
Now derived from the transaction ledger (`_bird_tenure`), enforced on both the
submit and simulator paths, badge updated to 🔒 + 👁. Over-declaration errors;
lower-bound and unverifiable cases warn. 483/487 rostered players resolve; 0
false positives against the 14 real Bird signings on file. Closed alongside it:
`signing_method="bird_rights"` no longer bypasses funding validation.

**Residual:** the 4 unresolved players, and `bio["contracts"]` is still
near-empty (47/1018) — harmless now that tenure doesn't read it, but it means
contract *terms* history is thin for pre-2026 deals.

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
team-state history; we have 1. Genuinely blocked on time, not effort — revisit
around 2029.

---

## 3. Tooling / infrastructure

### [P1] Production runs off an unmerged feature branch
`nbn-api` is on branch `picks-conveyance-phase0`, **58 commits ahead of
`main`** — and the systemd service serves directly out of that working
directory, so that branch *is* production. `main` no longer describes what's
running. Decide whether to merge the branch to `main` or rename it.

~~Both repos have 28 unpushed commits each.~~ **Resolved as of 2026-08-07** —
`nbn-today` and `nbn-api` both report 0 unpushed against their upstreams, so
the "disk failure loses ~4 weeks of work" risk is gone. Only the branch
question remains.

### [P2] `NBN_ADMIN_TOKEN` still wants rotating
Leaked into a transcript by an accidental `export $VAR` typo during the Discord
backfill work (2026-07-10). Flagged then, believed never done — verify before
acting; if it's already rotated, delete this item.

### [P2] Pre-commit hook only fills the *top* changelog entry
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

### [P2] No frontend test coverage
`build/smoke_test.py` (165 checks, currently green) guards the *data contract*
only — that pages can still find the columns they read. Nothing checks that a
page renders. The API side has 5 test files (`stepien_rule`, `tpe_and_hardcap`,
`picks_matching`, `signing_method_funding`, `exception_absorption_split`).
Puppeteer + Chromium does work in this environment; a handful of
"page loads, table has rows, no console errors" checks would catch a whole class
of breakage the smoke test can't see.

### [P3] `/suggestions` board is empty
seq is at 3, items is `[]` — three were filed and deleted. Either seed it with
the member-facing subset of this file, or the page reads as abandoned.

### [P3] Unlinked pages
`/cap-settings`, `/clusters`, `/context`, `/how-to-rosters`, `/join`, `/legal`,
`/poopoo`, `/rookie-scale`, `/strikes` exist but aren't in `nav.js`. Some are
deliberately internal (`/poopoo`, `/cap-settings`); others look like they were
just forgotten (`/how-to-rosters`, `/rookie-scale`). Worth a pass to decide
which are intentional and note it, so the next reviewer doesn't re-ask.

### [P3] `/api/rookie-scale` returns empty
Real figures live in the cached league sheet's "{year} Rookie Contracts" tab
(columns shifted +1 season). Either populate the endpoint or drop it — an empty
endpoint that looks authoritative is worse than none.

---

## 4. Nice to have

- **Extension window UI** — once § 6.2 exists as a transaction type, the
  submission windows in § 6.3 want a calendar surface like FA does.
- ~~**Trade sim → real transaction**~~ — **deliberately not doing this.** The
  simulator (now `/transaction-sim/`, covering trades, FA signings and RFA
  offer sheets) is read-only by design: `/api/validate/*` never writes, and
  there is intentionally no path from it to a submission. Decided 2026-08-07.
- **Per-team cap health on the team page** — `/poopoo` diffs are league-wide and
  internal; a team's own owner can't see that their sheet disagrees with the site.
- **Franchise records beyond single games** — season-level franchise records
  (best team season, best individual season per franchise) using data the build
  already computes.
- **Player page: contract timeline** — salaries/cap_holds/guarantees are all in
  the bio; a visual year-by-year bar would make option and guarantee dates read
  at a glance.
- **Search over transactions** — `/transactions` lists them; there's no way to
  ask "every trade involving this pick" or "everything TOR did in the 25-26
  league year".
