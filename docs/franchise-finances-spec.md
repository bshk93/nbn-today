# Front Office Ledger — franchise finances spec

**Status:** draft, not built (2026-10-24). Backlog: "Front Office Ledger" under
§ 4 Nice to have.

A fake, tongue-in-cheek P&L for every franchise: ticket sales, merch, media,
payroll, a "luxury tax" bill, and a franchise valuation reconstructed over all
of NBN history. Flavor only. It exists to make the league feel like a league,
and to give NBN Today and Discord something to roast.

## Decisions (settled with the user, 2026-10-23/24)

- **Cosmetic only.** No link to NB¥ balances, the cap, the validators or the
  rulebook. Nothing here goes through `nbn-api/routers/wallet.py`.
- **Equal markets.** Every team has the same arena, ticket price and media
  deal, and starts at the same valuation. Every difference comes from what
  happened on the court.
- **No owner levers.** No ticket pricing, no decisions. Nobody can play it.
- **Tongue in cheek.** Line items, headlines and labels are written for laughs.
  The numbers stay plausible.
- **Denominated in NB¥, at NBA scale.** Every team starts at **¥3.0B** in 20-21.
  The scale is only there to make the numbers easy to think about. These are
  display figures: the page says "Franchise figures. Not spendable." and they
  never appear next to a member's real balance.
- **Milestones barely count.** Only an all-time top-10 pass (already detected
  by `milestones.js`) gives a one-game merch bump. Round-number totals are too
  common to matter.
- **Star power is All-Star count**, from `players/player_awards.csv`, because it
  covers every season. OVR only exists from 2025-09.
- **Stream bonus stays**, though it only exists from 26-27 (see below).

## Principles

- **Derived, never stored.** Every figure is recomputed from data we already
  keep. Nothing to back up, nothing to drift.
- **Deterministic.** Randomness is seeded on game identity (date + both teams),
  so a reload or a rebuild never changes history.
- **Versioned formula.** A formula change rewrites all history, which is fine
  for flavor. The page shows "Model v1" so a change is visible, and the
  constants live in one place.
- **Valuation only uses full-history inputs.** Winning, playoffs, titles and
  awards exist for every season; payroll does not. Payroll feeds profit, never
  valuation, so the valuation plot has no step where a data source begins.

## What the data supports

| Input | Coverage | Source |
|---|---|---|
| Games, home/away, scores | 20-21 → now | `allstats-*.csv`. The away side's `OPP` is `@HOME` (`OPP_RAW` strips the `@`, so don't read that one) |
| Playoff home games | 21 → now | `allstats-playoffs-*.csv`, same `@` marker |
| Series results, titles | 21 → now | `standings/playoff-brackets.csv`, `{abbr}-seasons.csv` |
| All-Stars, MVP, ROTY etc. | 20-21 → now | `players/player_awards.csv` |
| Payroll, apron position, dead money | 2026-08-25 → now, daily | `cap-history.jsonl` |
| Streamed games | 26-27 → now | `schedule-26-27.json` (`stream` flag) |

**Home/away gaps.** 19 of 7,380 regular-season games (20-21 to 25-26) have no
single away side (2 in 20-21, 6 in 21-22, 6 in 22-23, 5 in 25-26). Every
playoff game is clean. The ledger splits those 19 games' gate 50/50 rather than
guessing. They may be real data errors and are worth a separate look, through
`nbn-api/edit_allstats.py` only.

## Revenue (per team per season)

All amounts in NB¥. Starting constants, to be tuned against the sanity checks.

### 1. Regular-season gate — per home game

`gate = 19,000 seats × ¥120 × fill`

`fill` for one home game, clamped to `[0.45, 1.00]`:

| Term | Value |
|---|---|
| Base | 0.60 |
| Form | up to +0.25, linear in the home team's win % over its previous 10 games (season-to-date before game 10; the season opener uses last season's final win %) |
| Home stars | +0.05 per All-Star on the home team that season, max 2 |
| Visiting stars | +0.02 per All-Star on the visitors, max 2 |
| Bandwagon | last season's finish: title +0.10, Finals loss +0.07, conf finals +0.04, second round +0.02. Fades: full the next season, half the one after, a quarter the third |
| Noise | ±0.04, seeded on the game |

A season's gate is the sum over its actual home games, so a team that hosted
42 games earns a little more than one that hosted 40. A fill of 1.00 prints as
"sellout" on the box score.

### 2. Playoff gate

Every playoff home game sells out, at a round multiplier on the regular-game
gate: R1 2×, R2 2.5×, conf finals 3×, Finals 4×. Home games come straight from
the playoff box scores. A seven-game series is literally good business, and
the page should say so.

