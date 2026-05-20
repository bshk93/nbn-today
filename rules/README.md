# NBN League Rules — Overview

This directory contains rubrics for every transaction type. Read the relevant file
before making or validating any transaction. All rubrics assume the constants below.

## Files

| File | Covers |
|---|---|
| `trades.md` | Trade legality, asset rules, salary matching |
| `free-agency.md` | FA signings, cap space, contract limits |
| `extensions.md` | Eligibility, windows, max years/amounts |
| `options.md` | Player and team options — exercise, decline, deadlines |
| `releases.md` | Waiver/release rules, dead cap calculation |
| `two-way.md` | Two-way contracts, eligibility, conversion |
| `draft.md` | Draft format, pick trading, rookie deals |

---

## League-Wide Constants

<!-- Fill in: salary cap ceiling, luxury tax threshold, roster size (min/max),
     active vs. inactive roster splits, two-way slots, season timeline,
     key calendar dates (trade deadline, option deadlines, FA opening, draft date) -->

### Salary cap

Each season has three cap thresholds, all set externally (stored in `cap-levels.json`, served via `GET /api/cap-levels`):

| Threshold | Key | Description |
|---|---|---|
| Salary Cap | `cap` | The baseline cap ceiling. Teams over this cannot use cap space to sign players. |
| First Apron | `apron1` | First hard-cap threshold. Additional restrictions apply above this level. |
| Second Apron | `apron2` | Second, stricter hard-cap threshold. Further restrictions apply above this level. |

These values are inputs — they are not derived from any formula within this system. Update them each season via `PUT /api/cap-levels/{season}`.

### Roster limits

| Limit | Value |
|-------|-------|
| Maximum roster size | 15 players |
| Two-way slots | separate from the 15-man limit (two-way players do not count toward the 15) |

A team may not have more than 15 players on its standard roster at any time. If a trade would push a roster over 15, the receiving team must release a player first before the trade can be processed.

### Season timeline


### Contract limits

<!-- Max years, max annual value, any league-specific exceptions (MLE equivalent, etc.) -->

---

## Cap Accounting

A team's Team Salary may not exceed the Salary Cap at any time **unless the team is using an Exception** (e.g. MLE, bi-annual, trade exception, or other CBA-defined exception). Transactions that would push a team over the cap without a valid exception are illegal.

### Apron definitions

**Second Apron Team:** A team is a "Second Apron Team" for a given salary cap year if, **as of the start of that team's last Regular Season game** within that salary cap year, their salary exceeds the Second Apron Level for that year. This is a point-in-time determination — it is not re-evaluated continuously, only at that specific moment.

### Apron restrictions

A team may not engage in a transaction if, **immediately following that transaction**, the team's salary for that season would exceed the **Applicable Apron Level** associated with that transaction type.

Each apron level restricts a different set of transactions per the Transaction Restrictions Table below. When validating any transaction involving an apron-level team, check:
1. What is the team's projected salary after the transaction?
2. Which apron level(s) does that salary exceed?
3. Is this transaction type restricted at that apron level?

#### Transaction Restrictions Table

| Row | Transaction | Applicable Apron |
|-----|-------------|-----------------|
| A | Team signs or acquires a player using the **Bi-Annual Exception** | First Apron |
| B | Team signs or acquires a player using the **Non-Taxpayer Mid-Level Salary Exception (NTMLE)** | First Apron |
| C | Team acquires a player via a contract entered into under Section 8(e)(1) *(sign-and-trade)* | First Apron |
| D | Team signs a player **during the Regular Season** whose prior contract was terminated that same Regular Season, where the prior contract's salary exceeded the NTMLE amount | First Apron |
| E | Team acquires a player using an **Expanded Traded Player Exception** | First Apron |
| F | Team acquires a player using a **Standard Traded Player Exception** — but only (i) after the end of the Regular Season in which the exception arose, or (ii) if the exception arose in the offseason, after the end of the following Regular Season | First Apron |
| G | Team acquires a player using a **Transition Traded Player Exception** | First Apron |
| H | Team acquires a player using an **Aggregated Standard Traded Player Exception** | Second Apron |
| J | Team acquires a player using any **Traded Player Exception arising from a sign-and-trade** (Section 8(e)(1)) | Second Apron |
| K | Team signs a player using the **Taxpayer Mid-Level Salary Exception (TMLE)** | Second Apron |

