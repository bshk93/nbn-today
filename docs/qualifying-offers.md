# Qualifying offers (§ 3.1)

Adopted 2026-10-02. The rule text is `rulebook/index.html` § 3.1; this is how
the system carries it.

## Why it exists

Before this, a contract's trailing `RFA` cap-hold tag *was* RFA status. It was
set at signing, years ahead, and nothing could change it short of a renounce.
An owner (everinski, MIL) wanted to offer his RFA less than the QO without
renouncing: while the player was an RFA, the PDC ballot's "QO" line meant any
lower offer was pointless, and renouncing would have cost him Bird Rights.
In the NBA that is "pulling the QO". It needed the QO to exist.

## The model

The `RFA` tag now means **RFA-eligible**. The team's decision is stored on the
bio, keyed by the hold season:

```json
"qualifying_offers": {
  "26-27": {"status": "extended", "amount": 5910028, "two_way": false,
            "date": "2026-10-02", "txn_id": "…", "base_hold": 4800000}
}
```

`status` is `extended`, `withdrawn`, `accepted`, `lapsed` or `superseded`.
`superseded` means an extension (§ 6.2) now pays that season: `_apply_extension`
sets it so the QO can't be withdrawn afterwards. A withdrawal also requires the
RFA tag to still be there — before 2026-10-03 a withdrawal after an extension
wrote the old hold over the extension's Year 1. `base_hold` is
present only when the QO raised the hold (an RFA's hold is the greater of the
§ 3.10 hold and the QO), so a withdrawal can put it back.

**A player is an RFA only if he is tagged RFA and his QO is `extended`**, or
the hold season hasn't started yet (`pending`). `_qo_status` derives this;
`_rfa_eligibility`, the one RFA test everything uses (offer sheets, the FA
pool, the ballot), reads it. An undecided QO whose deadline has passed reads as
`lapsed` straight away. The daily sweep only writes that down.

## The amount (`_qo_amount`)

- **Rookie-scale first-rounder** (`_finishes_rookie_scale`: round 1, slot 1–30,
  hold season = draft year + 4): the 4th-year salary plus the slot's NBA raise,
  `_ROOKIE_QO_RAISE` (30% → 50%), +10 points from the 2023 class.
- **Two-way:** a one-year two-way contract, amount `0`, no cap effect.
- **Everyone else:** max(minimum for his experience, 125% of prior salary).

"Prior salary" is the season *before* the hold. The hold season's own
`salaries` entry is the hold, and reading it as salary is the bug that priced
Jaden Hardy's QO off his $12.3M hold (fixed the same day in `_fa_pool`).

## Transactions

| Type | Who | What it does |
|---|---|---|
| `qualifying_offer`, `action: extend` | owner (⋯ menu, `POST /api/self/qualifying-offer`) or office | Records the QO. Allowed only in the final contract year, before July 1. Raises the hold if the QO is larger |
| `qualifying_offer`, `action: withdraw` | owner or office | Status → withdrawn, tag → UFA, hold restored. Allowed until the player's PDC round opens (`_qo_round_opened`, from `fa-state.json`). Refused once the season is signed (no RFA tag left) |
| `accept_qo` | PDC (`declare-winner`, the ballot's QO line) or office | Signs a one-year deal at the QO through `_apply_sign` (`signing_method: "qualifying_offer"`), rolling into a UFA hold |
| lapse | `sweep_lapsed_qualifying_offers`, from `snapshot_cap_history.py` daily | Undecided current-season RFA tags → UFA, status `lapsed` |

`POST /api/validate/qualifying_offer` is the public dry run the roster page's
confirm dialog reads. Check ids are `qo_*`, mapped to § 3.1 in
`rulebook_coverage.py`.

## Grandfathering

The 16 players who were current-season (26-27) RFAs on adoption day were
recorded as `extended` by `nbn-api/migrate_grandfather_qos.py`, with
`note: "grandfathered…"` and no `txn_id`. Without that they would all have
lapsed to UFA the moment the code shipped. Their teams can withdraw like
anyone else's.

## Not built

The § 3.9 Bird-tier signing ceilings, the NBA starter criteria, and checking an
`RFA` tag at signing time. See `BACKLOG.md`.
