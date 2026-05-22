# Draft Rules

See `README.md` for league-wide constants.

---

## Draft Format

The draft has **2 rounds**. The number of picks per round equals the number of teams in the league — currently **30**, but this is dynamic and will increase if the league expands. Any rule or system that references pick numbers (e.g., the rookie scale tier for a given slot) must derive the total picks per round from the current team count rather than treating 30 as a fixed constant.

<!-- Draft order: reverse standings, lottery, or other? Lottery odds methodology? -->


---

## Pick Trading Rules

<!-- Can picks be traded? How far out?
     Any "Stepien rule" equivalent (can't trade picks in consecutive years, etc.)
     Conditions allowed on picks (swap rights, top-X protections) -->


---

## Rookie Contracts

### Length and salary

NBN follows the NBA rookie scale structure exactly. All cap numbers (scale amounts, cap levels, thresholds) are sourced from the NBA — NBN does not derive them independently. Actual dollar figures are provided externally and recorded here or in `cap-levels.json` when available.

**First round picks — mandatory rookie scale contract:**
- 4 years total
- Years 1 and 2: fully guaranteed at the scale amount for that pick slot
- Year 3: team option
- Year 4: team option (available only if Year 3 option was exercised)
- Scale amount per slot is tiered by pick number (pick 1 highest, pick 30 lowest) following the NBA's published rookie scale for that draft year
- **Scale indexing:** The rookie scale increases each year at the same rate as the salary cap — a 5% cap increase means a 5% increase to all scale amounts

> Per-pick scale amounts for each draft year to be recorded here when provided.

**Second round picks — no mandatory scale:**
- No rookie scale applies; contract terms are negotiated within standard FA rules
- See `free-agency.md` for applicable caps and exceptions
- The Second Round Pick Exception (July delay) still applies — see below

### Cap treatment

**Second Round Pick Exception — July delay:** From **July 1 through July 30** of a Salary Cap Year, if a team signs a player contract under the Second Round Pick Exception, that contract is **not included in Team Salary until July 31** of that Salary Cap Year. Contracts signed on or after July 31 count immediately.

### Extensions / options on rookie deals

<!-- When can a rookie be extended? Any team option year built into the deal? -->

---

## Second Apron Pick Restrictions

Applies beginning with the **2024–25 Salary Cap Year**.

### Step 1 — Trading freeze

When a team is a Second Apron Team for a given Salary Cap Year, their **first round pick 7 seasons out** is immediately frozen: the team may not trade it (conditionally or unconditionally) until the conditions in Step 2 are resolved.

**Which pick is frozen?** Count 7 seasons forward from the season contained within the triggering Salary Cap Year. The frozen pick is in the first draft that follows that 7th season.

> Example: Second Apron Team in the 2024–25 Salary Cap Year → the 7th following season is 2031–32 → the frozen pick is the **2032 first round pick**.

### Step 2 — Four-year lookback: penalty or release

After the triggering year, look at the **four (4) Salary Cap Years immediately following** it. Two outcomes:

**Outcome A — Draft Pick Penalty (≥ 2 of 4 years are Second Apron):** If the team is a Second Apron Team for **two or more** of those four years, the frozen pick is subject to a **Draft Pick Penalty** (see below).

**Outcome B — Freeze lifts, no penalty (< 2 of 4 years are Second Apron):** If the team is a Second Apron Team for **fewer than two** of those four years, the freeze lifts — the team may trade the pick — as of the day following the last day of the Regular Season encompassed by the **third** of those four years in which the team is *not* a Second Apron Team. The pick is **not** subject to a Draft Pick Penalty.

> Example (Outcome B): Trigger year = 2024–25. Four following years = 2025–26, 2026–27, 2027–28, 2028–29. Suppose the team is not a Second Apron Team in any of those four years. The 3rd non-Second-Apron year is 2027–28 — the freeze lifts the day after the last regular season game of 2027–28. No penalty.

---

## Draft Pick Penalties

When a team's first round draft pick is subject to a **Draft Pick Penalty**, that pick becomes the **final pick in the first round** of the applicable draft (i.e., it moves to the end of the round regardless of the team's normal selection order).

**Multiple penalized teams in the same draft:** If more than one team's pick is subject to a Draft Pick Penalty in the same draft, those teams select among themselves in **inverse order of winning percentage** from the Regular Season immediately preceding that draft — the team with the **worst** record selects last (i.e., in the very last spot), and teams are ordered upward from there.

> Example: If Team A and Team B both have the penalty in the 2032 Draft and Team A had a better winning percentage than Team B in 2031–32, Team A picks last overall and Team B picks immediately before them.

---

## Draft Pick Signing Rubric

<!-- Step-by-step for signing a drafted player:
     1. Confirm the pick belongs to the drafting team (check picks CSV)
     2. Is the player not already on a roster?
     3. Does the rookie contract fit within the allowed scale?
     4. Does the team have a roster spot and cap space?
     5. Add player to roster, record contract in bio, update picks CSV (mark pick as used). -->
