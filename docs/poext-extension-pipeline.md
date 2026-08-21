# Extensions (§ 6.2 / § 6.3) — building the pipeline on the free-agency infra

**Status: Phase A + E LIVE, deployed 2026-08-21** (§ 7's read-only validator
and apply path — `_validate_extension`, `_extension_fact_sheet`,
`_apply_extension`, `POST /api/validate/extension`, `extension` in
`_VALIDATORS`/the type whitelist/`_detail_models`). The rest of this document
— Phases B through G, i.e. the `/api/poext/*` committee pipeline
(claim/negotiate/ballot/finalize), the `/extensions` team-facing page, and the
§ 4.5 trade-freeze check — is still design only. Written 2026-08-18. Companion
to `nbn-api/docs/extensions.md`, which specs the *rules and validator* (now
built); this specs the *pipeline* — the negotiation object, the committee
flow, and the surfaces — and says which parts of the free-agency machinery
carry over unchanged, which need re-framing, and which are traps. It also
corrects two things `extensions.md` gets wrong (§ 2.3, § 8).

Until Phase C ships, a real extension goes through the same manual hand-off
free agency already uses for a finalized offer: the committee decides
(Discord, as today), and the office enters it via `/transactions`, checking
legality live against `POST /api/validate/extension`. Both the office form
and `/transaction-sim` got a real Extension UI 2026-08-21 (see BACKLOG.md's
now-closed item) — team derived from the roster, the first salary row seeded
at the correct starting season off the fact sheet. That's a real,
point-and-click path today, not just an API call.

The split mirrors free agency: `nbn-api/docs/extensions.md` : `nbn-today/docs/pdc-free-agency-spec.md`
:: rules : pipeline.

---

## 0. Decisions taken (2026-08-18)

Settled with hkd before any code. Where a decision overrides what the body of this
document originally argued, the section is marked and rewritten rather than left
to disagree with itself.

| # | Decision | Consequence |
|---|---|---|
| D1 | **REVERSED 2026-08-19: the backfill is no longer a prerequisite.** Filed on `BACKLOG.md` as [P3] instead. In its place, a proposal packages the player's known (possibly partial) transaction history, and the submitting team must attest when the contract began. | Phase A is no longer gated on anything (§ 2.3a, § 7). Sizing (97 Discord-recoverable / 59 draft-year-derivable / 5 needing a human) stays useful context for whoever eventually does the backfill, just doesn't block. |
| D2 | **The read-only validator is the first code deliverable**, once D1 is done. | `POST /api/validate/extension` + a `/transaction-sim` tab. Nothing writes. |
| D3 | **Extensions use the `agent` stage.** | The full claim/advance/return-to-agent clone is in scope, and `ROLE_IMPLIES` needs `poext_head → agent` or the stage deadlocks (§ 2.9). Overrides this doc's original recommendation against it. |
| D4 | **A remand is free; a rejection consumes one of § 6.3's three proposals.** | **Corrected 2026-08-19: no standalone `reject` action.** "Reject" is the outcome `finalize` records off a majority-reject committee ballot (D6) — that's the only place the counter moves. Remand/void/restore reuse FA verbatim; nothing new to add (§ 2.5). |
| D5 | **The cap check reports "cannot evaluate" when the target season's thresholds are unset**, rather than passing, failing, or blocking the feature. | Today that is *every* extension (§ 2.2). Committee sets 27-28 onward when it can; nothing is blocked meanwhile. |
| D6 | **Accept/reject majority vote, not the 1,000-ball ballot** — **flagged to revisit.** | Simpler and matches what the decision is. Revisit once the committee has run real extensions; the ball ballot stays available and the assignment/abstention/finalize record is identical either way. |
| D7 | **A live extension proposal holds no cap room.** | No `_pending_offer_hold` analogue. The FA hold stops a team bidding on five players with one team's worth of room; with one possible proposer and money in a future year, that failure mode doesn't exist. |
| D8 | **Eligibility derives from the ledger, warn-and-allow on an indefinite basis** (§ 2.3), and D1 is what makes that warning rare rather than routine. | |
| D9 | **Nothing about a proposal is announced to Discord — only the accepted extension, if one happens.** | No `poext_notify` proposal feed, public or private; the FA confidentiality guard isn't cloned because there is nothing left to leak (§ 2.7, § 2.8). The accept is the announcement, so it also stamps the § 4.5 six-month trade freeze. Assignment notices go through the member inbox, not a channel. |
| D10 | **Q1 (§ 6.2 vs § 6.3 eligibility): strict reading confirmed.** § 6.2 rule 2 is the universal eligibility gate; § 6.3's three buckets are scheduling only, not an independent grant. | Real eligible population stays ~32 players, not most of the roster (§ 2.3). |
| D11 | **Q2, fully: an option year (player or team) never counts as "guaranteed," and is treated as declined outright by the act of extending.** When rule 2 lands the extension's first season on the same season as a trailing option year, the extension **supersedes** it — its salary figure is what's actually paid, the option is mooted, not collided with. | Confirms `extensions.md` § 4 rule 2 as written, no implementation gap: merging the extension's `salaries` into the bio already overwrites current-season-onward entries per the existing convention. |
| D12 | **Discord: a proposal posts to the private committee channel only (never the public one); the accepted extension posts to both.** | Reverses part of D9 — proposals are no longer silent to the committee, only to the public. Same "one function, one caller" discipline: whatever reaches the public channel must be reachable only from the accept path. |
| D13 | **Inbox notifications for a proposal are scoped to members holding `poext` — not the whole committee ecosystem, not `fac`.** | Mirrors D12's channel scoping at the individual level. |
| D15 | **Submitter attestation replaces the backfill for the indefinite-basis case, per proposal, on demand.** A proposal for a player with no ledger acquisition record must state when the submitting team believes the contract began; the fact sheet shows it beside whatever partial ledger history the player actually has. | **Stays at warn, never promoted to error** — a team has an incentive to shade the date, so it's a claim for the committee to eyeball, not a fact the validator trusts. **Does get promoted to error on contradiction**: if the player has *some* record (a trade, a release) that the attested date is impossible against, that's no longer an unconfirmable gap. **Not persisted or cached anywhere** — deliberately, per hkd 2026-08-19: rare enough in practice that re-asking on the next check is cheaper than a whole second data store for it. The real backfill (BACKLOG [P3]) is the actual fix for scale; this is a per-case bridge, not a replacement for it. |
| D14 | **`agent` is one role shared across FA and extensions — the agent represents the player, not either committee**, so the same person claims/negotiates on both sides. | **Shipped in code 2026-08-18**: `routers/constants.py` `ROLE_IMPLIES` now has `poext_head: {poext, agent}` alongside the existing `fac_head: {fac, agent}` — each head grant is therefore also a side door into the *other* committee's agent duties, accepted deliberately (§ 2.9 update below). Claim state (`blocked_teams`) must stay on separate per-pipeline objects — sharing the role must never mean sharing a claim record, so a claim in one pipeline can't block or leak into the other for the same player. `roles/index.html` and `members/index.html` now carry cards/badges for `fac`/`fac_head`/`agent`/`poext`/`poext_head`, previously entirely undocumented on the roles page and falling through to the generic team-green badge on the members page. |

