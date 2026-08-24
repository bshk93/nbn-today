# Discord integrations — the four feeds and the anti-dump gates

Detail split out of `CLAUDE.md` on 2026-08-24. Every path between the API and
Discord lives here. The load-bearing requirement across all of them is
negative — **no channel may ever receive a dump** — so read the gates before
adding a caller.

## Discord transaction notifications

`routers/discord_notify.py` posts an embed to Discord for every **live**
transaction, using the existing `DISCORD_BOT_TOKEN` (same channel-post endpoint
as `misc._notify_join_discord`). Set `DISCORD_TXN_CHANNEL` in `.env` to the target
channel id; **unset, the module is a complete no-op**, so it is safe to deploy
before the channel exists.

**Delivery lives in `routers/discord_transport.py`**, shared with `fa_notify`
(below). One paced queue and one worker process-wide: two modules each pacing
themselves correctly would still collectively exceed Discord's rate limit. The
burst cap is keyed **by channel**, so a runaway on one feed can't silence
another, and each module sizes its own. `transport.send` takes a callable
payload built only *after* the gates pass — a transaction embed loads every
player bio, and refusing a message has to stay cheap.

The load-bearing requirement is negative — *the channel must never receive a
dump*. 1,935 of the ledger's 2,241 entries are backfill, so any path that iterates
it and notifies would fire ~2,000 messages and rate-limit the bot. Three
independent gates enforce that; all three must be defeated at once for a flood:

1. **Call-site opt-in.** Only the two live submit paths (`POST /api/transactions`,
   `POST /api/self/renounce`) call `notify_transaction`. `_append_transaction` is
   deliberately *not* the hook — it's also the append path for `_append_historical`.
   There is no startup, replay, migration, or scheduled hook that notifies.
2. **Freshness.** A transaction whose `created_at` is older than `MAX_AGE_SECONDS`
   (300s) is never announced. This makes replaying old entries structurally silent
   regardless of caller intent.
3. **Burst cap.** `MAX_BURST` (250) messages per `BURST_WINDOW` (900s), plus a
   `MAX_QUEUE` (400) backlog ceiling. A runaway loop posts 250 and then goes quiet
   with a log line.

**Sizing gate 3 is measured, not guessed** — get this wrong in either direction and
you either spam the channel or silently lose a busy day. From the real ledger:
busiest single day **52** live transactions (2026-06-21), tightest actual 10-minute
burst **19**. Draft day is expected to beat both (~30 pick signings plus trades,
50+). An earlier 20/300s setting would have clipped that real 19-transaction burst.
`tests/test_discord_notify.py` pins those figures, so if league activity outgrows
them a test fails rather than messages quietly going missing.

**Delivery is a paced queue, not a thread per message.** Discord rate-limits channel
messages at roughly 5 per 5 seconds; firing a draft day's worth concurrently would
429 most of them, and a dropped announcement is worse than a late one. A single
daemon worker drains `_queue` at `SEND_INTERVAL` (1.25s, ~4 per 5s) and honours the
`retry_after` Discord returns, retrying up to `MAX_RETRIES`. A 4xx that isn't a rate
limit (bad channel id, bot not in the guild, missing Send Messages) fails fast — it
won't fix itself. A draft day drains in about two minutes.

`tests/test_discord_notify.py` proves each gate independently — including that
replaying all 2,241 entries sends zero messages, and that a 429'd message is
delivered rather than dropped.

**Contract shorthand mirrors `teams/team.js`'s `summarizeContract`** — `2+1 PO`,
`1 NG+1 TO`, tags PO/TO/NG. Divergent shorthand for the same deal is worse than
none, so `_contract_str` reimplements that function's rules, including treating a
trailing UFA/RFA line as the hold the deal *rolls into* rather than a contract year
(counting it would inflate the total on every deal that has one). Contract-carrying
types also get a `Year by year` field: a code block of per-season figures with
option/non-guaranteed years labelled.

**Offer sheets name the destination, never an arrow.** `details.teams` is stored
`[offering, retaining]`; joining them with `→` stated the opposite of what happened
on a non-match, where the player leaves for the *offering* team. `_headline_team`
resolves whoever actually ends up with the player, and the roles are labelled
("CLE offering · SAC incumbent") rather than implied by ordering.

Enqueueing happens outside the API lock, after the roster write and ledger append
are already committed: Discord being down must never delay or fail a transaction.
Forced transactions (`force: true` overriding a failed check) are posted with the
overridden check names and a distinct colour — the override is already in the ledger
as `_forced_checks`, this just surfaces it. Owner self-serve moves are marked in the
footer via `details._source`.

## PDC free-agency Discord feeds

`routers/fa_notify.py` (spec: `docs/pdc-free-agency-spec.md` § 9) posts the FA
pipeline's events to two channels with deliberately different appetites:

| Channel | Env var | Gets |
|---|---|---|
| `pdc-alerts` (private) | `DISCORD_PDC_CHANNEL` | Everything: offer submitted/resubmitted with a **diff vs the version frozen at the remand**, remands with their note and conflict flag, voids/restores with the head's reason and the terms removed, mode changes, rounds, clock start/expiry, finalize totals |
| `fa-news` (public) | `DISCORD_FA_NEWS_CHANNEL` | **FFA mode only**, and only clock events: clock started, window closed, and window extended/reopened by the head |

