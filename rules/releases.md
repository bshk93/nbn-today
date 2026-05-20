# Release / Waiver Rules

See `README.md` for league-wide constants.

---

## When a Player Can Be Released

<!-- Any restrictions: can't release during playoffs, recently acquired via trade, etc. -->


---

## Dead Cap Calculation

The API computes dead cap automatically based on the salary and guarantee fields.
This section documents the league rules those calculations implement.

### Fully guaranteed salary

<!-- Released before the season: full remaining salary becomes dead cap?
     Or is there a cutdown date after which it's guaranteed? -->

### Non-guaranteed salary (NON_GTD)

<!-- If released before the guarantee date: $0 dead cap (or partial)?
     If released on or after the guarantee date: full salary is dead cap? -->

### Partially guaranteed salary

<!-- `guaranteed` field stores the guaranteed portion.
     On release: only the guaranteed amount counts as dead cap. -->

### Team option years

<!-- TEAM_OPT years: if team releases rather than exercising, is there dead cap? -->

### UFA / RFA cap holds

<!-- These are not salary — releasing a player with only UFA/RFA holds
     has no dead cap implication. -->

---

## Roster Impact

<!-- Releasing a player frees their roster spot immediately.
     Dead cap still counts against the cap for the remainder of those seasons. -->

---

## Release Rubric

<!-- Step-by-step checklist:
     1. Is the player on an active roster?
     2. What salary years are current-season or later? (past years have already been paid)
     3. For each current/future year: what is the hold type? Apply dead cap rules above.
     4. Set bio type to "dead", move guaranteed amounts to dead_cap, clear salaries/holds.
     5. Remove from roster CSV. -->
