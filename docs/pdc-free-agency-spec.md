# PDC — Free Agency offer pipeline (spec v0.4)

**Status:** v1.1, 2026-08-09. Fifteen decisions settled (§ 12); no design
questions outstanding. **All eight phases are built** — the roles, the
server-side FA pool, the whole offer/ballot API, the shared lineup helper, the
`.nbn.today` session cookie, the dashboard, its own host at **`pdc.nbn.today`**,
the two Discord feeds, the team-facing ⋯ menu and offer form on `/free-agency`,
and the 1,000-ball ballot with per-player finalize. Both Discord env vars are
set and both feeds are live (verified in the running process, 2026-08-09).

**The pipeline is complete end to end: an owner can submit, the committee can
review, remand, ballot and lock**, and the dashboard is reachable from the main
site's jump box for the members who hold the role (§ 3.4). What remains is not
build work — it is the head putting the board into `rounds` or `ffa`, which is
the real switch (§ 10). Sections amended during the build
carry the reason inline (§ 3.2 what the live server block does, § 3.3 the marker
cookie and the allowlist's placement, § 4 locking, § 4.2 archiving and
`round_id`, § 4.3a version freezing, § 4.4 ballot gating, § 5.3 what
"overcommitted" means, § 6.2 the three read-side fields the dashboard needed,
§ 6.3 the team-side commitment endpoint, § 8.1/§ 8.2/§ 8.3 what Phases 5, 7 and
8 cover, § 8.4 loading, § 8.5 the panel's shape, § 9 the shared transport and
the public-channel chokepoint, § 9.3 the once-only expiry guard); those notes
are the record of what was learned, not decoration.

Scope of *this* document: **free agency only** — an owner drafts and submits a
contract offer to a free agent, the Free Agency Committee (FAC) reviews the
offers for that player, each assigned member splits 1,000 balls across them, and
the FAC head locks the result. Trades and extensions get the same treatment
later and should reuse this shape; they are named here only where a decision now
would box them in.

---

## 1. What exists already (build on these, don't re-solve them)

| Thing | Where | Why it matters here |
|---|---|---|
| Owner self-serve moves (renounce, trade block) | `teams/team.js` → `makeRosterMoveActions` / `openMovesMenu`; `POST /api/self/renounce` | The offer form's entry point is the same ⋯-menu pattern, and `self_renounce` is the exact template for an owner-authenticated write: team derived not supplied, no `force`, server-stamped date |
| Signing legality | `_validate_sign` + `_signing_fact_sheet` (`nbn-api/routers/transactions.py`), exposed at `POST /api/validate/sign` | The offer *is* a `SignDetails`. Legality is not reimplemented — it is this call |
| Offer sheets (§ 3.15) | `_apply_offer_sheet` / `_open_offer_sheets` / `_pending_offer_hold` | Prior art for "a pending thing that is enumerable, costs cap room, and is loud". FA offers are **not** offer sheets — see § 5.3 |
| Discord posting | `routers/discord_notify.py` — paced queue, freshness gate, burst cap, no-op without env channel | New channels reuse this module's transport, not a new `httpx.post` |
| FA pool derivation | `free-agency/index.html` (cap-hold scan over `player-bios.json`) | Today this lives only in page JS. The FAC needs the same list server-side (§ 3.1) |
| Projected lineup | `computeStartingFive` in `teams/team.js` | The dashboard shows each offering team's lineup; extract, don't fork (§ 8.4) |
| Role gating | `routers/auth.py` (`VALID_ROLES`, `ROLE_IMPLIES`, `require_role`, `is_team_owner`) | New committee roles are additions here |
| Monotonic ids | `suggestions.py` `seq` | Offer numbers must survive deletion |

---

## 2. Roles

Add to `VALID_ROLES` (`routers/constants.py`):

| Role | Who | Powers |
|---|---|---|
| `fac` | FAC member | Read the PDC dashboard's FA side; cast a ballot on players they're assigned to |
| `fac_head` | FAC head | Everything `fac` can do + set FA mode, open rounds, mark players open/closed, assign sub-committees, finalize allocations |
| `poext` | PO-EXT member | Placeholder now — PDC dashboard access, PO-EXT view is a stub |
| `poext_head` | PO-EXT head | Placeholder now |

`ROLE_IMPLIES`: `fac_head → {fac}`, `poext_head → {poext}`. `admin` already
satisfies every check in `auth.py` and keeps doing so. A member may hold both
`fac` and `poext`; the dashboard renders both sections for them.

`bod` deliberately does **not** imply `fac` (decided) — committee membership is a
specific assignment, and a bod-wide implication would silently put the whole
board on every sub-committee ballot roster.

**There is no PDC-head role (decided).** `fac_head` and `poext_head` are peers —
a two-headed leadership model over the PDC, each governing their own committee
and neither holding authority on the other's side. `admin` is the only role
above both, which is already true of every check in `auth.py`. So the four roles
above are the complete set; nothing else needs adding for the PDC.

**Ordering constraint:** `POST /api/members` rejects unknown role names, so the
constant change ships *before* anyone tries to grant the role. This is Phase 0
and is invisible on its own.

---

## 3. Hosting and auth for `pdc.nbn.today`

### 3.1 The problem to design around

`news.nbn.today` already existed and was **retired into `nbn.today/news`** for
one reason, recorded in its nginx config: the member token lives in
`localStorage` under the main origin, and a second origin means a second
sign-in. Two more consequences of a separate origin:

- **CORS.** `main.py` allows exactly `https://nbn.today` and
  `https://news.nbn.today`. A new origin must be added there or every API call
  fails.
- **Static files.** The dashboard also wants `/data/*.csv` and other static
  assets served by nginx with no CORS header at all — those would fail
  cross-origin regardless of the FastAPI setting.

### 3.2 Serving — same docroot under the subdomain

A `pdc.nbn.today` server block whose `root` is the same `/var/www/nbn.today`
docroot, with `location = /` mapping to `/pdc/index.html` and the identical
`/api/` proxy block. Then `/api/...`, `/data/*.csv` and `/teams/*` all resolve
under `pdc.nbn.today` itself — **no cross-origin request is ever made**, so
neither the CORS allowlist nor the missing static CORS header is in play.