Each is inert without its own env var, which is how it rolled out (module, then
private channel, then public last).

**No team abbreviation and no `$` may ever reach `fa-news`** — that a team is
bidding is committee information. This is enforced by signature, not by care:
`_news(slug, text)` is the only function that can reach the public channel and
it cannot be handed an offer. `tests/test_fa_notify.py` asserts it against
rendered output.

**How long an FFA window runs is the head's setting** (`PUT /api/fa/ffa-window`,
default 24h, 1–168), not a constant and not a rulebook rule. It is read in exactly
one place — `_start_ffa_clock`, which stamps `deadline` *and* `window_hours` onto
the player's clock — so a change applies to clocks started from then on and to
nothing already running: it can't move a deadline a team is bidding against, and
shortening it can't retroactively close an open window. Every string naming a
length (the § 8.1 refusal, both § 9.2 posts, the dashboard) goes through
`ffa_window_label` on *that clock's* stamp, never the current setting. Don't add a
reader of the setting anywhere else.

**One named exception, and only one: `POST /api/fa/players/{slug}/ffa-extend`**
(head-only, required reason). It moves *one* player's deadline — the thing the
setting may never do — and is safe for the reasons the setting isn't: one player,
by a named actor, with a reason, announced on both channels before anyone can act
on it. It works on a lapsed clock as well as a live one (extending from
`max(now, deadline)`), recomputes `window_hours` so `ffa_window_label` keeps
describing the window that actually ran, and clears `closed_posted` so a revived
window's second expiry is still announced. `_start_ffa_clock` is untouched and
still reads the setting exactly once.

**Extending is not reopening, and confusing the two loses a round of votes.**
`PUT /api/fa/players/{slug}` with `status: "open"` clears `ffa` and mints a fresh
`round_id` — a deliberate *second* window, with ballots already cast left in the
old bucket. `ffa-extend` keeps `round_id`, the offers and the ballots, and only
buys time. Both are on the player view's "FAC Head controls" (`windowControls` /
`extendModal` in `pdc/index.html`), and the Open button confirms what it will
discard when a clock exists.

Expiry has no scheduler (§ 4.1) — `free_agency._sweep_ffa_expiry` announces from
whichever read request first observes a deadline has passed, stamping
`ffa.closed_posted` under the lock *before* sending so simultaneous observers
produce one post. Nothing consults that stamp for offerability, so it can't
reopen a player; and a window that expired more than a day ago is stamped but
never announced.

## The #roster-log mirror

`routers/roster_log_relay.py` is the one place the API **reads** Discord. It
polls `#fa-news`, `#transactions`, `#waivers` and `#roster-log-nbn-today` every
60s and reposts new **parent** messages into `#roster-log`
(`DISCORD_ROSTER_LOG_CHANNEL`) verbatim, replacing the hand-copying that fed that
channel. Bot posts are relayed per source: skipped on `#fa-news` (our FFA clock
posts aren't sheet changes; the humans there post the signings, renounces, team
options and guarantees, and all of those go through untouched), relayed on
`#roster-log-nbn-today`, whose embeds are collapsed to text. Each entry lands as a
bare card (description + colour, no title or source label) purely so consecutive
entries have an edge. The same event arriving from two sources is relayed twice on
purpose.

It relays, it never interprets — no summarizing and no deciding whether a message
"is" a transaction, because a human enters what the line says. Full rules, the
four anti-dump gates, and the admin endpoints for carrying an older message
across (`GET/POST /api/roster-log/*`) are in `nbn-api/CLAUDE.md`.

**Per-transaction opt-out.** The office form at `/transactions` has a "Also post
to #roster-log" checkbox, **off by default** — most transactions are typed into
#roster-log by hand as part of working them, so mirroring by default would
double every one up. Checking it sends `relay_to_roster_log: true` on
`POST /api/transactions`; `discord_notify` stamps the decision into that
transaction's embed footer rather than storing it anywhere the relay would have
to look up separately, and the relay's `_opted_out` reads it back off the same
message it's already relaying.

## Tradeblock Discord notifications

`/tradeblock`'s edit panel has an "Also post to Discord" checkbox, **off by
default**, next to Save. Checked, it sends `notify_discord: true` on
`PUT /api/trading-block/{team}`; `roster_picks.put_trading_block` diffs the
save against the block as it was before writing, and — only if something
actually changed — `routers/tradeblock_notify.py` posts a plain-text line to
`DISCORD_TRADEBLOCK_CHANNEL`: `**{member}** ({TEAM}) added X, Y to the
tradeblock and removed Z.` Players and picks share one added/removed list;
a pick reads `2027 1st` for the team's own or `2028 2nd (NYK)` for one it
acquired.

**This is for manual edits only, and there is no separate flag that makes
that true — it falls out of who calls the notify function.** A player also
comes off the block automatically when they're traded away
(`_scrub_trading_block`, called from `transactions.py`'s apply paths), and
that path never touches `tradeblock_notify` — only the `/tradeblock` save
button does, and only when the box is checked. Extending notification to any
other write path (the roster-page ⋯ menu's scoped `PUT`/`DELETE
/api/trading-block/{team}/player/{slug}`, say) means adding a call there
deliberately, not toggling a shared setting.