> **Rows E–J** are subject to the additional post-season forward-look rule (see below).
> **Rows A–F** cannot be used after the team has already used the TMLE that season (see TMLE trigger below).
> **Rows H–J** push teams over the Second Apron — note that the Second Apron is a stricter threshold than the First Apron.

> **NBN league rule:** Cash is not a tradeable asset in this league. CBA row I (cash payments in trades) does not apply and has been omitted.

Once a team engages in a transaction that is subject to an apron restriction, they are **hard-capped at that apron level for the remainder of that salary cap year** — their salary may not exceed the applicable apron level at any point for the rest of the season, regardless of other exceptions. This is distinct from the soft cap: there is no exception or mechanism to exceed the apron once triggered.

#### Taxpayer Mid-Level Exception trigger

A team that uses the **Taxpayer Mid-Level Salary Exception (TMLE)** to sign a player during a salary cap year may not, for the remainder of that year, engage in any transaction listed in **rows A–F** of the Transaction Restrictions Table. Using the TMLE effectively hard-caps the team at the apron level associated with rows A–F for the rest of the season.

> The TMLE itself is defined in `free-agency.md`.

#### Post-season forward look (rows E–J only)

During the window **after the last day of the Regular Season through the end of the Salary Cap Year** (roughly the playoff/offseason transition period), transactions in rows E–J of the Transaction Restrictions Table carry an additional forward-looking restriction:

- A team may not engage in such a transaction if doing so would push their salary for the **following** salary cap year over the applicable apron level for that following year.
- If a team does engage in such a transaction during this window, they are **hard-capped at the apron for the following salary cap year** as well.

In plain terms: rows E–J transactions done in the post-season window lock you into the apron not just for the rest of the current year, but for all of next year too. Rows E–G trigger the First Apron for next year; rows H–J trigger the Second Apron for next year.

##### How to project next year's salary for this check

When evaluating whether a post-season transaction would violate the forward-look rule, the team's salary for the following year is calculated using these assumptions:

| # | Assumption |
|---|---|
| A | All team and player options for the following year are **assumed exercised** (maximizes projected salary) |
| B | No Early Termination Options (ETOs) for the following year are assumed exercised (players stay on) |
| C | The team makes **no additional transactions** for the remainder of the current salary cap year |
| D | Any player eligible for a "Higher Max" bump in year 4 of their Rookie Scale Contract is assumed to earn the **highest salary they could qualify for**, based on any league honors already announced for the just-completed season |

For the cap thresholds themselves: if next year's Salary Cap, First Apron, and Second Apron levels have not yet been set, assume they are **equal to the current year's levels**.

---

### First Apron: standing restrictions

A team whose salary **is at or above the First Apron** (whether by hard-cap trigger or by their current Team Salary) is subject to the following restrictions at all times, regardless of transaction type:

1. **No NTMLE.** The team may not use the Non-Taxpayer Mid-Level Salary Exception (see also Row B above).

2. **No mid-season buyout signings above NTMLE.** The team may not sign a player who was waived during the current Regular Season if that player's terminated contract carried a salary exceeding the full NTMLE amount.

3. **Trade salary-matching cap: +$250,000.** When acquiring a player in a trade, the team may only receive a player whose incoming salary is at most the **outgoing salary plus $250,000**. (Standard salary-matching rules — which allow a larger spread — do not apply above the First Apron.)

   > **Contagion rule:** A team that is currently *below* the First Apron but executes a trade in which the incoming salary exceeds outgoing salary + $250,000 is **hard-capped at the First Apron for the remainder of the season** as a result of that trade.

---

### Second Apron: standing restrictions

A team whose salary **is at or above the Second Apron** is subject to the following restrictions, in addition to all First Apron restrictions:

1. **No TMLE.** The team may not use the Taxpayer Mid-Level Salary Exception (see also Row K above).

2. **No salary aggregation in trades.** The team may not combine multiple outgoing players' salaries to create a larger outgoing number that enables them to acquire a higher-salaried player. A Second Apron team may trade more than one player at a time only if the trade would be legal even when matching each outgoing player individually — aggregation is not permitted.

   > **Contagion rule:** A team *below* the Second Apron that aggregates salaries in a trade is **hard-capped at the Second Apron for the remainder of the season** as a result (see also Row H in the Transaction Restrictions Table).

3. **Draft pick freeze.** See `draft.md` — Second Apron Teams are subject to restrictions on trading their first round pick 7 seasons out.