**Built (Phase 5b)** at `/etc/nginx/sites-available/pdc.nbn.today`, symlinked
into `sites-enabled`, with its own Let's Encrypt certificate (`certbot --nginx
-d pdc.nbn.today`, HTTP→HTTPS redirect, auto-renewing on the existing timer).
Two additions the sketch above didn't carry:

- The block copies nbn.today's `.csv` and `/members/{name}` rules rather than
  only `/api/` — the dashboard fetches CSVs and links to member profiles, and a
  partial copy would have worked under `nbn.today/pdc` and 404'd here, which is
  the worst kind of divergence between two hosts serving one docroot.
- A per-host `robots.txt` returning `Disallow: /`, plus `X-Robots-Tag: noindex`
  on the HTML locations. The docroot is shared, so a file couldn't say something
  different here than on the main site. Nothing on this host is data a crawler
  could reach anyway (§ 3.4) — this is about the whole league site not being
  indexed twice under a committee hostname.

Verified live: the cookie minted on `nbn.today` authenticates
`GET /api/auth/me` and `/api/fa/state` under `pdc.nbn.today` with no bearer
header, while the same cookie on `PUT /api/trading-block/{team}` still 401s —
the § 3.3 allowlist holds across the host, which is the property that matters.

### 3.3 Auth — a session cookie scoped to `.nbn.today`

**Decided.** `localStorage` is per-origin; cookies are not. A cookie set with
`Domain=.nbn.today` is sent to every subdomain automatically, which is what the
`news.nbn.today` retirement worked around rather than solved.

- `token-badge.js` already runs on every nbn.today page and already holds the
  token. On page load, if a token is present and no live session cookie is, it
  calls `POST /api/auth/session` (bearer-authenticated) to mint one.
- The endpoint stores an **opaque random session id** in `sessions.json`
  (`{id: {member, created_at, expires_at, ua_hint}}`) and returns it as:

  ```
  Set-Cookie: nbn_session=<id>; Domain=.nbn.today; Path=/;
              Secure; HttpOnly; SameSite=Lax; Max-Age=2592000
  ```

- The member's actual token never leaves the server in the cookie. Rotating or
  deleting a member (`rotate-token`, `DELETE /api/members`) **drops all their
  sessions** — so revocation works, which a raw-token cookie could not offer.
- `HttpOnly` means page JS cannot read it at all: strictly safer than the
  localStorage token it complements. **This forced one addition (built):** the
  server sets a second, valueless `nbn_session_live` marker cookie that is *not*
  HttpOnly, because JS that cannot read the session cookie cannot tell whether it
  already has one — without the marker, `token-badge.js` would mint a fresh
  session row on every single page load. The marker carries no secret and expires
  with the session it marks. Verified in a real browser: `document.cookie` reads
  exactly `nbn_session_live=1`, load 2 mints nothing.
- **Roles are read live from members.json on resolve, never frozen onto the
  session** (built), so a role grant or revocation lands on the next request
  rather than at the session's 30-day expiry. A member deleted meanwhile resolves
  to nobody.
- Result: a committee member who has loaded nbn.today at any point since this
  ships can type `pdc.nbn.today` straight into the address bar and is already
  signed in. No link, no handoff, no paste, nothing in browser history.
- Fallback for a browser that has never seen the main site: the existing
  paste-a-token modal (`#team-signin-btn`'s), shown only when both the cookie
  and localStorage are empty.

**Cookie scope — deliberately narrow.** Cookie auth is what makes CSRF possible
at all. `SameSite=Lax` already blocks cross-site writes, but rather than lean on
that alone across the whole API, a resolver (`_resolve_session`) accepts the
cookie for **`GET /api/auth/me` and `/api/fa/*` only**. Every existing endpoint
— `PUT /api/roster/{team}`, `POST /api/transactions`, `POST /api/self/renounce`,
all of it — keeps requiring the `Authorization` header exactly as today. The
blast radius on the real roster and transaction write paths is zero. Widening it
later is a one-line change; narrowing it after the fact would not be.

Three things about that allowlist the build settled:

- **It lives in `get_token_info`, which reads `request.url.path`** — not in each
  endpoint. Every gate in `auth.py` (`require_role`, `require_any_role`,
  `require_admin`) already depends on that one resolver, so all of `/api/fa/*`
  inherits the cookie with no per-endpoint opt-in and nothing else can acquire it
  by accident.
- **`POST /api/auth/session` is itself off the list.** Minting takes the real
  token, so a session can never mint its successor and 30 days is a hard ceiling
  rather than a rolling one.
- **A bad `Authorization` header is never rescued by the cookie.** Only the
  branch that already 401'd on a missing header falls through to it, so a stale
  or revoked token still 403s loudly instead of quietly succeeding as whoever the
  cookie belongs to.

`POST /api/auth/session/logout` clears both cookies and deletes the session row.
It is deliberately **unauthenticated** — it only ever destroys the caller's own
cookie, and requiring auth would make an already-dead session impossible to
clear. Expired sessions are reaped lazily on read — no scheduler.

Revocation is wired at three call sites (built): `rotate-token`,
`DELETE /api/members/{name}`, and also `DELETE /api/tokens/{token}`, the
compatibility shim that revokes a token without deleting the member — it was
missed by the sketch above and would have left a revoked member signed in for
another 30 days.

### 3.4 The security boundary is the API, never the page

A static HTML shell served at any URL is world-readable. So:

- `pdc/index.html` ships **no league data**. It is a shell + JS.
- Every byte of committee data arrives from a role-gated endpoint. A stranger
  loading the URL gets the shell, one 401/403, and the "Forbidden — go back to
  nbn.today" screen.
- The forbidden screen is rendered from `GET /api/auth/me` returning no
  `fac`/`poext`/`admin` role. It is a courtesy, not a control.
- **Nothing in `nav.js` links to the dashboard** for non-committee members, and
  the PDC entry point on nbn.today is rendered only when `/api/auth/me` says so
  — the same pattern as `makeRosterMoveActions` returning `null`.

**Built.** `nav.js`'s `SITE_PAGES` is offered to everybody, so the entry lives in
a separate `ROLE_PAGES` list merged into the jump box's page results only for a
member holding `fac`/`fac_head`/`poext`/`poext_head`/`admin`. Three properties
it has to keep, all measured rather than assumed:

- **A logged-out visitor makes no auth request at all.** `nav.js` loads on every
  page of the site, so the check is guarded by `nbn_session_live` — the readable
  companion to the HttpOnly session cookie (§ 3.3), which exists for exactly this
  kind of question. Verified: zero `/api/auth/me` requests logged out, ever.
- **Nothing fires on an ordinary page load.** The check rides the same lazy path
  as the player index (`_loadPlayerData`), so it costs one request the first
  time a signed-in member opens search, and none after that.
- **It is a courtesy, not a control** — the same standing as the Forbidden
  screen. Anyone can type the URL; the API is the boundary. Hiding the entry is
  about not putting a page 27 of 30 owners can't use into their jump box.

---

## 4. Data model

Three new files in `NBS_DATA_DIR`, all read/written via `storage._load_json` /
`_save_json`, under **one** `_fa_lock` — not one lock per file, as this section
originally sketched. Every write that matters spans two of them (submit stamps
the FFA clock in `fa-state` *and* appends to `fa-offers`; finalize reads offers
*and* writes ballots), so three locks would always be taken together: no
concurrency gained, a lock-ordering bug available. Write traffic here is a
committee of a few people.

### 4.1 `fa-state.json` — the board's state

```jsonc
{
  "seq": 42,                        // monotonic; source of offer numbers
  "mode": "rounds",                 // "closed" | "rounds" | "ffa"
  "rounds": [
    { "id": "r3", "number": 3, "name": "Round 3",
      "opened_at": "2026-08-08T17:00:00Z", "opened_by": "skim",
      "closed_at": null, "closes_at": "2026-08-10T17:00:00Z" }  // advisory only
  ],
  "players": {
    "curry-stephen": {
      "status": "open",             // "open" | "held" | "closed"
      "round_id": "r3",
      "subcommittee": ["memberA", "memberB", "memberC"],
      "opened_at": "...", "opened_by": "skim",
      "ffa": null                   // in FFA: {started_at, deadline, started_by_offer}
    }
  }
}
```

- `mode: "closed"` — no offers accepted at all (out of the FA window).
- `mode: "rounds"` — only players with `status: "open"` accept offers.
- `mode: "ffa"` — **every** player in the derived FA pool accepts offers,
  regardless of `players[...]`. `status` still governs sub-committee assignment.

**The pool is not the offerable set** (learned the hard way, pinned by a test).
`_fa_pool` returns every player with an actionable cap hold on file, keyed by the
year that hold lands, so it spans future league years by design — it is what
`/free-agency`'s year chips are built from, and on the day this was written it
held **570 players of whom only 209 had actually reached free agency**. Read
literally, "every player in the pool accepts offers" in FFA mode offers a
contract to someone under contract for three more years.

So `_accepts_offers` gates on `class_year <= current league year` **before** it
looks at the mode — it is a fact about the player, not about the board, and the
more useful of the two things to be told. `PUT /api/fa/players/{slug}` refuses
to open one for the same reason: a player nobody can bid on, with a
sub-committee that has nothing to review, is worse than an error. `<=` rather
than `==`, because a hold that was never resolved leaves a player in an older
class while they are still plainly a free agent.