### 3. Merch

Flat base ¥40M, plus: ¥8M per All-Star, ¥15M for an MVP, ¥6M for a ROTY,
¥30M for a title. ¥2M per all-time top-10 pass (the only milestone that counts).

### 4. Media

Flat league share, ¥150M, the same for everyone. Plus the **NBNTV bonus**:
¥1.5M per streamed game the team plays in (home or away), from 26-27 on.

The stream bonus starts in 26-27 because stream flags only exist from then.
Every team gets streamed games, so it should read as a small league-wide step
that season rather than a jump for one team. The sanity checks confirm it stays
small.

### 5. Championship bonus

One-time ¥100M in the title season.

## Expenses (26-27 on)

| Line | Source | Label |
|---|---|---|
| Payroll | mean daily `salary` in `cap-history.jsonl` over the season | "Payroll" |
| "Luxury tax" | a fake bill off `apron_position`: none / over the tax / first apron / second apron, rising steeply | "Luxury tax (allegedly)" |
| Dead money | the team's deadcap for that season | "Paid to not employ him" |
| Arena ops | ¥0.8M per home game | "Hot dogs, mostly" |

Check whether `cap-history.jsonl`'s `salary` already includes dead money
before adding the dead money line, so it isn't counted twice. If it does, show
dead money as a breakdown of payroll rather than a separate expense.

Seasons before payroll data show expenses as **"Records lost in the 2025 Front
Office Fire."** Profit is blank for those seasons, not zero.

## Valuation

- 20-21: every team ¥3.0B. Prior revenue is seeded at the league average, so
  the trailing average in the formula below is level for everyone.
- Each later season:

  `value = multiple(season) × trailing 3-season mean revenue × brand`

  - `multiple` is the same for every team and grows by a fixed rate each year
    (start: chosen so 20-21 lands on ¥3.0B, then +6% a year), so the whole league
    inflates together.
  - `brand = 1 + 0.04 × titles in the last 6 seasons`.
- Revenue here **excludes the NBNTV bonus**, so the 26-27 data step can't move
  valuations. It still shows in that season's P&L.

## Outputs

1. **`/finances` league page**
   - **Valuation over time**: one line per franchise, 20-21 to now, with a
     league-average line. Hover or pick a team to highlight it; title seasons
     carry a 🏆 marker. This is the main sanity-check tool.
   - **Per-season breakdown on hover/click**: revenue by line, change in value,
     and the biggest driver ("+¥210M: playoff gate, 11 home games"). When a
     line moves wrong, this says which term did it.
   - **Most Valuable Franchises** table for a chosen season, with
     year-over-year change.
2. **Team page Finances tab**: that team's P&L by season, and its own
   valuation line against the league average.
3. **Box score attendance**: "Attendance: 18,204" or "Attendance: 19,000
   (sellout)", on every game back to 20-21.
4. **Owners**: "Value added" during each GM's tenure (valuation at the start vs
   the end of their run). Unlike profit it has full history. Best Steward and
   Biggest Money Pit fall out of it.
5. **Later**: feed and NBN Today headlines ("PHX posts record loss after a ¥40M
   tax bill"), generated sponsor names, a Business section in the season recap.

## Sanity checks

Pinned as a test once built:

- A champion's value rises in its title season.
- A team that misses the playoffs every season ends below the league average.
- Six-season spread: top ÷ bottom valuation between 1.3× and 2×. Wider means a
  term is too strong.
- No visible step at 25-26 or 26-27, where new data sources begin. Valuation
  doesn't read payroll or the stream bonus, so any step there is a bug.
- Fill-rate distribution looks real: some sellouts every season, few games at
  the 0.45 floor.

## Where it would live

- **Season figures**: a new step in `nbn-api/stats_build/` writing
  `data/franchise-finances.csv` — one row per team per season, each line item,
  profit (blank before 26-27), valuation, and the model version. Built from
  files the pipeline already reads, plus `cap-history.jsonl` and the schedule.
  Needs a `smoke_test.py` schema entry; `link-public.sh` publishes it.
- **Per-game attendance**: `data/franchise-attendance.csv` from the same step
  (one row per game), or computed in `GET /api/boxscores` from the same
  function. Prefer the CSV, so the box score and the season gate can never
  disagree.
- **Page**: `finances/index.html`, plus an OG entry in `build/og_tags.py` and a
  `NAV_SECTIONS` row in `nav.js`. The team tab goes in `teams/team.js`.

## Open

- The constants above are first guesses. Tune them against the sanity checks
  on the reconstructed history before the page ships.