Still open and **not** decided: everything in § 8, plus Q3 which needs to be put to the committee rather than inferred.

---

## 1. What the FA infra actually is

Three layers, and reuse has to be decided layer by layer. Conflating them is how
you end up with the backwards cap figures `extensions.md` § 1 documents.

| Layer | Where | Reuse verdict |
|---|---|---|
| **L1 — rules / validator** | `transactions.py`: `_validate_sign`, `_signing_fact_sheet`, `POST /api/validate/sign` | **Reuse the helpers, never the validator.** `_compute_team_salary`, `_check_contract_raises`, `_min_salary_floor`, `_bird_tenure`, `_autofill_fa_hold_amounts` are all season-parameterised or contract-shaped and transfer directly. `_validate_sign` itself is framed around replacing a current-season figure and cannot be. |
| **L2 — deliberation** | `free_agency.py`: the offer object, `LIVE_STATUSES`/`_is_live`, remand/void/restore, `versions`, sub-committee assignment, the 1,000-ball ballot, finalize | **The genuinely reusable asset.** Most of it is about *how a committee handles a proposal*, which is identical for an extension. |
| **L3 — surfaces** | `/free-agency` team form, `/pdc` dashboard, `fa_notify` two-channel feed | **Copy the patterns, build new pages.** The `#poext` stub already exists (§ 6). |

**The load-bearing fact about L2: it ends in a manual hand-off.** `finalize_player`
locks ballots, records totals, archives offers and closes the player — it does
**not** write a transaction. The committee then types the signing into
`/transactions` by hand. That is why the pipeline can be built ahead of the apply
path, and it is the single biggest scheduling lever here (§ 7).

---

## 2. The legal distinctions that matter

### 2.1 Transaction shape — additive, not replacing

`extensions.md` § 1 has this right and measured it against production: submitting
a real extension shape to `/api/validate/sign` reported the team getting **$18.9M
cheaper** for extending a player. Cause is structural, three ways at once — Year 1
read as `salaries[cur_season]` (an extension has none), the player's live salary
backed out as a replaced hold (it isn't; it stays on the books), and a roster body
added for a player already rostered.

Consequences for the pipeline: **no roster-count check, no existing-hold backout,
and Year 1 is the first extended season's figure, not the current season's.**

### 2.2 The cap year under test is in the future — and its thresholds are zero

Every check must be measured in the **first extended season**.
`_compute_team_salary(team, bios, season)` already takes a season, so the *salary*
side is free.

The *threshold* side is not. Verified 2026-08-18 against live `cap-levels.json`:

```
25-26  cap 154,647,000   eaps null
26-27  cap 164,961,000   eaps 0
27-28  cap 0             eaps 0
28-29  cap 0             eaps 0
29-30  cap 0             eaps 0
```

Every extension's first season is 27-28 or later by construction (§ 6.2: new money
starts after the final guaranteed year of a live deal). So **every** extension's
cap check targets a season whose cap, apron and hard-cap figures are all zero. This
is the common case, not a corner case, and it is worse than the keys being absent:
a zero threshold doesn't error, it silently makes comparisons pass or fail wrongly.

`extensions.md` § 7 notes future cap levels "may not exist"; it should read as a
hard precondition. **A check that cannot run must not report a pass** — the same
principle `_require_validatable` enforces for unknown teams. `extension_cap_position`
must detect an unset threshold and return an explicit *cannot evaluate* result.

A second gap sits underneath the first, and it is structural rather than a data
entry backlog. `team-state.json` — which holds each team's triggered apron lock
(`hard_cap: "first_apron"`), MLE consumption and BAE usage — is keyed by season and
carries **25-26 and 26-27 only**. A hard cap "persists for the remainder of that
salary cap year" (§ 1.4), so a future season has no lock and cannot have one: it
will be set by transactions that have not happened yet. So for the first extended
season a team's *committed salary* is real and computable, but its *ceiling* is
unknown twice over — no thresholds, and no apron position.

The practical read: `extension_cap_position` can never be a full check for a future
season, even once cap levels are entered. At best it compares committed salary to
that season's league Hard Cap and Salary Cap. The apron half is not deferred, it is
undefined.

Note one thing that *does* work: `min_salary_scale` is populated for 27-28 onward
(projections off the § 3.12 5% escalator), so § 6.2 rule 4 — an extension may not
be at the league minimum — is computable today. D5 applies to the cap-position
check specifically, not to the whole future season.

**D5:** that is the settled behaviour — report *cannot evaluate*, don't block the
feature and don't project the thresholds. Projecting a future cap is a league-office
decision, and a default buried in code would quietly feed every other future-season
calculation as well. The committee sets 27-28 onward when it is ready; until then
every extension carries a visibly unverified cap check, which is the honest state.

