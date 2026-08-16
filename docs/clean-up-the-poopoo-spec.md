# Clean Up the Poo Poo — design spec (v0.3)

**Status:** v0.3, 2026-08-16. **Phase 1 is built and live** at `/cleanup`
(`nbn-api/routers/cleanup.py`, `cleanup-submissions.json`, pinned by
`nbn-api/tests/test_cleanup.py`). Bio-field gaps only — no Discord-backfill
triage yet, no Archivist achievement yet (§ 6, phases 2–5 unbuilt).

## 1. Scope

The site sits on a real, quantified backlog of missing/unresolved player and
transaction data (`BACKLOG.md` § 1, reviewed 2026-08-16). Members already earn
NB¥ through the achievement system (`members/achievements.js` +
`build/achievement-notify.js`). This spec proposes a third path: members
submit answers to auto-generated "gap" questions pulled from real missing
fields, an admin/bod reviewer approves or rejects each one, and an approval
both writes the real data (through the existing bio/API write paths — never a
new one) and pays NB¥.

**Question sources, checked against live data 2026-08-16:**

| Source | Field | Count | Notes |
|---|---|---|---|
| `player-bios.json` | `height` | 479 / 1023 missing | |
| `player-bios.json` | `wingspan` | 553 / 1023 missing | |
| `player-bios.json` | `weight` | 520 / 1023 missing | |
| `player-bios.json` | `draft_year`/`round`/`pick` (all three) | 508 / 1023 missing | Genuine gap — see caveat below |
| `player-bios.json` | `college` | 92 / 1023 missing | |
| `player-bios.json` | `country` | 35 / 1023 missing | |
| `player-bios.json` | `photo_url` | 61 / 1023 missing | |
| `player-bios.json` | `dob` | 41 / 1023 missing | |
| Discord backfill | flagged trades | 153 (of 485) | `nbn-api/docs/discord-transaction-backfill.md` |
| Discord backfill | flagged FA signings | 162 (of 2081) | same |
| Discord backfill | skipped FA signings | 538 (of 2081) | never triaged — may include out-of-scope rows |

**Resolved 2026-08-16, checked against live data:** "undrafted" already has a
real encoding — `draft_year` set, `draft_round`/`draft_pick` null (87 players
today, e.g. Jose Alvarado, `draft_year: 2021`, no round/pick — matches his real
undrafted-in-2021 status). Those 87 are **not** a gap and stay out of the
question bank entirely; the field already says everything it needs to.

`draft_year` **null across all three fields** (508 players — Steven Adams, Bam
Adebayo, Jarrett Allen among them, all real first-round picks in life) is a
different, genuine gap: the field was simply never entered, for anyone,
drafted or not. That's the population that goes into the question bank, and
the question has to cover both outcomes: "what year, and was this player
drafted — if so what round/pick, if not just the year is enough."

### In scope — single-source-of-truth facts

Bio measurements/biography (height, wingspan, weight, college, country, dob,
photo_url) and Discord-backfill triage (find the raw message, read off the
already-real numbers). Both have one correct answer that exists somewhere and
just needs finding — the game is locating it, not judging it.

### Out of scope — anything needing committee judgment, not a lookup

- The 9 cap-sheet diffs (`BACKLOG.md` § 1) — resolving them means deciding
  *which* source is right (sheet vs site), which is exactly the kind of call
  `nbn-api/CLAUDE.md`'s validators refuse to make themselves.
- The 88 not-cleanly-modeled picks (`needs_investigation` 32,
  `same_owner_diff_representation` 35, `committee_lag` 18) — reading `leaves`
  correctly requires the picks-conveyance doc, not a five-second answer.
- 2024 rookie scale multiplier inversion — explicitly blocked on a league
  ruling (`BACKLOG.md`), not a missing fact.
- 27-28+ minimum salary scale row-shift — corrected tables already computed,
  just awaiting a committee go-ahead to write them. Nothing to crowd-source.
- Anything that **overwrites an existing non-null value** rather than filling
  a blank. A gap-fill game should never be the mechanism that changes a
  disputed figure — that stays a `/poopoo`-and-committee conversation.

## 2. Decisions

| Question | Decided | Why |
|---|---|---|
| Who reviews submissions? | **`admin` only** | Deliberately narrower than the suggestions board's `bod`+`admin`. Bottlenecked on one role by design — revisit if the queue backs up in practice |
| Can the reviewer approve their own submission? | No — block it in the API, not just the UI | Same self-dealing risk any approval queue has; matters more now that the pool is a single role, since an admin is more likely than a `bod` member to also be a frequent submitter |
| One claim per gap, or multiple competing submissions? | **Multiple allowed** until one is approved; approving one auto-closes the rest as "resolved by another submission" (not "rejected" — no fault attached) | A single-claim model (like the FA agent-claim block) protects against a *cost*; here the failure mode is wasted duplicate effort, not something that needs a hard block |
| Reward per approved fill | Tiered flat: **25 NB¥** for a bio field, **50 NB¥** for dob/photo_url (need an image or precise date, more work), **100 NB¥** for a Discord-backfill triage (requires searching message history) | Deliberately below achievement-tier rewards (250–1000) — this is frequent/easy, achievements are rare/hard |
| New achievement tier for cumulative approved fills? | Yes — "Archivist," bronze/silver/gold at e.g. 5/25/100 approved, same statelessly-computed + snapshot-diffed pattern as every other achievement | Consistent with how every other achievement is computed; no new award mechanism needed |
| Rejected submissions — any penalty? | No penalty in v1, just a server-composed rejection reason shown to the submitter (same pattern as `void.reason` on FA offers) | Keep v1 simple; revisit only if bad-faith submissions turn out to be a real problem — **still open, not asked yet** |
| Name | **"Clean Up the Poo Poo"** | Ties it directly to `/poopoo`, the existing reconciliation report this feature is drawing its question bank from |

