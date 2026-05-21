# Trade Rules

See `README.md` for league-wide constants.

---

## What Can Be Traded

<!-- Players, draft picks, cash — which are allowed, any restrictions per trade -->

### Players


### Draft picks

<!-- Any limits on how many picks or how far out picks can be traded,
     pick swap rules, conditions allowed on picks -->

### Cash / other assets

**Cash is not a tradeable asset in NBN.** Trades may only involve players and draft picks.


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

### Re-acquisition restriction

A team may not re-acquire a player they previously traded away until the following free agency period. This applies regardless of how the original trade was structured (direct trade, multi-team trade, or sign-and-trade).

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