### 2.3 Eligibility is not derivable from the bio — correction to `extensions.md` § 5

`extensions.md` rates `extension_eligibility` (rules 1 and 2) as **error** level, on
the grounds that prior contract length and position within it are "fully derivable
from `salaries` + `cap_holds`. No excuse to warn."

That is wrong, and measurably so. Checked against live data 2026-08-18:

- **Zero of 502 rostered players have a salary row earlier than 25-26.** The salary
  map is left-truncated at the point bios started being kept; it is not a contract
  record.
- Read that way, contract length maxes out at what's visible, and **0 of 502
  rostered players are eligible under rules 1 + 2.** A player in the final year of
  a deal signed in 23-24 shows two visible seasons and reads as a 2-year contract,
  failing rule 1.

The fix is the same one § 3.8 Bird tenure already made: **derive from the ledger.**
Contract *start* is the league year of the player's most recent
`sign` / `sign_pick` / `convert_twoway` / `offer_sheet_decision`; contract *end* is
the last non-hold salaried season on the bio. Hybrid derivation against live data:

| | count |
|---|---|
| rostered | 502 |
| **eligible under rules 1 + 2** | **32** (30 in a final year, 2 in Year 4 of 5) |
| contract shorter than 3 years | 117 |
| eligible length, wrong position in the contract | 191 |
| **no acquisition record — start unknowable** | **131 (26%)** |

(Estimate: league year of a signing taken as July-to-June, not the rollover table.
Directionally solid; re-derive against `_current_league_year` when implementing.)

Two things follow.

**First, ~32 players is the real size of this feature.** It resolves
`extensions.md` § 9 Q1 in favour of the strict reading — § 6.2 rule 2 is the hard
test and § 6.3's buckets sit inside it. A low-volume, high-stakes pipeline, which
argues for the full committee treatment rather than a lightweight form.

**Second, the severity has to invert.** Missing ledger data truncates the contract,
making it look *shorter* and its position *later* — so a gap can only produce false
**ineligibility**. An error-level check would refuse 131 legal extensions outright.
Mirror § 3.8's asymmetry, in the opposite direction: **error only from a definite
basis, warn-and-allow from an indefinite one.**

Reuse note: `_player_acquisition_index` already scans the ledger for `_bird_tenure`
and is mtime-cached against `transactions.json`. Extend it to carry the last
signing date — one index, one scan. `extensions.md` § 6 already proposes extending
that same index for the § 4.5 trade restriction; it is the same extension.

### 2.3a The backfill — sized 2026-08-18, no longer blocking (D1 reversed 2026-08-19)

161 rostered players carry no `sign` / `sign_pick` / `convert_twoway` /
`offer_sheet_decision` entry. Only 4 of them have anything in `bio["contracts"]`,
so that field is not a route (as § 3.8 already established). Measured against the
on-disk corpora:

| Group | Count | Route |
|---|---|---|
| Named somewhere in `discord-fa-signings-raw` or `discord-transactions-raw` | **97** | Re-work the existing resolver against messages it already holds — this is the flagged (162) / skipped (538) residue of the completed backfill, not new research |
| Named nowhere, but carry a `draft_year` — 29 from the 2026 draft, 14 from 2024, 12 from 2023 | **59** | Rule-derivable: absent any signing record they are still on the rookie deal, so contract start = draft year. Near-free, and the 2023 cohort matters most since their Year 4 is 26-27 — exactly the rookie-scale extension bucket |
| No draft year and no mention anywhere | **5** | A human states it |

**This sizing is still useful, it just isn't a gate anymore (D1).** Filed as
BACKLOG [P3]. In its place (D15): when a proposal is submitted for a player with
no ledger record, the submitting team attests when the deal began, and the fact
sheet shows that attestation next to whatever partial history the ledger *does*
have for the player (a trade, a release, anything bounding the current spell with
the team) — not to promote the attestation to a fact, but so the committee can
catch a contradiction, which is the one case that should error rather than warn.

The rookie-deal inference (the 59) is safe in the direction it matters regardless
of whether the backfill ever runs: a player who had re-signed would have left a
signing record, so its absence is itself the evidence.

### 2.4 Monopoly, not market

Only the incumbent may extend. There is never a rival bid. This deletes, wholesale:
the § 4.6 cross-team conflict flags, the one-live-offer-per-team-per-player rule,
the FFA clock and its window/extend/expiry machinery, and the ballot's function as
an *allocation* device.

What survives is a genuine committee decision — § 6.3 says the head initiates
discussion and a proposal may be **rejected** — but it is accept/reject on a single
proposal, not allocate-among-N.

### 2.5 The scarce resource is proposals, not slots

FA rations *offer slots* (one live offer per team per player). § 6.3 rations
*proposals*: an expiring veteran's negotiation allows **3 total**, and after three
rejections "no further extension opportunities arise" — permanently, for that
player.

FA has no permanent terminal state. `closed` is per-round and `unlock` reopens it.
Extensions need one, and it destroys value irreversibly, so:

- the counter is **stored**, not recomputed from history that later edits could move;
- it is shown to the team **before** submit, not discovered after;
- exhaustion is a real status that `_is_live` excludes and that nothing but an
  explicit BOD override can undo.

**D4, corrected 2026-08-19: a remand is free; only a committee-level rejection
burns one.** There is no standalone `reject` action. "Reject" is not a thing an
assigned reviewer or the head does directly — it's what `finalize` records when
the sub-committee's ballot (D6) comes back majority-reject. That's the only
place the counter moves.

The flow: agent claims → agent negotiates, issuing a **remand** for anything
that needs fixing before this goes anywhere (free, no committee involvement,
doesn't touch the counter — same as a head sending a live proposal back to the
agent via `return-to-agent`, which FA already has) → once satisfied, agent
**advances** it to the committee → assigned members cast accept/reject
**ballots** → head **finalizes**, tallying the vote. Majority accept: agreed.
Majority reject: burns one of the three, team may resubmit unless that was the
third. No new endpoint needed beyond what D6's ballot already requires — FA's
`remand` + `void`/`restore` reuse verbatim, unchanged, and there is no third
committee action to add.