The lesson generalises past this bug: **anything reasoning about who can be
signed has to filter the pool by class year.** The pool answers "who has a hold
on file", not "who is a free agent today".

**The FFA clock (decided).** The *first submitted* offer on a player in FFA mode
stamps `ffa = {started_at, deadline: started_at + 24h, started_by_offer}`. A
draft does not start it; later offers do **not** extend it.

At `deadline` the player **stops accepting offers** and moves to the committee:
`POST /api/fa/offers/{id}/submit` returns 422 for that player, and the dashboard
lists them as *closed — clock expired, ready for ballots*.

Two properties this must have:

- **Expiry is evaluated lazily**, on every read and every write, by comparing
  `now` against `deadline`. There is no scheduler and no background job flipping
  state — a cron that dies leaves players silently open forever, and the
  comparison is free.
- **Nothing signs itself.** Expiry closes a submission window; it never resolves
  an outcome. Same doctrine as the § 3.15 offer-sheet deadline.

The FAC head can reopen a player (`PUT /api/fa/players/{slug}` → `status:
"open"`), which clears `ffa` and lets the next submitted offer start a fresh
clock. The reopen is recorded with who did it.

**Rounds carry no enforced clock (decided).** Opening Round N does *not*
auto-close Round N−1's open players, and `closes_at` is a **display label only**
— the dashboard shows it, nothing acts on it. In practice a new round does
supersede the old one, but the FAC head closes players by hand, because the
flexibility to leave one open across a boundary is worth more than the
automation. Consequence worth stating plainly: **the FFA 24-hour window is the
only clock in this system that the software enforces.** Everything else is a
person deciding.

### 4.2 `fa-offers.json` — the offers themselves

A flat list (like `transactions.json`), newest appended:

```jsonc
{
  "id": "f7c1a9b2",                 // random hex, the URL key
  "number": 42,                     // from seq — permanent human reference
  "player": "curry-stephen",
  "team": "PHX",
  "round_id": "r3",                 // or the FFA round marker
  "status": "draft",                // draft | submitted | returned  (§ 4.3, § 4.3a)
  "version": 1,                     // increments on each resubmission
  "versions": [],                   // frozen prior submitted versions
  "remands": [],                    // {at, by, note, from_version}
  "created_by": "memberName",       // who drafted it (may be a GM)
  "submitted_by": null,             // who submitted it (always the owner)
  "created_at": "...", "updated_at": "...", "submitted_at": null,

  // Exactly SignDetails — see § 5.1. Nothing else may be added to this object.
  "offer": {
    "player": "curry-stephen", "team": "PHX",
    "contract": { "type": "player", "salaries": {...}, "cap_holds": {...},
                  "guaranteed": {...}, "guarantee_dates": {...} },
    "signing_method": "cap_space",
    "bird_rights_type": null,
    "eaps_assumption": null
  },

  "pitch": "long-form text",
  "promises": {
    "mpg": 32,                      // int or null
    "playoffs": true,               // bool
    "role": "starter"               // face | starter | role_player | veteran | none
  },

  // Snapshot taken at submit — not recomputed later (§ 5.2)
  "validation": { "legal": true, "checks": [...], "fact_sheet": {...},
                  "validated_at": "...", "season": "26-27" },

  "history": [ { "ts": "...", "actor": "...", "from": "draft", "to": "submitted" } ]
}
```

**One live offer per team per player (decided).** `POST /api/fa/offers` 409s if
the team already has a draft or submitted offer on that player. Competing offers
from the same team to the same player are not allowed for now.

**"Live" ends at finalize, and only at finalize (built).** Each offer carries an
`archived_at`, null while live; `POST /api/fa/players/{slug}/finalize` stamps it
on every offer for that player, which is what frees the team to bid again in a
later round. Losing a bid in Round 1 must not lock a team out of that player
permanently.

A **reopen deliberately does not archive.** Offers on a player the head reopened
*without* finalizing were never resolved — they are still the ones under review,
and archiving them would silently discard live work. Unlock reverses its own
finalize by clearing the `archived_at` that finalize wrote, so the restored
ballots don't end up referring to offers nobody can see.

**`round_id` is stamped at submit, not at creation.** A draft isn't in a round
yet, and stamping early would misfile an offer drafted before the head opened
the player. In FFA the clock's session id doubles as the round id
(`ffa-<hex>`), so a player reopened for a second FFA window gets a fresh ballot
bucket instead of merging into the closed window's.

Note the interaction with § 4.3: with no withdrawal *and* no second offer, **the
draft is a team's only chance to get it right**. That is the whole reason the
draft state and its confirm step are specified as carefully as they are.

### 4.3 Submission is final *at the team's initiative* (decided)

There is **no withdraw endpoint and no team-initiated edit after submission**.
This mirrors § 3.14's existing rule for sign-and-trades — *"once submitted to
the committee, an S&T cannot be withdrawn"* — so free agency reads the same way.

The one exception is committee-initiated: the FAC may **remand** an offer back
to the team for revision (§ 4.3a). The distinction is the whole design — the
team can never reach for the revision path, so nothing here lets a team shop,
retract, or re-price at will, which is what § 3.14 exists to prevent.

Three consequences the build has to carry, because the cost of finality lands
somewhere and it should land where it's visible:

1. **The draft state is the safety net, so it has to be good.** The form's
   Submit is a two-step confirm naming the player and the total value, with the
   § 3.14 wording verbatim: *this cannot be withdrawn.*
2. **The "illegal now" badge becomes load-bearing.** An offer that goes illegal
   after submission cannot be pulled, so the live revalidation in § 5.2 is the
   only way the committee learns of it. It is a required part of the dashboard,
   not a nicety.
3. **A team can be awarded a player it can no longer fund.** The committee sees
   the badge and decides; the site does not resolve it. Worth a line in the
   § 8.5 instructions panel.

**Invariant: `offer` is a verbatim `SignDetails` payload.** It is what
`POST /api/validate/sign` is called with, and — when the roadmap item in § 11.2
lands — what gets posted to `POST /api/transactions` as `details`. Anything the
committee needs that isn't a contract term (pitch, promises) lives *outside*
`offer`. This is the single decision that keeps "FAC decides → site signs him"
a small future change rather than a rewrite.

### 4.3a Remand — the committee sends an offer back (decided)

**The gap this closes.** In practice the FAC negotiates: *"add a year"*, *"bump
the third-year salary and we'll consider it."* Under pure finality a team has no
way to answer that, and the negotiation happens in Discord while the site shows
a stale offer nobody is actually considering. The record then describes
something that isn't what was decided.

**The model: revision is a committee power, never a team power.** A team cannot
edit, withdraw, or ask the API for another go. The committee returns the offer,
and only then does it become editable — by the same people who could draft it,
resubmitted by the same owner who submitted it.

```
draft ──submit──▶ submitted ──remand──▶ returned ──resubmit──▶ submitted (v2)
                      ▲                                              │
                      └──────────────── remand again ────────────────┘
```

| Field | Meaning |
|---|---|
| `status` | `draft` → `submitted` → `returned` → `submitted` … |
| `version` | 1-based; increments on each resubmission |
| `versions[]` | Every previously submitted version, frozen whole: `offer`, `pitch`, `promises`, and its `validation` snapshot |
| `remands[]` | `{at, by, note, from_version}` — the committee's ask, on the record |

Rules:

- **A remand requires a note.** An empty send-back is just a delay; the note is
  what the team is answering and what the record shows the committee asked for.
