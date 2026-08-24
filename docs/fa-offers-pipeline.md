# Free-agent offers — team side, agent stage, and voiding

Detail split out of `CLAUDE.md` on 2026-08-24. The lifecycle of one offer:
a team drafts and submits it, an agent curates it, the committee ballots it,
the head voids or finalizes it. The design record is
`docs/pdc-free-agency-spec.md`; this is the operating detail.

## Team-facing FA offers

The ⋯ menu and offer form on `/free-agency` (spec § 8.1). **One gate on the whole
object** (§ 6.0) — any holder of the team's role drafts *and* submits:

| Action | Gate | Endpoint |
|---|---|---|
| Create / edit / delete a **draft** | any holder of the team's role | `POST`/`PATCH`/`DELETE /api/fa/offers` |
| **Submit** (and resubmit a remanded offer) | any holder of the team's role | `POST /api/fa/offers/{id}/submit` |

Submit was owner-only (`is_team_owner`) until 2026-08-10, mirroring the split team
pages draw between the trading block and renounce. **That split doesn't transfer**:
a renounce destroys roster state immediately, while an offer goes to a committee
that reviews and can remand it — so the owner tier bought no safety and cost the
team its FFA window (§ 4.1) whenever the owner wasn't around. `submitted_by` and
`created_by` still record who did which. The team is always derived from the stored
offer, never from the request body, so the role is the only thing that widened.

Three rules this page holds and must keep holding:

- **No cap math in the page.** Every dollar comes off the fact sheet
  `POST /api/validate/sign` returns, or off `GET /api/fa/commitment/{team}` —
  the same `_team_commitment` the committee's review page renders. A team can
  never be shown room the validator didn't credit it with.
- **No reason string is composed client-side.** The disabled ⋯-menu copy is
  `reason` from `GET /api/fa/board`, i.e. the server's `_accepts_offers`. That
  is why the board lists closed players too (§ 6.3).
- **The FA pool is not the offerable set.** `GET /api/fa/pool` returns everyone
  with an actionable cap hold *on file*, keyed by the year it lands — it spans
  future league years, because `/free-agency`'s year chips are built from it
  (570 entries, 209 of them current, as of 2026-08-09). Each entry carries
  **`current`**, stamped by the same `_is_current_fa` that gates
  `_accepts_offers`. **Read `current`; never re-derive it** — a `class_year`
  comparison alone gets `RENOUNCED`/`UNSIGNED` wrong, and they are 132 of the
  209. This caught out both the team ⋯ menu and the head's "+ Player" picker.
- **Submission is final at the team's initiative** (§ 4.3). There is no withdraw
  endpoint and no post-submit edit — a submitted offer opens read-only. The only
  ways back are both the committee's: a **remand**, after which the same form
  reopens with the committee's notes pinned above it and the frozen prior figures
  beside each year input, or a **void** (§ 4.3b, below), after which the team may
  bid again from scratch.

The client legality check is advisory: the server re-runs `_validate_sign` at
submit and *that* verdict is what's stored. There is no `force` on this path,
for the same reason `self_renounce` has none.

## The agent stage (§ 4.7) — who curates what the committee sees

A third role, `agent`, sits between a closed offer window and a sub-committee
ballot. Agents **claim** free agents off a shared queue (no per-player
assignment, no head handing them out), negotiate the offers down to a final set,
then either **advance** the survivors to a sub-committee or **finalize** an
uncontested one. `fac_head → {fac, agent}`, which is the fallback that keeps the
stage from deadlocking; `agent` and `fac` are meant to be **different people**,
by role-grant convention rather than by a check.

Four things to know before touching it:

- **The stage is derived, never stored** — `_agent_stage` reads `status`, the
  FFA clock, `agent.advanced_at` and the finalize record. `open` →
  `awaiting_agent` → `with_agent` → `with_committee` → `decided`.
- **A claim bars the agent's own team from bidding, permanently.** It survives
  a release *and* a reopen (`blocked_teams` lives on the player, not the claim),
  which is the only reason releasing is safe to allow — otherwise it's a way to
  read every rival's figure and then bid. This is the **one hard block** in a
  subsystem that otherwise only warns about conflicts (§ 4.6 / D21). The barred
  team reads it as `your_block` on `GET /api/fa/board` — the one authenticated
  field on a public payload, scoped to the team it stops, since *which agent
  claimed whom* is committee information.
- **Filtering an offer out is a void, not a new status** — so the team is told
  why through the same `void.reason` machinery that already reaches their ⋯ menu
  and their re-bid form. This **reverses D14**: remand/void/restore are the
  claiming agent's plus head/admin, and assigned sub-committee members have
  none of them. A reviewer who wants a term changed asks the agent, or asks the
  head to `return-to-agent`.
- **Nothing is balloted before the advance**, gated in the API and not only in
  the dashboard. Agents never see a ballot, on any player. `final.path` records
  `agent` vs `committee` — the route, not the actor.

Negotiation itself happens in Discord; the site models only what it *changes*
(remand → revision → version diff). No message thread, no counter-offer object.

## Voiding an offer (§ 4.3b) — a status, not a delete

`POST /api/fa/offers/{id}/void` takes a `submitted`/`returned` offer out of play;
`POST /api/fa/offers/{id}/restore` undoes it. **Head-only** (`fac_head`/admin),
unlike a remand, which any assigned reviewer may issue: a remand asks the team a
question and the team can answer, and nobody can answer a void.

It exists because a remand leaves the bid **live** — on the ballot, in the team's
§ 5.3 exposure, holding its one-offer-per-player slot — which is wrong when the
offer should never have counted at all (wrong player, duplicate, team since ruled
ineligible). Those otherwise sit `returned` forever, listed as awaiting a team
with nothing to say.

**The whole implementation is that `voided` is not in `LIVE_STATUSES`.** Every
consequence falls out of the existing `_is_live` gate — off the ballot, out of
`_team_commitment`, no § 4.6 conflict, slot freed, no edit/resubmit/remand. Don't
add a parallel rule anywhere; extend `_is_live`'s callers instead.

Four things that are load-bearing and pinned by `tests/test_fa_offers.py`:

- **A reason is required**, and it is what the team is shown — in the ⋯ menu and
  above the form when they re-bid. Server-composed, like every other refusal
  string on `/free-agency`.
- **Restore returns `void.from_status`, not a guess.** A voided *remand* comes
  back `returned` with its notes still unanswered, or the void would have
  silently answered them. Refused if the team has since bid again (D5).
- **Ballots already cast are flagged, never rewritten** — `voided_since` on each
  ballot, `voided_options` on the finalize record. **Totals are never adjusted**:
  redistributing balls nobody redistributed is the software inventing a vote.
- **Finalize archives voided offers with the live ones**; `unlock` un-archives
  both. They belong to the round they were bid in.

On `/free-agency`, `MY_VOIDED` is deliberately a second map beside `MY_OFFERS` —
a void frees the slot, so one player can carry both a void and a fresh live
offer, and one map would have them fighting over the key.

**On the committee side, the ballot widget is gated on *assignment*, never on
being the head.** `PUT /api/fa/players/{slug}/ballot` is the one endpoint in the
API that does not wave `admin` through — a ballot is a vote, not an
administrative action — so gating the UI on "is head" would offer a vote the
server refuses. A head who isn't on a player's sub-committee sees the totals and
the finalize button and no inputs. Finalize, unlock and assignment are the
head's real powers and are separate endpoints.