The counter itself must be **stored, not recomputed** from the remand/ballot
history that later edits could move; shown to the team **before** submit, not
discovered after; and exhaustion is a real status that `_is_live` excludes and
that nothing but an explicit BOD override can undo.

### 2.6 Windows are calendar deadlines, not races

The FFA clock exists to give rivals a fair shot. Irrelevant here. § 6.3's windows
are fixed dates:

| Kind | Deadline | Enforceable today? |
|---|---|---|
| Rookie scale | day before the regular season starts | **No** — no season-start date in the system |
| Veteran, non-expiring | day before the regular season starts | **No** — same gap |
| Veteran, expiring | June 30 | **Yes** — a fixed calendar date |

So ship `extension_window` as a real error for the expiring-veteran bucket and a
warning for the other two, rather than warning on all three. Same underlying gap as
§ 3.12 proration; closing it closes both.

### 2.7 The public channel only ever hears the accept; the private one hears more (D9, revised by D12/D13)

**D9 as originally written — nothing about a proposal goes to Discord at all —
is superseded.** The public/private split survives, but it is no longer
"public gets nothing, private gets nothing either." As decided 2026-08-18:

- **Private committee channel (`pdc-alerts`): gets proposal traffic.**
  Submitted / remanded / rejected / voided / restored — the same shape of
  events FA already posts there. Reviewers should learn there's something to
  review from the channel, the same way they do today, not only by opening
  the dashboard.
- **Public channel: accept only.** Still nothing about a live negotiation
  reaches it — submissions, remands and rejections stay committee-internal.
  An extension that's rejected or lapses is still a non-event as far as the
  public feed is concerned: announcing it would publish that a team tried and
  failed to keep a player, which the league has no business generating.
- **Member inbox (`inbox.notify_member`): scoped to `poext` holders**, not to
  the FA committee or the wider PDC membership (D13). "You've been assigned a
  proposal" should reach the people who can act on it and nobody wider — this
  mirrors the channel-level public/private split at the individual level.

**The public announcement is still the accept**, which still resolves where the
§ 4.5 six-month trade-freeze clock starts — with only one *public* announcement,
that date stays unambiguous. It must be stamped by the same write that records
the agreement, not by the Discord post — a notification can fail, be retried,
or be replayed, and none of those may move a date that blocks trades.

### 2.8 Confidentiality is scoped to the public channel, not designed away entirely (D9/D12 revised)

Free agency enforces that no team abbreviation and no `$` may reach the public
`fa-news` channel — by signature, not by care: `_news(slug, text)` is the only
function that can reach it, and it cannot be handed an offer.

With D12, a proposal's terms **do** now reach a Discord channel — but only the
private one, which committee members already see the full fact sheet on via the
dashboard, so there's nothing there to leak that the audience doesn't already
have. The guard still matters, just aimed at one boundary instead of two: **the
function that can reach the public channel must be reachable only from the
accept path**, never from the proposal/remand/reject/void functions that post to
`pdc-alerts`. One function, one caller — same discipline FA's `_news` choke
point uses, just drawn between "public" and "everything else" rather than
between "posted" and "not posted."

### 2.9 The agent role fits better here than in FA — and it's the same agent (D3, D14)

In FA, `agent` is a triage function — claim a player, curate competing bids down to
a final set. In an extension the agent is genuinely the player's side of a
two-party negotiation, which is what § 6.3's "committee head initiates the
discussion" and "the team may resubmit if rejected" describe. The claim's own-team
block (`blocked_teams`, permanent, survives release and reopen) transfers unchanged
and for the same reason.

**D3: extensions use the agent stage.** This overrides the leaner
team-proposes-committee-votes flow originally recommended here — the argument that
won is the one made above, that the agent is a truer fit in a bilateral negotiation
than in free agency, where the role is really bid triage.

**D14, decided 2026-08-18: `agent` is not cloned per committee — it's one role,
shared.** The framing above ("the agent's own-team block transfers unchanged")
undersold it: the agent isn't FA's role transplanted into extensions, it's a
single role that represents *the player*, and the same individual is expected to
act as agent whichever process a given player is in. Consequences, all shipped:

- `ROLE_IMPLIES` now has `fac_head: {fac, agent}` **and** `poext_head: {poext,
  agent}` (`routers/constants.py`, 2026-08-18) — each head's fallback into
  `agent` is therefore also a side door into the *other* committee's agent
  duties. A fac_head can claim/negotiate an extension; a poext_head can claim/
  negotiate an FA offer. Accepted deliberately rather than treated as a leak —
  heads are already trusted at that level, and a scoped "agent, but only for
  your own committee" variant isn't worth building for two people.
- **Claim state stays per-pipeline even though the role doesn't.**
  `blocked_teams` (permanent, survives release and reopen) must live on
  separate objects — the FA player object and a future poext negotiation
  object — never a single claimed-by field keyed on slug alone. An agent
  claiming a player in FA must not block or leak into that same player's
  extension process, and vice versa. This is an implementation requirement,
  not a nuance to lose when L2 gets built (§ 3).
- `roles/index.html` and `members/index.html` now document and color all five
  committee roles (`fac`, `fac_head`, `agent`, `poext`, `poext_head`) —
  previously `agent` had no badge case on the members page at all and fell
  through to the same green used for the 30 team-role badges, and none of the
  five existed on the roles page.

### 2.9a `finalize` is head-only here — FA's agent-uncontested shortcut doesn't transfer