- **Resubmission is the same endpoint** (`POST /api/fa/offers/{id}/submit`), so
  it revalidates, re-snapshots, and re-notifies through exactly one code path.
  A resubmitted offer is as final as the first one until remanded again.
- **Nothing is overwritten.** `versions[]` plus `remands[]` mean the dashboard
  can show *offered → asked → returned* as a sequence. Without that history,
  "final" would be unfalsifiable — nobody could see what changed.
  **The freeze happens at the remand, not at the resubmission** (learned the
  hard way, pinned by a test). A returned offer is editable, so by the time it
  comes back `offer` already holds the *new* figures — snapshotting then records
  the revision as if it were the thing the committee objected to, and the diff
  below compares v(n) against itself. Guarded by version number so a second,
  additive remand doesn't freeze the same version twice.
- **`pdc-alerts` posts the diff**, not just the new offer: which years and
  figures moved between v(n−1) and v(n). Reviewing a resubmission without seeing
  what changed is the same work twice.
- **Ballots already cast are flagged, never voided.** A member who balloted
  before a revision sees *"this offer was revised after you voted"* with the
  diff, and is nudged to revisit. Silently discarding a member's considered
  judgment is worse than showing them it may be stale. Built as `revised_since`
  on each ballot in `GET /api/fa/players/{slug}/ballots` — derived server-side
  rather than in the dashboard, so the rule has one implementation. Re-saving a
  ballot clears its own flag and leaves everyone else's standing.
- **A remand cannot follow a finalize.** Once the head locks a player, the
  offers on them are closed; reopening the player (§ 4.1) is the escape hatch.
- **A returned offer is enumerable and visibly waiting**, like an open offer
  sheet: the dashboard lists it as *returned, awaiting the team* with an age, so
  a send-back can't quietly become the state something died in. Nothing expires
  it automatically.
- **The FFA window does not gate a remand.** The 24-hour clock governs *new*
  offers from other teams; a revision the committee itself asked for is part of
  its own review and may land after the window closes.

**Who may remand: any assigned sub-committee member** (plus the head and admin)
— decided. The committee reviews as a group, so any reviewer who wants a term
changed can ask for it without routing through the head. Two consequences the
build must handle rather than discover:

- **Remands are additive, not a queue of round-trips.** The first remand flips
  `status` to `returned`; a second member remanding the same offer appends
  another entry to `remands[]` and changes nothing else. The team sees **every
  outstanding note, attributed by member**, and answers them all in one
  resubmission. Without this, two members sending back the same offer would
  either fight over its status or make the team guess which note is live.
- **A conflicted remand is flagged like a conflicted ballot** (§ 4.6). A member
  whose own team is bidding on this player can still remand — the same
  warn-don't-block rule — but the entry carries their `conflict` team, since
  "send that rival's offer back" is exactly where the incentive bites.

**An outstanding remand warns at finalize; it never blocks** — decided,
consistent with treating the head as the clock everywhere else (§ 4.1, D11).
The finalize view lists every unanswered remand with its age, and the confirm
step names them. A team that goes quiet cannot stall a player indefinitely; a
head who locks early does so knowingly.

### 4.4 `fa-ballots.json` — the 1,000 balls

```jsonc
{
  "curry-stephen": {
    "r3": {
      "ballots": {
        "memberA": { "balls": { "f7c1a9b2": 500, "3d90ff11": 300,
                                "QO": 100, "NO_SIGNING": 100 },
                     "updated_at": "...", "note": "",
                     "conflict": "PHX" }   // member's own team has an offer in
      },
      "final": { "locked_at": "...", "locked_by": "facHead",
                 "totals": { "f7c1a9b2": 1400, "3d90ff11": 900, "QO": 700 },
                 "voters": ["memberA", "memberB", "memberC"],
                 "abstained": ["memberC"] }
    }
  }
}
```

**Ballot keys** are offer ids plus two synthetic options (decided):

| Key | Shown when | Means |
|---|---|---|
| `"QO"` | player is an RFA | The qualifying offer wins — player stays put on the QO |
| `"NO_SIGNING"` | always | No offer should be accepted; the player goes unsigned and stays a free agent |

`NO_SIGNING` exists for both UFAs and RFAs. Without it a member who thinks every
offer on the table is bad has no way to say so except by picking a least-bad
one, which silently converts "nobody should sign him" into a signing.

Other rules:

- A ballot must sum to **exactly 1,000** to be considered cast; anything else is
  rejected at write time with the running total in the error message.
- Ballots are freely revisable **until** the FAC head finalizes; after
  `final.locked_at`, every write to that (player, round) 409s. The lock is
  checked *before* the ball keys are validated — finalize archives the offers,
  so a late ballot would otherwise be refused as "not an option on this ballot",
  which is true and not the reason.
- **`admin` is not waved through the ballot endpoint**, unlike every other check
  in `auth.py`. A ballot is a vote, not an administrative action; there is no
  such thing as casting one you weren't assigned. The head's real powers over a
  ballot — assign, finalize, unlock — are separate endpoints, and admin passes
  those.
- `totals` is **stored, not recomputed on read** — it is the record of what was
  decided at that moment, and the offers it refers to are not guaranteed to
  still be the current picture.
- `conflict` is stamped when the member's own team (their active tenure team,
  via `proposals._member_current_team`) has a live offer on this player. It is a
  **warning, never a block** — see § 4.6.

### 4.5 Ballot visibility (decided)

Scoped **per player**, not globally:

| Viewer | Sees ballots for a player |
|---|---|
| Assigned sub-committee member | Every ballot on that player, including in progress, before finalize |
| `fac` member not assigned | Nothing — not the ballots, not the offers (§ 6.1) |
| `fac_head`, `admin` | Everything, every player |

So a sub-committee is transparent to itself and opaque to everyone outside it.
Ballots carry `updated_at`, so a member can tell a considered ballot from one
cast a minute ago in response to theirs.

### 4.6 Conflicts of interest — warn, don't block (decided)

The FAC head is expected to avoid assigning a member to a player their own team
is bidding on, but the site backstops it rather than trusting it:

- **At assignment:** the head's sub-committee picker flags any member whose team
  has a live offer on that player, inline, before they confirm.
- **On the ballot:** a conflicted member sees a banner naming their team's offer.
- **On the totals:** the finalize view marks conflicted ballots so the head can
  weigh them knowingly.

Nothing is refused. A one-team league member is not automatically compromised,
and hard-blocking would make some players unballotable in a league this size.

---

## 5. Legality

### 5.1 One validator, no second opinion

The submit path calls `_validate_sign(SignDetails(**offer), ctx)` — the same
function `POST /api/transactions` runs. The offer form's client-side check calls
`POST /api/validate/sign` on a debounce (250ms, as the transaction simulator
does) so the owner sees the verdict while typing, but **the client check is
advisory**; the server re-runs it at submit and that result is what's stored.

Blocking rule: an offer with any failing **error**-level check cannot be
submitted. Warnings may be submitted and are shown to the committee. There is no
`force` on this path, for the same reason `self_renounce` has none — an
owner-facing write must not be able to push past a rule.

### 5.2 Snapshot at submit, revalidate on view

Cap positions move during free agency; an offer that was legal on Monday may be
illegal by Wednesday because the team signed someone else. Both facts matter, so
both are kept:

- `validation` on the offer is **frozen at submit** (as with renounce's
  `_snapshot` — record state when the moment happens, don't reconstruct it).
- The dashboard's offer list revalidates live on read and shows a
  **"legal at submit · illegal now"** badge with the newly-failing checks when
  they differ. The FAC needs to know before allocating balls to a dead offer.

### 5.3 Pending offers do **not** hold cap room

Unlike a § 3.15 offer sheet, a submitted FA offer charges nothing. It is a
pitch, not an executed instrument, and the § 3.15 hold exists because that
transaction is binding.

This has a consequence to handle explicitly rather than ignore: nothing stops a
team submitting five max offers it could only fund once. So the dashboard shows,
per team, **the sum of that team's live offers against its room**, flagged when
overcommitted, and the owner's own form shows the same figure off the same
helper (§ 6.3). It is disclosed, not blocked (D6).

**"Overcommitted" means bidding more than you can fund, not being over the cap**
(built, Phase 7). The first cut tested `committed > room`, which flags every
team with negative room and *zero* offers out — true of most of the league, and
on the team's own form it opens by shouting at a team that hasn't bid on
anybody. The test is `committed > 0 and committed > max(room, 0)`: a team with
no room that bids anything at all is exposed by exactly that amount, and a team
that has bid nothing is exposed by nothing.

### 5.4 Sign-and-trade — earmarked, unsupported

`signing_method: "sign_and_trade"` appears in the form's method list, is
**disabled**, and carries the reason inline: *"S&T requires a companion trade
proposal and joint approval — not yet supported on the site (§ 3.14). Bring it
to the committee directly."* Shown-and-disabled, not hidden, exactly like the
ineligible entries in the roster ⋯-menu.

---

## 6. API surface

All under `/api/fa/`, new router `nbn-api/routers/free_agency.py`.

| Endpoint | Auth | Notes |
|---|---|---|
| `GET /api/fa/pool` | public | The derived FA pool (§ 7.1). No offers, no committee data |
| `GET /api/fa/board` | public | `mode`, open players, FFA deadlines. **No** contract details, offering teams, or offer counts |
| `GET /api/fa/state` | `fac`/`poext`/admin | Full state incl. sub-committee assignments |
| `PUT /api/fa/mode` | `fac_head` | `{mode}`; entering `ffa` is logged and announced (§ 9.3, 12.6) |
| `POST /api/fa/rounds` | `fac_head` | Opens a round; optionally closes the previous |
| `PUT /api/fa/players/{slug}` | `fac_head` | `{status, subcommittee[]}` |
| `GET /api/fa/offers` | scoped | Filters `player`, `team`, `status`. **Visibility § 6.1** |
| `POST /api/fa/offers` | **team role** | Creates a `draft`; 409 if this team already has a live offer on this player |
| `PATCH /api/fa/offers/{id}` | **team role**, while `draft` | Contract, pitch, promises |
| `PATCH /api/fa/offers/{id}` | **team role**, while `returned` | Revising a remanded offer — same editor, same gate (§ 4.3a) |
| `DELETE /api/fa/offers/{id}` | **team role**, while `draft` | Drafts only — a submitted offer is final (§ 4.3) |
| `POST /api/fa/offers/{id}/submit` | **team owner** | Validates, stores snapshot, notifies (§ 9). Also the resubmit path for a `returned` offer |
| `POST /api/fa/offers/{id}/remand` | assigned sub-committee member, `fac_head`, admin | Sends a submitted offer back for revision; **note required**; additive (§ 4.3a) |
| `GET /api/fa/commitment/{team}` | **team role** | § 5.3 exposure for the team's own form — the same helper the review page renders (§ 6.3) |
| `GET /api/fa/players/{slug}/review` | sub-committee, `fac_head`, admin | Offers side by side + per-team cap + projected lineups |
| `GET /api/fa/players/{slug}/ballots` | sub-committee, `fac_head`, admin | **All** ballots on that player, including in progress (§ 4.5) |
| `PUT /api/fa/players/{slug}/ballot` | assigned sub-committee member | Own ballot only; must total 1,000 |
| `POST /api/fa/players/{slug}/finalize` | `fac_head` | Locks ballots, writes `final.totals` |
| `POST /api/fa/players/{slug}/unlock` | `fac_head` | Escape hatch; appends to history |

### 6.0 Two gates on one object (decided)

Drafting and submitting are separated:

| Action | Gate | Server check |
|---|---|---|
| Create / edit / delete a **draft** | any holder of the team's role | `has_role(info, team.lower())` |
| **Submit** | the team's **owner** | `auth.is_team_owner(info, team)` |

A GM or coach can prepare the whole offer — contract, pitch, promises — and
cannot pull the trigger. This is the same two-tier split already drawn on team
pages between the trading block (team role) and renounce (owner tenure), so it
needs no new concept and no new helper.

The team is **derived from the draft's stored `team`**, never taken from the
request body, exactly as `self_renounce` derives it from the roster. A caller
cannot name a team to claim authority over it.

### 6.1 Offer visibility

| Viewer | Sees |
|---|---|
| Public | Nothing. Not even that an offer exists (FFA clock aside — § 9.2) |
| Team owner/front office | Their own team's offers, all statuses |
| `fac` **assigned to that player** | Every submitted offer for that player, in full — and every ballot on them (§ 4.5) |
| `fac` not assigned | The player is listed; neither offers nor ballots are readable |
| `fac_head`, `admin` | Everything |

Enforced server-side per request. The dashboard's grouping is a rendering of
what the endpoint already filtered, never a client-side hide.

### 6.2 Three read-side fields Phase 5 added

The dashboard needed three things the Phase 2 payloads didn't carry. All three
are **derivations of rules that already existed**, moved server-side rather than
reimplemented in page JS — the same reasoning as `revised_since` (§ 4.3a):

- `GET /api/fa/players/{slug}/review` → **`assignable`**: the sub-committee
  picker's roster (every `fac` member, their current team, and their
  `_conflict_team` on this player). § 4.6 wants a conflicted assignee flagged
  *before* the head confirms, and `PUT /api/fa/players/{slug}` only reported
  conflicts after the fact. Head-only; a plain reviewer gets `[]`.
- `GET /api/fa/players/{slug}/ballots` → **`your_conflict`**: the viewer's own
  conflict, from the same `_conflict_team` that stamps a cast ballot. The first
  cut of the dashboard guessed this from the member's team *roles*, which is
  simply the wrong rule — a conflict comes from an active tenure, and a GM
  holding no team role would have gone unwarned.