## 3. Existing building blocks to reuse

| Thing | Where | Why it matters here |
|---|---|---|
| Enumerable-store-with-monotonic-seq pattern | `suggestions.py` `_load_store` / `seq` | Submissions need permanent IDs the same way suggestions do — reuse the shape, new file (`data-quiz-submissions.json`) |
| Server-composed refusal/rejection reason, never client-built | `void.reason` (FA offers), disabled-menu reasons (roster moves) | Same rule applies to a rejected submission's reason string |
| Snapshot-diff, statelessly-recomputed achievement awarding | `build/achievement-notify.js` | "Archivist" tier slots straight into the existing engine — no new award mechanism, just a new achievement definition in `members/achievements.js` |
| NB¥ balance write | `POST /api/bets/admin/adjust` | Same call `achievement-notify.js` already makes; only fires on approval, never on submission (mirrors "awards on tier upgrade only," not on attempt) |
| Bio field writes | `PUT /api/players/{slug}` (rosters role) | Approval applies the field through the real write path — no parallel "quiz data" store that then needs its own sync job |
| Pending-item visible to the person it concerns, resolved via a status change appended to a thread | `suggestions.py`'s comment/status thread shape | A submission's lifecycle (pending → approved/resolved/rejected) is the same shape as a suggestion's status history |

## 4. Data model (proposed)

`data-quiz-submissions.json`, `{"seq": int, "items": [...]}`, one item per
submission:

```jsonc
{
  "id": 143,
  "gap_type": "bio_field",          // or "discord_backfill"
  "subject": "curry-stephen",       // slug, or a backfill txn/message ref
  "field": "wingspan",              // omitted for discord_backfill
  "submitted_value": "6'10\"",
  "source_note": "2K player card screenshot, attached",
  "submitted_by": "username",
  "submitted_at": "2026-08-16T18:04:00Z",
  "status": "pending",              // pending | approved | rejected | superseded
  "reviewed_by": null,
  "reviewed_at": null,
  "reject_reason": null,
  "reward_nby": null                // filled in on approval
}
```

The **question bank itself is never stored** — mirroring "pending is
enumerable" (§ 3.15) and "the FA pool is not the offerable set" — it's
computed on read by scanning `player-bios.json` for empty fields (minus
whatever fields already have a `pending` submission against them, which still
show but flagged "someone's already working on this") and the Discord-backfill
flagged/skipped lists. No second store that can drift from the bios or the
backfill files it's describing.

## 5. Open implementation questions (not yet answered, need more thought before Phase 1)

- Discord-backfill triage needs a UI to search old messages — does that reuse
  anything from the existing backfill tooling, or is it new surface entirely?
  **Still open — not built in Phase 1.**
- ~~Does a bio-field submission need a mandatory `source_note`?~~ **Resolved
  in the build:** optional. It's shown to the reviewer when present
  (`review-note` in the Review tab) but nothing blocks a submission without
  one — the reviewer judges the value on its face if there's nothing else to
  go on.
- ~~Photo submissions imply file upload~~ **Resolved in the build:**
  `photo_url` is stored as a plain URL string everywhere else in the codebase
  (`CLAUDE.md` "Player" § fields), never an uploaded file — so a submission is
  just a URL, validated as `http(s)://…`. No image hosting needed; photo
  gaps shipped in Phase 1 alongside the rest, not deferred to Phase 4.

**Also resolved in the build, not previously covered by § 2:**

- The `draft_year`/`draft_round`/`draft_pick` trio is one compound gap
  (`field: "draft_info"`), not three separate submissions — matches how § 1
  already reasons about it (a year with no round/pick means undrafted, so
  round and pick have to be answered together or not at all).
- **A race is possible** between "someone submits an answer" and "an admin
  approves it" — the field could get filled through another path in between
  (a curator edit, or a second approved submission for the same gap). The
  approve endpoint re-checks the field is still empty immediately before
  writing; if not, it auto-rejects with a reason instead of silently
  overwriting or double-paying. Pinned by `test_cleanup.py`.
- Competing submissions for the same gap: approving one marks the others
  `superseded` (not `rejected` — no fault attached, per § 2's existing
  decision), and both statuses are distinguished in the "My Submissions" tab.

## 6. Suggested phasing

1. ~~Bio-field gaps only (no photo/discord), tiered reward, admin-only review,
   self-approval blocked~~ — **done, live 2026-08-16.**
2. Add the Archivist achievement tier once real submission volume exists to
   compute tiers against. **Not yet started.**
3. Add Discord-backfill triage as a second `gap_type`. **Not yet started.**
4. ~~Revisit photo submissions once/if file upload exists~~ — moot, photo
   already shipped as a URL field in Phase 1.
5. Revisit reviewer pool (admin-only → `bod`+`admin`) if the queue backs up
   in practice. **Not yet needed** — queue is empty as of ship.