Checked against the real code (`free_agency.py:2066`, docstring citing "§ 4.7,
D24"): **the claiming agent may finalize an FA offer they haven't advanced** —
the uncontested case, where curation left one bid standing and a full ballot at
a single option is ceremony. That looked at first like something `finalize`
should also do for extensions, since § 3 says reuse the object "verbatim." It
doesn't, and not as a simplification — the two problems aren't the same shape.

FA's uncontested shortcut exists because FA is an **allocation** problem:
multiple teams can each have a live bid on the same free agent, and "uncontested"
means curation left exactly one, so there's nothing left to *choose between* —
the ballot would just be confirming the only option. An extension never has that
shape. § 2.4 already established there is exactly one possible proposer (the
incumbent, monopoly not market), so there is no contested/uncontested axis to
collapse — every extension is a single up-or-down **merits** call on one set of
terms, which is precisely what § 6.3's "committee head initiates the discussion"
describes as mandatory for all three windows. So `finalize` stays head-only,
full stop; no agent path, and this was right in the original endpoint table
before this doc second-guessed it.

### 2.10 An extension consumes nothing

Already decided and locked in code (`extensions.md` § 9 Q4/Q5): it does not reset
§ 3.8 Bird tenure — the exclusion is documented at the `release` branch of
`_player_acquisition_index` and pinned by `tests/test_bird_rights_tenure.py` — and
it consumes no roster spot and no § 4.5 trade-limit slot. `_validate_extension`
must run **no** roster-count check.

### 2.11 Conditional trade + extension breaks the authorization model

§ 6.2: if Team B wants a player only on agreeing an extension, **Team A** submits
the pitch on B's behalf.

Every FA endpoint derives the team from the stored object and gates on that team's
role — deliberately, so a request body can never widen authorization. Here the
submitting team is not the extending team, and the trade is contingent on the
extension's outcome.

Recommend deferring the mechanism, but **define the fields now** —
`extending_team` and `submitted_by_team` as separate keys from day one, plus a
nullable link to the contingent trade. Adding them later is a data migration on
live negotiations.

---

## 3. Object mapping, FA → extension

| FA | Extension | Verdict |
|---|---|---|
| `GET /api/fa/pool` — `_fa_pool`, `_is_current_fa`, every entry carrying `current` + a server-composed `reason` | `GET /api/poext/eligible` | **Copy the pattern wholesale**, new derivation (§ 2.3). The `reason`-on-every-entry contract is the most successful thing about `/free-agency`: it lets the ⋯ menu show moves **disabled with the rule-citing reason** instead of hiding them, and no refusal string is composed client-side. |
| offer object: `id`, `number` (monotonic `seq`), `status`, `version`, `versions`, `remands`, `history`, `void`, `created_by`/`submitted_by` | proposal object, same shape | **Reuse near-verbatim.** |
| `LIVE_STATUSES` / `_is_live` | same + terminal `agreed`, `exhausted` | Extend. Every consequence of voiding falls out of `_is_live` alone; keep that discipline — extend `_is_live`'s callers, never add a parallel rule. |
| one live offer per team per player | one live proposal per player, **≤ 3 lifetime** (§ 6.3) | **Replace** — different scarce resource (§ 2.5). |
| `remand` (asks a question) + `void` (head-only, out of play) | same two, **unchanged — no new action** (D4, corrected) | Reuse both verbatim. "Reject" is not an action; it's `finalize` recording a majority-reject ballot (D6), which is the only thing that burns one of the three proposals. |
| void / restore, `void.from_status` | same | **Reuse verbatim.** Wrong player, duplicate, team since ruled ineligible — all still occur. |
| `mode` / `rounds` / `round_id` | drop | An extension isn't grouped with other extensions. |
| FFA clock, `ffa-window`, `ffa-extend`, `_sweep_ffa_expiry`, `closed_posted` | drop | § 2.6. |
| 1,000-ball ballot, `_ballot_options`, synthetic `QO` / `NO_SIGNING` | **accept/reject majority (D6)** | **Replace, flagged to revisit.** Matches what the decision is; the ball ballot stays available if the committee later wants strength-of-feeling. Assignment, abstention tracking and the finalize record are identical either way, so switching back is cheap. |
| sub-committee assignment, `_is_assigned`, **ballot gated on assignment not on being head** | same | **Reuse verbatim.** `PUT .../ballot` is the one endpoint that doesn't wave `admin` through — a ballot is a vote, not an administrative action. Keep that. |
| `agent` claim / release / advance / return-to-agent, `blocked_teams` | same — **in scope (D3)** | Reuse verbatim, plus `poext_head → agent` in `ROLE_IMPLIES` (§ 2.9). |
| `finalize` — locks, records totals, archives, closes, **writes no transaction** | same mechanics, **head-only, no agent-uncontested path** | Mostly reuse, one deliberate divergence (§ 2.9a) — FA lets the claiming agent finalize an unadvanced/uncontested offer; extensions have no contested/uncontested axis to collapse (§ 2.4: exactly one possible proposer), so every proposal goes through the head. |
| `_team_commitment` / `GET /api/fa/commitment/{team}` — sums live offers' Year 1 against **current** room | must re-frame to the **first extended season** | **Rewrite. This is the biggest trap in the whole exercise** — the FA version is correct code that answers the wrong question, so it fails silently rather than loudly. |
| `_run_validation` → `_validate_sign` | → `_validate_extension` | New (`extensions.md` § 5). |
| `_pending_offer_hold` — a live offer sheet charges the offering team a hold | **none (D7)** | **Deliberately not cloned.** The FA hold stops a team bidding on five players with one team's worth of room; with exactly one possible proposer and the money in a future league year, that failure mode doesn't exist. Omitted by decision, not by accident. |
| `fa_notify`, two channels, `_news` choke point | **`poext_notify`: private (`pdc-alerts`) gets proposal + accept traffic; public gets accept only (D9/D12/D13)** | **Adapt, don't clone verbatim.** The private side is a straightforward port of FA's `pdc-alerts` posting (submit / remand / advance / finalize-with-either-outcome / void / restore — no standalone reject event, since finalize's tally is what a rejection *is*); the public side keeps FA's `_news`-style choke point — reachable only from the accept path. Inbox notifications scoped to `poext` holders, not the wider committee (D13). Reuse `discord_transport` for pacing, as every other feed does. |
| `/free-agency` team-facing form | `/extensions` | Copy, including **no cap math in the page** — every dollar off the validator's fact sheet. |
| `/pdc` dashboard | fill the existing `#poext` stub | § 6. |

---

## 4. Endpoints

Namespace `/api/poext/*` rather than overloading `/api/fa/*`: the roles are already
separate (`poext` / `poext_head`), the object is a different shape, and the FA
router is 2,187 lines. Shared helpers move to a common module rather than being
imported across routers.

```
GET    /api/poext/eligible                     public — every rostered player,
                                               `eligible` + server-composed `reason`
POST   /api/poext/proposals                    team role — draft
PATCH  /api/poext/proposals/{id}               team role — while draft/returned
DELETE /api/poext/proposals/{id}               team role — while draft
POST   /api/poext/proposals/{id}/submit        team role — final at team initiative
POST   /api/poext/proposals/{id}/remand        claiming agent / head — free, pre- or mid-committee (D4)
POST   /api/poext/proposals/{id}/void          head only — § 4.3b analogue
POST   /api/poext/proposals/{id}/restore       head only
POST   /api/poext/players/{slug}/claim         agent — own team permanently blocked (D3)
POST   /api/poext/players/{slug}/advance       agent — to sub-committee
GET    /api/poext/players/{slug}/review        committee
PUT    /api/poext/players/{slug}/vote          assigned only — never admin-waved (D6)
POST   /api/poext/players/{slug}/finalize      head only — no agent-uncontested shortcut (§ 2.9a).
                                               Tallies the ballot; majority-reject is what burns
                                               one of the three proposals (D4). No separate
                                               `reject` endpoint exists.
GET    /api/poext/commitment/{team}            team — keyed to the first extended season
POST   /api/validate/extension                 public, read-only (L1 phase 1)
```

---

## 5. How legality is determined — the information flow

The whole point of the read-only validator is that one function decides legality
and everything else displays what it said. This is how a verdict is actually
assembled.

### 5.1 Sources — where every input comes from

| Source | What it supplies | Coverage |
|---|---|---|
| `player-bios.json` | `salaries` by season, `cap_holds` by season, `guaranteed`, `guarantee_schedule`, `draft_year`/`draft_round`, `type` | Complete for the roster, but **salaries begin at 25-26** — it records money, not contract identity (§ 2.3) |
| `transactions.json` via `_player_acquisition_index` | when a player was acquired and how — `sign`, `sign_pick`, `convert_twoway`, `offer_sheet_decision`, `trade`, `release`, `pick` | 341/502 today, → ~497/502 after the Phase 0 backfill. mtime-cached, so re-reading 2MB per keystroke is avoided |
| `{abbr}-roster.csv` | roster membership (SLUG only) | Complete |
| `{abbr}-deadcap.csv` | dead cap by season | Complete |
| `cap-levels.json` | `cap`, `apron1`, `apron2`, `hard_cap`, `eaps`, `min_salary_scale` per season | **Mixed**: `min_salary_scale` populated through 29-30; every dollar threshold zero from 27-28 on (§ 2.2) |
| `team-state.json` | triggered apron lock, MLE/BAE consumption | **25-26 and 26-27 only** — structurally absent for any future season (§ 2.2) |
| the proposal itself | the extended term the team typed: salaries by season, option years, trailing hold, `kind` | — |

### 5.2 Derived facts — what gets computed before any check runs

Nothing here is stored; all of it is derived per validation call.

```
contract start      ← ledger: league year of the latest acquisition event
contract end        ← bios: last salaried season that is not a UFA/RFA hold
contract length     ← end − start + 1
position in deal    ← current league year − start + 1
prior salary        ← bios: salaries[contract end]        (the 140% base)
final gtd year      ← guaranteed[] where present, else the NON_GTD/option
                      exclusion convention (extensions.md § 4)
first extended szn  ← final gtd year + 1                  (the frame for everything below)
service / Bird tier ← _bird_tenure(slug, team, season, bio) off the same ledger index
team salary (fes)   ← _compute_team_salary(team, bios, first extended season)
                      = roster CSV × bios salaries + deadcap CSV
thresholds (fes)    ← cap-levels[first extended season]
minimum floor (fes) ← _min_salary_floor(first extended season, cap_levels)
```

The load-bearing line is **`first extended season`**. Every figure below it is
measured in that season, not the current one. Getting that wrong is what made
`/api/validate/sign` report a team $18.9M cheaper for extending a player
(§ 2.1).

### 5.3 Check by check — inputs, and what happens when they're missing

| Check | Reads | Verdict when its input is absent |
|---|---|---|
| `extension_eligibility` (rules 1–2: ≥3 years, final year or Yr 4 of 5) | ledger start, or **submitter attestation** when the ledger has no record (D15), + bios end | **warn and allow** on an indefinite basis (no record, or attested with nothing to contradict it) — a gap truncates the contract, so it can only ever produce false *ineligibility* (§ 2.3, D8). **Error** if the attested start date contradicts other partial ledger history (a trade, a release) that bounds when the current spell could have begun |
| `extension_service` (rule 3: 2 years with the team, or Bird via trade) | `_bird_tenure` | error on a definite basis, warn on `trade_floor`/unknown — the § 3.8 asymmetry, reused unchanged |
| `extension_not_minimum` (rule 4) | `min_salary_scale[fes]` | **runs today** — the scale is populated through 29-30 |
| `extension_min_length` (rule 6: ≥2 guaranteed years) | the proposal alone | always runs |
| `extension_max_year1` (rule 7: ≤140% of prior salary or of EAPS) | bios prior salary; `eaps[fes]` | prior-salary branch runs; **EAPS branch warns** — `eaps` is 0 or null in every season on file |
| `extension_raises` (rule 8: ≤8%, or 5% for extend-and-trade) | the proposal + `kind` | always runs; `_check_contract_raises` needs an explicit pct rather than its current `bird_pct` bool |
| `extension_start_season` (rule 10) | `guaranteed`/`cap_holds` convention | error naming both seasons on mismatch — silently accepting puts money in the wrong league year |
| `extension_cap_position` (rule 5) | team salary (fes) + thresholds (fes) + apron lock (fes) | **cannot evaluate** (D5). Thresholds are zero and the apron lock is structurally undefined for a future season (§ 2.2) |
| `extension_window` (§ 6.3) | proposal date + bucket | error for expiring veterans (June 30 is a real date); warn for the other two, which need a season-start date the system doesn't have |

### 5.4 What the team and the committee see

The validator returns `{legal, checks[], fact_sheet}`. `_extension_fact_sheet` is
keyed on the **first extended season** and carries: the existing contract with its
final guaranteed year marked; the extended term; the 140% ceiling, which basis
produced it, and the headroom left; and team salary in that season with whatever
can be said about the ceiling.

**No page recomputes any of it.** `/extensions` renders the fact sheet, the ⋯ menu
renders `reason` strings composed server-side, and the committee's review page
renders the same object. That rule is the reason `/free-agency` can never show a
team room the validator didn't credit it with, and it is the single most valuable
thing to copy.

The invariant underneath it: **the fact sheet must never do its own cap math.**
Build every figure from the helper the check used. A sheet that computes
independently will eventually disagree with the verdict printed beside it.

### 5.5 Where a verdict can go wrong, and how it's contained

Three failure modes, each with a named containment:

- **A source is silently empty.** A validator handed an unknown team reads its
  salary as $0 and every check passes vacuously — this really happened on
  `/api/validate/trade`, which scored unknown teams and reported a passing hard-cap
  check with a roster count of −1. Containment: a `_require_validatable` equivalent
  refusing unknown teams and players with a 400 before scoring anything.
- **A check can't run but reports anyway.** Containment: D5 — an unevaluable check
  returns *cannot evaluate*, never a pass. A green rubric assembled from checks
  that never ran is worse than no rubric.
- **The endpoint wrapper breaks while the validator is fine.** Every other suite
  calls validators directly, which is exactly why both historical endpoint bugs
  lived in the wrapper. Containment: a case in `tests/test_validate_endpoints.py`,
  the only suite that goes through HTTP.

### 5.6 Amendments to `extensions.md` § 5

That document's check list stands, with three changes from this one:

- `extension_eligibility` — **error from a definite ledger basis, warn otherwise**
  (§ 2.3, D8), not error unconditionally.
- `extension_cap_position` — *cannot evaluate* on unset thresholds, which today is
  every target season (§ 2.2, D5).
- `extension_window` — error for the expiring-veteran bucket, warn for the two that
  need a season-start date (§ 2.6).

## 6. Surfaces that already exist

The committee shell is scaffolded and waiting:

- `poext` / `poext_head` are in `VALID_ROLES` (`routers/constants.py`), with
  `poext_head → poext` in `ROLE_IMPLIES`
- `nav.js:233` already routes those roles to `/pdc`
- `members/index.html` has the role badges and styling
- `pdc/index.html` has a `<div id="poext" hidden>` and the copy *"PO-EXT — granted,
  but this page is a stub for PO-EXT for now. Nothing to do yet."*
- `GET /api/fa/state` already accepts `poext` in its role check

Note `/pdc` is served at both `nbn.today/pdc` and `pdc.nbn.today` from the same
docroot; any new path rule needs adding to both nginx blocks or it works on one
host and 404s on the other.

---

## 7. Phasing

The manual hand-off at finalize (§ 1) means the pipeline and the apply path are
independent. Recommended order:

~~Phase 0 — the backfill.~~ **Removed as a gate (D1 reversed 2026-08-19).** Filed
on `BACKLOG.md` [P3] — § 2.3a's sizing (97 / 59 / 5) is still the right plan
whenever someone picks it up, it just doesn't block anything below.

**Phase A — validator, read-only (D2).** `ExtensionDetails`, `_validate_extension`,
`_extension_fact_sheet`, `POST /api/validate/extension`, Extension tab in
`/transaction-sim`. Zero risk to live data; lets the committee run the ~32 real
eligible players through the rubric before anything writes. Add a case to
`tests/test_validate_endpoints.py` — it is the only suite that goes through HTTP,
and both historical endpoint bugs lived exactly there.

**Phase B — eligibility projection.** Extend `_player_acquisition_index` with the
last signing date; `GET /api/poext/eligible` with `eligible` + `reason` per player.
Standalone and immediately useful: it answers "who can we extend?", which nobody
can currently answer without reading the ledger by hand. After Phase 0 the answer
is trustworthy for all but ~5 players.

**Phase C — negotiation object + committee.** The L2 clone: proposals,
remand/void/restore (D4, corrected — no standalone reject), the agent stage (D3),
assignment, accept/reject vote (D6), finalize. Fill the `#poext` stub. Committee
works real extensions here;
the resulting signing is still entered by hand on `/transactions`, exactly as FA
does today.

**Phase D — team-facing `/extensions`.** The ⋯ menu and proposal form, mirroring
`/free-agency` including the disabled-with-reason discipline and the proposal
counter (§ 2.5).

**Phase E — apply path.** `extension` in `_VALIDATORS`, the `create_transaction`
whitelist, `_detail_models`, apply dispatch, `_apply_extension`. Needs
`extensions.md` § 9 Q2 (final guaranteed year) settled. The single accept
announcement and its § 4.5 date stamp land here (D9).

**Phase F — § 4.5 trade restriction.** `_check_extension_trade_restriction` in
`_validate_trade`, off the same index Phase B extended. Only meaningful once
Phase E is producing ledger entries.

**Phase G — windows.** Full § 6.3 enforcement once a regular-season start date
exists.

---

## 8. Open questions

Seven of the original are now settled: D3, D4, D6, D7 in § 0, plus D10 (Q1) and
D11 (Q2, fully). What remains from `extensions.md` § 9:

**Q3** — when does 140%-of-EAPS apply instead of 140%-of-prior-salary?
"Whichever applies" is not implementable as written, **and this one needs to be
put to the committee explicitly rather than inferred from the rulebook text** —
there's no reading of § 6.2 rule 7 that resolves it on its own, unlike Q1/Q2
which the rulebook's own wording (plus the ledger data) settled without a new
ruling.

New, still open:

1. **Does the three-proposal cap apply to the rookie-scale and non-expiring-veteran
   buckets?** § 6.3 states it only under expiring veterans; the other two say
   "resubmit at any point before the deadline" with no cap. D4 settles how proposals
   are *counted*, not which negotiations are capped.
2. **Uncorroborated attestation — warn, or refuse?** With D1 reversed, this
   applies to any proposal where the ledger has no record and the attested start
   date can't be checked against anything (today, potentially any of the 161; once
   the BACKLOG [P3] backfill eventually lands, just the ~5 truly unrecoverable
   ones). D8/D15 say warn-and-allow; whether that should ever tighten to refuse is
   still open, and the committee could simply rule case by case rather than pick a
   general policy.
3. **What defines an extend-and-trade?** § 3.9's raise table and § 6.2 both cite the
   5% figure, but no section defines the mechanism or the sequencing. Open BACKLOG
   item; `ExtensionDetails.kind` already reserves the value.
4. **Revisit D6** once the committee has run real extensions — accept/reject may
   prove too blunt where the disagreement is about terms rather than yes/no.

## 9. Blockers, re-verified 2026-08-18

| # | Blocker | Status |
|---|---|---|
| 1 | **Future cap levels are zero.** 27-28, 28-29, 29-30 all carry `cap: 0`. Every extension targets one of them. | **Open, no longer blocking (D5).** The check reports *cannot evaluate*; committee sets them in Cap Settings when ready. |
| 2 | **EAPS unset.** 25-26 `null`, 26-27 through 29-30 all `0`. | **Open.** Rule 7's second branch is uncomputable; either set EAPS or redefine the ceiling as prior-salary-only. |
| 3 | **Guarantee data ~empty.** 27/1023 bios carry `guaranteed`, 23 carry `guarantee_schedule`, **0** carry `guarantee_dates` (was 18/21/0 on 2026-08-07 — barely moved). | **Convention ratified 2026-08-19 (D11); data sparsity itself unchanged.** The § 4 rule-2 convention (option years excluded from "guaranteed," treated as declined and superseded) is now the ratified rule, not a de-facto-law risk. What's still open is only the data: rule 1 (explicit `guaranteed`/`guarantee_schedule`) almost never fires, so nearly every case falls to rule 2 by default — fine now that rule 2 is settled, but still worth more data entry if precision matters. |
| 4 | **No regular-season start date** anywhere in the system. | **Open, but partial.** June 30 is computable, so the expiring-veteran window is enforceable today (§ 2.6). |
| 5 | ~~`/api/rookie-scale` returns `{}`~~ | **CLOSED.** Populated for 2025 and 2026 via `build/load_rookie_scale.py`. `extensions.md` § 8.3 and the docstring on `free_agency._qo_amount` both still cite this as a live blocker and are stale. |

---

## 10. Questions for the committee/BOD — batched 2026-08-19

Everything below needs a person to answer; none of it is inferable from the
rulebook, the ledger, or existing data. Grouped so related ones land together.

**Extension terms (§ 6.2)**

1. Rule 7 caps Year 1 of an extension at "140% of the player's prior salary or
   140% of the estimated average salary (EAPS), whichever applies." When does
   the EAPS branch apply instead of prior salary? Right now there's no reading
   of the rule that resolves this on its own.

**Submission windows (§ 6.3)**

2. The "maximum of 3 total proposals" is written under the expiring-veteran
   bucket specifically. Does that cap also apply to Rookie Scale and Veteran
   (non-expiring) extensions, or is unlimited resubmission before the deadline
   actually intended for those two?

**Extend-and-trade (§ 3.9 / § 6.2)**

3. What defines an "extend-and-trade"? The 5% (vs. 8%) raise ceiling is named
   but the mechanism isn't — is it the player being traded in the same
   transaction as the extension, signed shortly before/after a trade, or does
   it require a specific sequencing (extension first, then trade, or
   simultaneous)?

**Process — how far to trust an unverifiable claim**

4. When a team submits an extension proposal for a player whose contract-start
   date isn't on record anywhere, and there's nothing else on file to check
   their claim against — does that stay flagged for manual review indefinitely,
   or is there a point where it should just be refused for lack of proof?

**Cap configuration — not a ruling, but blocks real use regardless**

5. EAPS (estimated average player salary) has never been set for any season on
   file (null for 25-26, zero for every season after). Rule 7's second branch
   can't be evaluated at all until a real figure exists, independent of how
   Q1 above gets answered.
6. Salary Cap / apron / hard-cap thresholds for 27-28 onward are currently zero
   in Cap Settings. Every extension necessarily targets one of those seasons —
   until real figures are entered, the cap-position check will show "cannot
   evaluate" on every single extension, by design (it won't lie and show a
   pass), but that means no cap check actually runs until this is done.
7. Is there a regular-season start date the system can record? Two of the
   three § 6.3 windows ("day before the regular season starts") can't be
   enforced without one — only the expiring-veteran window (June 30) works
   today.

---

## 11. Corrections owed to `nbn-api/docs/extensions.md`

**All four applied 2026-08-19.** Left here as a record of what changed and why,
not as a live to-do:

1. § 5, `extension_eligibility`: "fully derivable from `salaries` + `cap_holds`.
   No excuse to warn" was false (§ 2.3). Now error/warning split on ledger basis,
   plus the D15 attestation path, matching this doc.
2. § 8.3: `/api/rookie-scale` is populated; no longer listed as a blocker.
3. § 7 (fact sheet fields): "cap levels for future seasons may not exist"
   corrected to "exist and are zero" (§ 2.2's actual finding).
4. `free_agency._qo_amount`'s docstring no longer cites the stale rookie-scale
   gap — corrected to name the real blocker, the unratified § 3.9 QO formula
   (BACKLOG [P1]), so nobody reads the None branch as a data problem and wires
   in an unratified figure.
