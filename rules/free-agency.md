# Free Agency & Signing Rules

See `README.md` for league-wide constants (cap ceiling, roster limits, contract maxes).

---

## Eligibility

<!-- Who can be signed: UFA, RFA, undrafted players, players released mid-season, etc.
     Any eligibility windows (e.g. can only sign UFAs after FA opens) -->

### Unrestricted Free Agents (UFA)


### Restricted Free Agents (RFA)

<!-- Matching rights: how long does the original team have to match?
     What happens if they don't match? -->


---

## Cap Space Requirements

<!-- Team must have cap space to sign — how is available space calculated?
     Cap holds that must be cleared first, etc. -->


---

## Contract Rules

### Years

<!-- Min/max contract length for different player types -->

### Salary

#### Annual raise/decrease limit (standard contracts)

For all player contracts except those between a **Qualifying Veteran Free Agent or Early Qualifying Veteran Free Agent and their Prior Team**, the following applies to every Salary Cap Year after the first:

- The player's **Salary** (excluding Incentive Compensation) may increase or decrease from the prior year by no more than **5% of the Year 1 Salary** (excluding Incentive Compensation).
- The player's **Regular Salary** may increase or decrease from the prior year by no more than **5% of the Year 1 Regular Salary**.

The 5% is always calculated off the **first year of the contract** — not the prior year — so raises and cuts are fixed in dollar terms across the life of the deal.

#### Annual raise/decrease limit — QVFA/EQVFA re-signing with Prior Team

When a **Qualifying Veteran Free Agent (QVFA)** or **Early Qualifying Veteran Free Agent (EQVFA)** re-signs with their **Prior Team**, the limit is **8%** of the Year 1 Salary (excluding Incentives) per year, rather than 5%. The same structure applies: raises/decreases are fixed dollar amounts calculated off Year 1, not the prior year.

**Exception:** If the QVFA/EQVFA contract is a sign-and-trade (Section 8(e)(1)) or certain other specific contract types, the standard **5% rule** applies instead of 8%.

### Cap hold types

<!-- What cap hold (UFA/RFA/PLAYER_OPT/TEAM_OPT/NON_GTD) to set for each
     contract year after the last guaranteed year -->

---

## Exceptions to the Salary Cap

A team whose Team Salary is at or above the Salary Cap may still sign players using the exceptions below. Each exception defines who qualifies and the maximum Year 1 salary permitted.

### Mid-Level and Room Exceptions

#### Which exception a team gets

A team's applicable exception is determined by where their Team Salary falls relative to the Salary Cap and the First Apron as of **July 1** of the Salary Cap Year:

| Zone | Condition | Exception |
|------|-----------|-----------|
| **Room** | Team Salary is more than the full NTMLE amount **below the Salary Cap** | Room Exception |
| **NTMLE** | Team Salary is less than the full NTMLE below the Salary Cap **and** at least the full NTMLE below the First Apron | Non-Taxpayer MLE (NTMLE) |
| **TMLE** | Team Salary is less than the full NTMLE below the First Apron | Taxpayer MLE (TMLE) |

> The Room Exception assignment is **locked on July 1**. A team assigned the Room Exception cannot move out of it during that Salary Cap Year, even if they later exceed the cap.

#### Contract length limits

| Exception | Max years |
|-----------|-----------|
| NTMLE | 4 years |
| TMLE | 2 years |
| Room Exception | 3 years |

#### Splitting

The MLE (NTMLE or TMLE) **may be split** across multiple players, as long as the total value does not exceed the exception amount.

#### No stacking with cap room

The MLE may **not** be combined with cap space to offer a larger contract. A team cannot, for example, offer $9M by pairing a $5M MLE with $4M of cap room — the exception and cap room are separate mechanisms.

#### Hard-cap triggers

- Using the **NTMLE** hard-caps the team at the **First Apron** for the remainder of the season (see `README.md` Row B).
- Completing a **sign-and-trade** hard-caps the team at the **First Apron** for the remainder of the season (see `README.md` Row C).

---

### Disabled Player Exception (DPE)

Allows a team **over the cap** to replace a player who carries an **"Out for Season" injury designation** (as shown in 2K). Three use cases:

**1. FA signing** — Sign one free agent to a **1-season contract only**, for no more than the lesser of:
- 50% of the disabled player's salary, or
- The full NTMLE amount.

**2. Trade acquisition** — Acquire a player via trade who is in the **last season of his contract** (including any option years), making no more than the lesser of:
- 50% of the disabled player's salary + $250,000, or
- The NTMLE amount + $250,000.

**3. Waiver claim** — Claim a player off waivers who is in the **last season of his contract**, making no more than the lesser of:
- 50% of the disabled player's salary, or
- The full NTMLE amount.

**Anti-abuse rule:** A team may not trade *for* an injured player and then apply for the DPE on the basis of that player's injury. The disabled player must have been on the team's roster prior to the injury designation.

---

### Bi-Annual Exception (BAE)

**Who can use it:** Teams whose Team Salary is **below the First Apron**.

**Contract limit:** Up to **2 seasons**.

**Restrictions:**
- Cannot be used in **consecutive Salary Cap Years** — if a team used the BAE last year, it is unavailable this year.
- Cannot be used if the team has already used **cap space** or the **Room Exception** during that Salary Cap Year.

**Expiration and refresh:** The BAE expires at the **end of the Regular Season** if unused. It refreshes on **July 1** at the start of each new Salary Cap Year (subject to the consecutive-year restriction above).

> The BAE is also restricted at the First Apron — see `README.md` Row A.

---

### Veteran Free Agent Exception

Available starting at 12:01 p.m. ET on the last day of the Moratorium Period following the last season covered by the player's prior contract. The prior team (or, for players selected in an Expansion Draft, the selecting team) may re-sign the player under one of three tracks:

#### (1) Qualifying Veteran Free Agent (QVFA)

May sign a new contract with their Prior Team for up to the **maximum salary** (see Article II, Section 7). Annual raises/cuts governed by the **8% rule** (see above).

#### (2) Non-Qualifying Veteran Free Agent (Non-QVFA)

May sign a new contract with their Prior Team for up to the **greater of**:
- 120% of the Regular Salary from the final year of the player's prior contract; or
- 120% of the applicable Minimum Annual Salary for that player; or
- *(for Restricted Free Agents only)* the salary required by the Qualifying Offer.

Annual raises/cuts governed by the **5% rule** (see above).

#### (3) Early Qualifying Veteran Free Agent (EQVFA)

Contract must cover **at least 2 seasons** (option years excluded). May sign for up to the **greater of**:
- 175% of the Regular Salary from the final year of the player's prior contract; or
- 105% of the Average Player Salary for the prior Salary Cap Year.

Annual raises/cuts governed by the **8% rule** (see above).

**RFA matching:** If an EQVFA with 2 Years of Service receives an Offer Sheet, their Prior Team may use the Early Qualifying Veteran Free Agent Exception to match it.

---

## Signing Rubric

<!-- Step-by-step checklist:
     1. Is the player a free agent (not on any roster)?
     2. Does the signing team have enough cap space?
     3. Does the contract fit within year/value limits?
     4. Will the resulting roster be within size limits?
     5. Are all cap hold fields set correctly? -->