- `GET /api/fa/state` → **`balloted`** (the viewer's own, so it leaks nothing),
  **`finalized`**, and head-only **`ballots_cast`**. The queue sorts by urgency
  and badges what still wants the viewer's attention; *how many others* have
  voted is scoped to that player's sub-committee, so a member reads it from the
  ballots endpoint, which enforces that scope.

### 6.3 Two read-side changes Phase 7 needed

Both exist so the **team's** side of the pipeline can be built without page JS
re-deriving a rule the server already owns — the same reasoning as § 6.2:

- **`GET /api/fa/commitment/{team}`** — `_team_commitment` for one team,
  team-role gated (a GM drafting the offer needs the exposure in front of them,
  and it is the team's own position). § 8.1's form has to show the § 5.3 figure,
  and the only other way to get it would be for the page to do cap math, which
  is the one thing neither dashboard is allowed to do. One helper, one answer:
  the number on the owner's form and the number on the committee's review page
  cannot disagree.
- **`GET /api/fa/board` now lists every player in the pool**, accepting or not,
  instead of only the accepting ones plus those with a board entry. `reason` is
  the copy § 8.1 puts verbatim into the disabled ⋯-menu entry — with the closed
  players omitted, `/free-agency` would have had to compose those strings itself
  from `mode`, and the site would then explain the rule in two places. The pool
  is already public, so listing it with a status leaks nothing.

---

## 7. Deriving the FA pool

### 7.1 Move the rule server-side

`free-agency/index.html` currently derives the pool in page JS: earliest
actionable `cap_holds` entry, plus renounced (has salary history, no hold, not
rostered) and never-signed players. The API needs the identical rule, so the
board and the page can't disagree about who is a free agent.

Port it to `free_agency.py` as `_fa_pool(bios, team_map, season)` returning
`{slug: {class_year, hold_type, prior_salary, rfa: bool, qo_amount}}`, expose it
as `GET /api/fa/pool`, and **rewrite the page to consume it** rather than
keeping two copies. That rewrite is behaviour-preserving and can ship
independently (Phase 1).

### 7.2 RFA and the QO

The ballot needs a QO line for RFAs. § 3.15/§ 3.9 give the eligibility test
(<4 years experience + QO extended) and § 3.9 gives an amount formula that the
rulebook itself flags as *proposed, pending BOD confirmation*. So:

- `rfa` comes from the existing `_rfa_eligibility` helper.
- `qo_amount` is computed where the inputs exist and is otherwise `null`;
  the ballot shows the QO line either way, with the amount marked
  **estimated** when derived from the proposed formula.

---

## 8. UI

### 8.1 Owner side — `/free-agency`

**Built (Phase 7.)** A ⋯ menu per row, built exactly like
`makeRosterMoveActions`: the column is not pushed onto `COLS` at all unless the
viewer holds a team role, so a public page load renders the table it rendered
before Phase 7. Verified in a real browser — anonymous, 6 columns and zero ⋯
buttons; as a PHX owner, 7 columns and a ⋯ on every row, no console errors on
either.

Menu items, with the disabled-with-reason convention:

- **Offer a contract…** — enabled when the player accepts offers right now
  (mode + status + FFA clock). Disabled reasons: *"Free agency is closed."* /
  *"This player isn't open for offers in this round."* / *"The 24-hour FFA
  window on this player closed at 5:00 PM."*
- **Our draft offer…** — replaces the above once a draft exists for this team.
- **Committee asked for changes…** — replaces both when the offer is `returned`,
  badged so it's unmissable. The form opens with the committee's note pinned
  above the contract editor and the changed-from figures shown alongside the
  inputs, so the team can see exactly what it is answering.

Note the menu is available to **any** team-role holder, not only the owner — a
GM drafting an offer is the point of the § 6.0 split.

**Not one of those reason strings is composed in the page.** Each is
`board.players[slug].reason`, straight from the server's `_accepts_offers` —
which is why § 6.3 made the board list closed players too. The menu and the
submit path therefore cannot come to different conclusions about why a player
is unofferable, and rewording a rule is a one-file change.

A member holding more than one team role gets one entry per team, prefixed with
the abbreviation. Rare, but the alternative is silently picking one for them.

The form (a modal, same furniture as the renounce dialog):

1. **Contract** — year-by-year rows: season, salary, guaranteed toggle, option
   tag (PO/TO/NG), trailing UFA/RFA hold. Mirror the transaction simulator's
   editor rather than inventing one.
2. **Signing method** — Cap Space, Bird Rights (+ tier), MLE / NTMLE / TMLE,
   BAE, Room Exception, Minimum, S&T *(disabled, § 5.4)*.
3. **Pitch** — long-form text.
4. **Promises** — MPG (number), playoff promise (checkbox), role (select: Face
   of the Franchise / Starter / Role Player / Veteran / None).
5. **Live legality panel** — checks + fact sheet from `/api/validate/sign`, plus
   the team's committed-offers total (§ 5.3).
6. **Save draft** / **Submit**. Submit is disabled while any error-level check
   fails, with the failing check named on the button's tooltip. For a non-owner
   it is disabled with *"Only the team owner can submit this offer"* — shown,
   not hidden, so a GM can see the draft is ready and hand it off.
7. **Submit confirm** — a second step naming the player and total value, quoting
   § 3.14's wording: *once submitted to the committee, this offer cannot be
   withdrawn.*

Four things the build settled:

- **Submit always saves first.** `POST /api/fa/offers/{id}/submit` validates and
  freezes the *stored* offer, so the figures on screen have to be the stored
  ones before it is called. Create-or-PATCH then submit, through one function —
  otherwise a team could confirm one contract and submit another.
- **A submitted offer opens read-only rather than not opening.** Every input is
  disabled and the § 3.14 rule is stated at the top. Refusing to open it would
  leave a team unable to re-read what it committed to, which is the one thing
  finality makes it most important to be able to do.
- **A `returned` offer is exempt from the window check on the Submit button**,
  matching `submit_offer`'s own exemption (§ 4.3a) — the FFA clock governs new
  offers from other teams, not a revision the committee asked for. Verified: with
  every player closed for offers, the resubmit button's only complaint is the
  rule check, not the window.
- **The remand notes are pinned above the editor and the frozen figures sit
  beside the inputs** (`was $9M` / `new year` per year). A team answering
  "add a year, trim year 1" needs both asks and both baselines on screen; the
  round-trip is otherwise reconstructed from Discord.

### 8.2 Dashboard — FAC member view

**Built — Phase 5 for the read side, Phase 8 for the ballot.** `pdc/index.html`
is one self-contained page: a queue sorted by urgency, the player review view,
the head's board controls, the 1,000-ball widget and per-player finalize. Two
invariants the page holds and must keep holding:

- **No cap math in the dashboard.** Every dollar rendered comes off the fact
  sheet the API built with the helpers `_validate_sign` uses, so the page cannot
  show a team room the validator didn't credit it with — the same rule the
  simulator's fact sheet holds.
- **No client-side hiding.** What a viewer sees is what the endpoint returned. A
  `fac` member who opens a player they aren't assigned to gets the server's 403
  rendered as the § 4.5 explanation, not a filtered-down page.

- **Queue:** players I'm assigned to, sorted by urgency (FFA deadline first,
  then round close), each showing offer count and whether I've cast a ballot.
- **Player review page:** offers side by side in columns —
  team · contract shorthand (reuse `summarizeContract`'s grammar) · year-by-year
  table · signing method · legality badge · promises · pitch (collapsible).
- Beneath each offer column, that team's **projected lineup with the player
  inserted** (§ 8.4) and its cap position after the signing (straight from the
  stored/live `fact_sheet` — the dashboard does **no** cap math of its own; same
  invariant the simulator's fact sheet holds).
- **Version history** on any offer that was remanded: v1 → the committee's note
  → v2, with the figures that moved highlighted. A ballot cast before a revision
  carries the "revised after you voted" flag (§ 4.3a).
- **Ballot widget:** 1,000 balls — one slider *and* number per offer, plus the
  **QO** line for RFAs and a **No signing** line always. Live remainder; save
  disabled until it totals exactly 1,000, which is the same arithmetic the
  server rejects on, so the refusal is never a surprise. An **Even split**
  button divides 1,000 across the lines (remainder on the first) — a starting
  point, since hitting exactly 1,000 by hand across four lines is fiddly.

  Three things the build settled:

  - **The widget is gated on *assignment*, never on being the head.**
    `cast_ballot` is the one endpoint in the API that does not wave `admin`
    through, so gating the UI on `IS_HEAD` would have offered a vote the server
    refuses. A head who isn't on the sub-committee gets the totals, the
    finalize button, and a line saying why there is no ballot for them.
  - **Each line carries what it is voting on** — the offer's contract shorthand,
    plus *sent back* or *illegal now* where they apply. A member allocating
    balls should not have to scroll back up to the offer columns to remember
    which is which.
  - **The QO line states its own uncertainty** (§ 7.2, § 13.2): *"amount unknown
    — the QO isn't recorded anywhere in the API yet"*, or the figure marked
    estimated. It is on the ballot either way.
- **Other members' ballots** beside my own, live, with `updated_at` (§ 4.5). A
  member who hasn't cast yet shows as outstanding rather than as zeroes.
- **Conflict banner** when my own team has an offer on this player: *"PHX has an
  offer in for this player. You may still ballot; the head will see this
  flagged."* (§ 4.6.)
- After finalize: my locked ballot + the totals, read-only.

### 8.3 Dashboard — FAC head view

**Built — Phase 5 for the board controls, Phase 8 for finalize.** Everything
above, plus:

- **Mode control:** Closed / Rounds / FFA, with a confirm step on FFA
  ("every free agent becomes offerable immediately").
- **Round control:** open a round; per-player Open / Hold / Close toggles;
  sub-committee assignment (multi-select of `fac` members, **default empty** —
  no player is balloted until the head assigns one). The picker flags any member
  whose team has a live offer on that player, inline, before confirming (§ 4.6).
  Closing a round's players is manual and always has been (§ 4.1).
- **Send back for revision:** available to the head here and to **every
  assigned member** on the review page, with the required note (§ 4.3a). The
  offer then shows as *returned, awaiting the team* with an age — on this view,
  the member view, and the team's own page.
- **Per-player finalize:** a confirm step showing the running totals, each
  voter with their ball count and any conflict flag, the members who haven't
  voted (*"will be recorded as abstained"*), and every **unanswered remand with
  its age** — then lock. The remands warn and do not block (D15): a team that
  goes quiet cannot stall a player indefinitely, and a head who locks early
  does so knowingly, which is only true if the confirm names what they are
  locking over.

  The step also says what finalize *is not*: it archives the offers (freeing
  those teams to bid again in a later round) and records a decision — it signs
  nobody (§ 11.1). The locked panel repeats that, so a locked result never
  reads as though it executed itself. **Unlock** sits on that panel, reversing
  ballots and offers together.
- **Cross-player overview:** every open player, offer counts, ballots
  outstanding, deadlines.

### 8.4 Shared lineup helper

`computeStartingFive` (and `DEPTH_SLOTS`) are today buried in `teams/team.js`,
which injects an entire page into `document.body` on load — unusable from
another page. Extract both into `teams/lineup.js` as globals, have `team.js`
consume them, change nothing else. Behaviour-preserving, ships alone, and is
verifiable by diffing a rendered team page before/after.

**Built.** Loaded the same way `ratings-popup.js` is — injected from `team.js`
with a `lineupReady` promise the render awaits — **not** as a `<script>` tag in
the 30 team shells, which are 11-line files that deliberately load only
`team.js`. One difference from the popup: this is a hard dependency (the `depth`
branch of `buildRosterTable` calls it directly, and there is no meaningful
fallback), so its `onerror` logs before resolving instead of failing silent.
The only fields it reads are `_posList` and `OVR`, so the dashboard needs to
hand it objects with those two keys and nothing more. Verified as specified:
`--dump-dom` of PHX, BOS and LAL before/after differ by exactly the one added
`<script>` tag, with no console errors.

### 8.5 Role-aware instructions

**Built (Phase 8).** A collapsible "How this works" panel on the dashboard, a
plain `<details>` so it costs no JS, **collapsed by default** — a member who has
done this before shouldn't scroll past it, and one who hasn't shouldn't have to
be told where to look. Keyed off `GET /api/auth/me`:

| Viewer | Panel |
|---|---|
| `fac` only | How to read the comparison, what the 1,000 balls mean, that ballots stay editable until the head locks, that you can't see players you aren't assigned to |
| `fac_head` (and `admin`) | The above **plus** modes/rounds, assigning sub-committees, when to flip to FFA, what finalize does and how to unlock |
| `poext` only | PO-EXT stub copy — what's coming |
| Both | Both panels, sectioned |

---

## 9. Discord

**Built (Phase 6).** `routers/fa_notify.py`, with delivery lifted out of
`discord_notify.py` into `routers/discord_transport.py` — one paced queue, one
worker, shared. Two modules pacing themselves correctly and *still* collectively
exceeding Discord's rate limit is the failure a second transport would have
introduced. `DISCORD_TXN_CHANNEL`'s behaviour is unchanged; the burst cap moved
into the transport keyed **by channel**, so a runaway on one feed can't silence
the other, and each caller keeps its own sizing.

One thing the extraction added: `transport.send` accepts a *callable* payload,
built only after the gates pass. Transaction embeds load every player bio, and
under the old ordering the burst gate ran first — refusing a message must stay
cheap, or a runaway loop costs 2,000 bio loads on the way to being suppressed.

Same no-op-without-config rule: unset the channel env vars and the module does
nothing, so this ships before the channels are ready. The two are independent —
`DISCORD_PDC_CHANNEL` alone gives the committee its feed with the league still
hearing nothing, which is exactly the rollout order in § 10.

**Both are set as of 2026-08-09** (`nbn-api/.env`, read at import, confirmed in
the running process). So the public feed is armed too: the next time the head
puts the board in FFA mode, the first submitted offer on a player posts a clock
start to the whole league. Nothing else reaches `fa-news` — § 9.2's chokepoint
is unchanged — but that post is now real rather than pending an env var.

### 9.1 `pdc-alerts` (private, `1535633131346853959`)

Fires on **offer submitted**. Full detail — it's a private committee channel:
player, team, contract year-by-year, signing method, promises, pitch,
legality verdict with any failing/warning checks, link to the dashboard.
Also fires on: mode change, round opened, FFA clock started/expired, player
finalized (with totals), and **offer remanded / resubmitted** — the latter
carrying the committee's note and a diff of what actually changed between
versions (§ 4.3a). No withdrawal event exists (§ 4.3).

Three things the build settled:

- **The diff is against the version frozen at the remand**, so `submit_offer`
  captures it *before* incrementing `version` — capture it after and the
  announcement names the wrong version and compares the revision to itself
  (the § 4.3a trap, one layer up).
- **A resubmission that changed nothing says so explicitly.** Rendering an
  empty diff would read as a formatting failure, when it is the substantive
  fact that the remand went unanswered.
- **Legality shows the warnings, not just the verdict.** The submit path
  refuses an illegal offer outright and has no `force`, so a posted offer is
  legal by construction — the informative half is what passed *conditionally*.

### 9.2 `fa-news` (public, `1517304922847055994`)

Fires **only in FFA mode**, exactly twice per player (decided):

1. **Clock started** — on the offer that starts it:

   > 🕐 **Stephen Curry** has received an FFA offer. A 24-hour clock is now
   > running — other teams have until **Aug 9, 5:00 PM** to submit offers.

2. **Window closed** — at expiry:

   > 🔒 The 24-hour window on **Stephen Curry** has closed. No further offers
   > are being accepted; the FAC will review.

No team, no dollars, no offer count, in either. Both bodies are assembled from
`player` + `deadline` only, so there is no path for contract data to reach them.
**A test asserts each rendered payload contains no team abbreviation and no
`$`.** The FFA mode flip itself is not announced here (it goes to `pdc-alerts`)
— the clock posts are what the league actually needs to act on.

**The boundary is structural, not careful.** `_news(slug, text)` is the only
function in the module that can reach the public channel, and it takes a player
slug and a finished string — it cannot be handed an offer. Enforcing this by
signature rather than by convention is the point: a single leak here is the
league learning a rival's terms, and "we were careful at each call site" is not
a property a test can check. `tests/test_fa_notify.py` checks the rendered
output instead, so the guarantee survives however a message gets built.

The deadline renders as a Discord dynamic timestamp (`<t:…:f>`), not a fixed
clock time — a league spread across timezones acting on a 24-hour window is
exactly what a literal "5:00 PM" gets wrong.

### 9.3 Clock expiry

At expiry the player stops accepting offers (§ 4.1) and the dashboard lists them
as ready for ballots. **Nothing resolves itself** — no signing, no outcome, ever;
the closed post says so in as many words, because a post that reads like an
outcome is worse than no post.

Expiry is evaluated lazily (§ 4.1), so the post is emitted by whichever request
first observes the deadline has passed — `_sweep_ffa_expiry`, called from the
read endpoints the dashboards and the public FA page already hit. Three
properties it has to carry:

- **Once.** `ffa.closed_posted` is stamped **under the lock, before anything is
  sent**, so two simultaneous observers produce one post rather than two.
- **It doesn't reopen anybody.** The stamp is an announcement guard and nothing
  consults it — offerability is still `now >= deadline`. Losing the flag would
  re-announce, never reopen. `tests/test_fa_offers.py` pins that separation,
  since a write on a read path is exactly how the derived-expiry property
  (§ 4.1) would erode.
- **A stale window is stamped but not announced.** A closure older than the
  window it closes is a replay, not news — the case being deploying this module
  while clocks that expired weeks ago sit unflagged in `fa-state.json`.

---

## 10. Build plan — backend and orphans first

Each phase is independently shippable and, through Phase 4, **invisible to
anyone who isn't looking for it**. Every phase ends green on
`venv/bin/python -m tests.run_all` in `nbn-api/` (the suite is a hand-rolled
runner, not pytest — pytest isn't installed).

| Phase | Work | Who can see it |
|---|---|---|
| **0** ✅ | `VALID_ROLES` + `ROLE_IMPLIES` additions **and `NAMED_ROLES` in `members/index.html`** — without the latter an admin cannot grant the roles at all; then grant `fac_head` to the head, `fac` to members | Nobody (roles do nothing yet) |
| **1** ✅ | `_fa_pool` server-side + `GET /api/fa/pool`; rewrite `free-agency/index.html` to consume it | Nobody — page output unchanged |
| **2** ✅ | `free_agency.py`: state/offers/ballots storage, full endpoint set, validation wiring, tests. No UI anywhere | API only, role-gated |
| **3** ✅ | Extract `teams/lineup.js`; `team.js` consumes it | Nobody — identical render |
| **4** ✅ | Session cookie: `sessions.json`, `POST /api/auth/session` + `/logout`, `_resolve_session` accepted on `/api/fa/*` + `/api/auth/me`, `token-badge.js` mints it on load | Nobody — no behaviour changes on any existing page |
| **5** ✅ | Dashboard at **`nbn.today/pdc`**, unlinked from `nav.js`. Build and review the whole thing here | Anyone with the URL — and it shows only the forbidden screen without a role |
| **5b** ✅ | nginx `pdc.nbn.today` block (same docroot, `/` → `/pdc/index.html`, `/api/` proxy) + certbot | Committee |
| **6** ✅ | `discord_transport` + `fa_notify`, wired into every FA write path, shipped with both channels **unset**. Rollout is then two env vars, in order: `DISCORD_PDC_CHANNEL`, verify in the private channel, then `DISCORD_FA_NEWS_CHANNEL` | Nobody until an env var is set — then committee, then league |
| **7** ✅ | Team-facing ⋯ menu + offer form on `/free-agency`, gated on team role (draft) / owner tenure (submit), plus `GET /api/fa/commitment/{team}` and the board listing closed players (§ 6.3) | Team front offices |
| **8** ✅ | Ball allocation + finalize/unlock UI; role-aware instructions (§ 8.5) | Committee |

Rollback at every phase is deleting a role, unsetting an env var, removing one
`nav.js` line, or — for 5b — unlinking `sites-enabled/pdc.nbn.today` and
reloading nginx, which leaves `nbn.today/pdc` working exactly as before.
Nothing before Phase 7 changes what a logged-out visitor sees.

**Ordering note:** Phase 7 (owners can submit) must not precede Phase 6's
private channel and Phase 8's review tooling, or the first real offer lands
somewhere nobody is looking.

**Where that note stands now that all eight are built.** Phase 7 shipped ahead
of Phase 8 and Phase 8 followed the same day, so the ordering held in the only
sense that mattered: no owner could submit before the committee could review,
because `mode` was `closed` throughout. It still is. **The head flipping the
mode is the real switch**, and everything the note was protecting — a private
channel to announce into, and tooling to review and vote with — now exists.

---

## 11. Deliberate non-goals

1. **No bridge from allocations to a real signing.** The FAC decides from the
   totals and enters the signing on `/transactions` by hand, as today.
2. **Roadmap (designed for, not built):** a "Sign this offer" button on a
   finalized player that POSTs `offer` verbatim to `/api/transactions`. The
   § 4.2 invariant is what makes this ~30 lines later. Do not add fields to
   `offer` that `SignDetails` doesn't accept.
3. **Sign-and-trade** — needs the trade pipeline first (§ 5.4).
4. **PO-EXT** — dashboard shell and roles only.
5. **No auto-resolution on any timer**, ever.

---

## 12. Decisions taken

Settled 2026-08-08. Each links to the section that implements it.

| # | Question | Decision |
|---|---|---|
| D1 | Auth across the subdomain | Opaque session cookie on `.nbn.today`, minted by `token-badge.js`; honoured for `/api/fa/*` and `/api/auth/me` **only** (§ 3.3) |
| D2 | Who may offer | Any team-role holder drafts; **owner** submits (§ 6.0) |
| D3 | FFA clock at expiry | Closes the offer window; lazily evaluated; nothing auto-resolves (§ 4.1) |
| D4 | Post-submission changes | None **at the team's initiative** — but the committee may remand an offer for revision (§ 4.3, § 4.3a) |
| D14 | Who may remand | Any **assigned sub-committee member**, plus head/admin; remands are additive and attributed (§ 4.3a) |
| D15 | Remand vs finalize | Warns, never blocks — unanswered remands listed on the finalize view (§ 4.3a) |
| D5 | Competing offers, same team + player | Not allowed — 409 (§ 4.2) |
| D6 | Offers across players exceeding room | Allowed; disclosed on the dashboard and the form, never blocked (§ 5.3) |
| D7 | Ballot options | Offers + `QO` (RFAs) + `NO_SIGNING` (always) (§ 4.4) |
| D8 | Ballot visibility | Transparent inside a player's sub-committee, opaque outside it; head/admin see all (§ 4.5) |
| D9 | Sub-committee default | Empty — the head assigns, nothing is balloted by default (§ 8.3) |
| D10 | Conflicts of interest | Site warns at assignment, on the ballot, and at finalize; never blocks (§ 4.6) |
| D11 | Round mechanics | No enforced round clock; head opens and closes by hand. The FFA 24h window is the only clock the software enforces (§ 4.1) |
| D12 | Leadership | No PDC-head role — `fac_head` and `poext_head` are peers; `admin` is above both (§ 2) |
| D13 | `bod` and `fac` | `bod` does **not** imply `fac` (§ 2) |

## 13. Open items

Nothing blocking, and no design questions left.

1. ~~**"Live" offer scoping across rounds** (§ 4.2)~~ — **settled in Phase 2.**
   Finalize archives; a reopen does not. See § 4.2 for why the two differ.
2. **QO amount** (§ 7.2) — the § 3.9 formula is marked *proposed, pending BOD
   confirmation* in the rulebook itself. The ballot shows the QO line either
   way, labelling the figure **estimated** when it comes from that formula.

   Wider than this spec: **the QO doesn't exist in the API at all** — no
   transaction type records that one was extended, and no QO figure is stored
   anywhere, so RFA status is a hand-set `cap_holds` value and § 3.9's
   "or the qualifying offer amount" ceiling branch can't be evaluated. That
   already affects § 3.15 offer sheets, not just this ballot. Tracked as a
   [P1] in `BACKLOG.md` § 2; this spec does **not** depend on it landing first.
