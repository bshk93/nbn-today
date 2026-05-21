# Trade Rules

See `README.md` for league-wide constants.

---

## What Can Be Traded

<!-- Players, draft picks, cash — which are allowed, any restrictions per trade -->

### Players


### Draft picks

#### Stepien Rule

A team may not trade away first-round picks in **consecutive seasons**. Every team must retain the ability to make a first-round selection at least once every two years. A proposed trade is illegal if, after the trade, the team would have no first-round pick in two or more consecutive draft years.

Trading the **right to make a selection** after already holding the pick (i.e. trading the pick slot post-draft, after the team has made their selection) does not count as trading away a first-round pick for purposes of this rule.

> See also `draft.md` for additional Second Apron restrictions on trading first-round picks.

#### 7-year advance limit

Draft picks may only be traded up to **7 years in advance** of the current season. A pick further out than 7 years from the current season may not be included in any trade.

### Cash / other assets

**Cash is not a tradeable asset in NBN.** Trades may only involve players and draft picks.

**Traded Player Exceptions (TPEs) do not exist in NBN.** When a player is traded, no exception is generated for the sending team. Salary matching must be satisfied with real outgoing salary at the time of the trade.


---

## Salary Matching

### Below the First Apron: tiered matching

For teams **below the First Apron**, the maximum incoming salary in a trade is determined by the total outgoing salary using three tiers:

| Outgoing salary | Max incoming salary |
|---|---|
| $0 – $8,527,000 | 200% of outgoing + $250,000 |
| $8,527,001 – $29,000,000 | Outgoing + $8,527,000 |
| Above $29,000,000 | 125% of outgoing + $250,000 |

If a trade triggers an apron hard-cap (e.g. by aggregating salaries or exceeding the +$250,000 First Apron cap), the relevant apron restriction overrides these tiers for that trade. See below.

### Minimum contract exception

A player on a **minimum contract of 2 seasons or fewer** does not count as incoming salary for the purposes of salary matching. Their salary is excluded from the incoming total when calculating whether a trade satisfies the matching tiers above.

A minimum contract player **does** count as incoming salary if their contract is **longer than 2 seasons**.

### Base Year Compensation (BYC)

BYC modifies the outgoing salary figure used by the **sending team** when matching in a sign-and-trade. It applies when a player meets **all four** of the following criteria:

1. He is a **Bird or Early Bird free agent** of the signing team.
2. His new salary is **above the minimum**.
3. He receives a **raise greater than 20%** over his previous salary.
4. The signing team is **at or above the salary cap** immediately after the signing.

When BYC applies:

| Side | Salary used for matching |
|---|---|
| Sending team (outgoing) | The **greater of** his previous salary or **50% of his new salary** |
| Receiving team (incoming) | His **full new salary** (no adjustment) |

This asymmetry means the sending team gets less "credit" for trading him than the receiving team pays in incoming — BYC trades are therefore harder to match from the sending side.

### Second Apron: no salary aggregation

A team **at or above the Second Apron** may not combine multiple outgoing players' salaries to satisfy matching for a higher-salaried incoming player. Trading multiple players is permitted only if each player's salary could independently satisfy the match — aggregation itself is what's prohibited.

A team **below the Second Apron** that aggregates salaries in a trade is **hard-capped at the Second Apron for the remainder of the season**.

### First Apron salary-matching cap

A team **at or above the First Apron** may only acquire a player whose incoming salary is at most the **outgoing salary plus $250,000**. Standard matching spreads do not apply.

A team **below the First Apron** that executes a trade where incoming salary exceeds outgoing + $250,000 is **hard-capped at the First Apron for the remainder of the season**.

> Full First Apron standing restrictions are in `README.md`.


---

## Legality Rubric

<!-- Step-by-step checklist for validating a trade:
     1. Are all assets owned by the teams sending them?
     2. Do resulting rosters stay within size limits?
     3. Does cap math work for all teams involved?
     4. Any player-specific restrictions (recently signed, recently traded)?
     etc. -->


---

## Restrictions

### Trade deadline and window

<!-- TODO: document the trade open date and trade deadline for each season. These dates are set externally each season. -->

### Roster size limits

A trade may not leave any participating team with fewer than the **minimum roster size** after the trade is processed.

<!-- TODO: define minimum roster size. Maximum is 15 standard players (see README.md). -->

There is no restriction on trading away the last player at any given position.

### Contract options

When a player is traded, all option provisions in their contract (team options, player options, non-guaranteed years) travel with the player to the new team unchanged.

### Re-acquisition restriction

A team may not re-acquire a player they previously traded away until the following free agency period. This applies regardless of how the original trade was structured (direct trade, multi-team trade, or sign-and-trade).

### Sign-and-trade: First Apron restriction

A team **receiving** a player via sign-and-trade may not be above the First Apron at the conclusion of the trade.

A team that is **already above the First Apron** may receive a player in a sign-and-trade only if the trade itself reduces that team's payroll to below the First Apron — i.e., the outgoing salary shed in the deal brings them under.

> See also Row C in `README.md` (Transaction Restrictions Table) — executing a sign-and-trade hard-caps the acquiring team at the First Apron for the remainder of the season.

### Newly signed free agent restriction

A player signed as a free agent may not be traded until **both** of the following conditions are met:

1. At least **90 days** have elapsed since the player signed.
2. **December 15** of the current league season has passed.

The trade window opens on whichever date is **later**. A player signed before September 16 would be tradeable on December 15; a player signed after September 16 would be tradeable 90 days after signing.


---

## Multi-Team Trades

### The Touch Rule

In a trade involving **3 or more teams**, each team must "touch" at least **two other teams** in the trade. A team touches another team when at least one qualifying asset flows between them (in either direction).

**Qualifying assets for a touch:**

1. **An active player contract** — any player currently on a standard or two-way roster contract.
2. **A future pick that will actually convey** — the pick must have a realistic path to conveying as a first-round pick. A heavily protected pick (e.g. top-55 protected) does not qualify because it is unlikely to convey as a first. A pick with a top-10 protection that converts to a second-round pick if it doesn't convey **does** qualify, because something of value will convey regardless.
3. **Draft rights to an actual NBA prospect** — rights to a player with a reasonable chance of reaching the NBA during his career, or who is currently a contributing player in a reputable professional league. Rights to marginal or untrackable players do not qualify.

A draft pick that stays with its original team (i.e. is traded away and immediately returned in the same deal) does not count as a touch.

> **Example:** In a 3-team trade, Team A must touch Teams B and C, Team B must touch Teams A and C, and Team C must touch Teams A and B — six touches total (three pairs, each bidirectional).
