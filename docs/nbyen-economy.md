# The NB¥ economy — a proposal

**Status: draft, under discussion. Nothing here is implemented.** Written
2026-09-05 against the pre-reset economy. Balances are being wiped and the
economy restarted, so every number below is a proposal for the *new* economy,
not a description of the current one. The current-state figures in § 1 are
evidence for why the reset is happening.

Once this is agreed, the implementation lands as backlog items and this file
becomes the record of *why* the numbers are what they are — the thing that stops
a future session from "helpfully" raising a faucet.

---

## 1. Where the economy stands today

Measured 2026-09-05 from `bets-ledger.json` (1,536 entries) and
`member-balances.json` in NBS_DATA_DIR.

| | |
|---|---|
| Outstanding | **165,538 NB¥** across 59 members (median 2,250) |
| Gross minted | ~174,200 |
| Gross **burned** | **8,100** — four cosmetic changes, one avatar, one theme, one revert |

**Sink ratio: 4.7%.** That single number is the whole diagnosis. Everything else
is downstream of an economy that has faucets and essentially no drains.

Where the money came from:

| Source | Minted | Share |
|---|---|---|
| Achievements | 101,000 | 58% |
| Bet payouts | 18,198 | 10% |
| Perry | 14,500 | 8% |
| Trivia | 12,243 | 7% |
| Bio fills | 5,710 | 3% |
| Admin adjust | 5,000 | 3% |
| Poeltl, Poo Poo cleanup, box scores, invest | ~10,400 | 6% |

Where it went: seven transactions, ever.

### The four structural defects

These are the reasons a reset alone would not fix anything — reset the balances
without changing the mechanisms and the same distribution reappears in a
quarter.

**1. Achievements are a tenure airdrop.** 44 achievements × (250 bronze / 500
silver / 1000 gold) is up to 77,000 NB¥ per member. The mass drops were
`Wheeler Dealer`, `Polyamorous`, `Blank Check` and `Seasoned GM` — trade counts
and roster-churn totals that accrue automatically to anyone who has been in the
league a while. Nearly all 59 members received both Wheeler Dealer and
Polyamorous on the same two days in July 2026. These are trophies for existing.

**2. Trivia is an unmetered printer.** `nbn-api/routers/misc.py`'s
`post_trivia_answer` takes `streak` from the request body and never verifies an
answer or tracks a session server-side. `POST {"streak": 10}` in a loop pays 512
NB¥ per call, without limit. The ledger's `Trivia streak 11` through
`Trivia streak 30` rows are the fingerprint of a client that simply kept
counting past the point the server stopped checking.

**3. Invest is a self-pump loop.** `nbn-api/routers/invest.py` has no
transaction fee, no position cap and no cooldown, and a member's own buy moves
the price they will sell into: `sentiment_delta` is `±nbyen / SENTIMENT_DIVISOR`
with `SENTIMENT_DIVISOR = 50_000` and `SENTIMENT_CAP = 0.50`, applied as
`market_price = algo_price × (1 + sentiment)`. Buy 25,000 NB¥ of one team,
sentiment goes to +50%, sell into the price you just made. The ORL line in the
ledger (−18,533 in, +1,521 out) is someone standing at that door.

**4. Fixed-odds bets are house-funded.** Pool bets are correctly zero-sum —
`close_bet` divides the whole pool among the winners and nothing is created.
Fixed-odds settlement pays each winner their `potential_payout` out of nothing
and merely *records* the gap as `net_shortfall`. Whoever writes the odds sets
the size of the mint, with no vig and no cap on exposure. That is the +18,198
payouts against −15,115 wagered.

---

## 2. The peg: 1,000 NB¥ = $1.00 net to the league

Every mint traces back to a dollar the league actually received.

The important consequence, and the reason this is the first rule rather than one
of many: **once the mint is pegged, supply growth stops being a problem.** A
pegged currency does not inflate — a growing total just means members have
savings. What has to be prevented is *unpegged* minting, which is exactly what
all four defects above are. This reframes the whole design: the goal is not to
keep the total small, it is to keep the unpegged fraction small and bounded.

The peg is stated in **dollars the league receives**, not dollars the member
spends. That is what makes the direct-donation incentive fall out for free
rather than being a fudge factor.

| Path | Member pays | League nets | NB¥ | NB¥ per member-$ |
|---|---|---|---|---|
| Prime sub | $0 | $2.25 | **2,250**/mo | — (free to give) |
| Tier 1 | $5.99 | $3.00 | **3,000**/mo | 501 |
| Tier 2 | $11.99 | $6.00 | **6,000**/mo | 500 |
| Tier 3 | $24.99 | $12.59 | **12,500**/mo | 500 |
| Bits (per 100) | ~$1.40 | $1.00 | **1,000** | 714 |
| Direct donation | $X | ~$X | **1,000 × X** | **1,000** |

Twitch keeps roughly half of a subscription, so a direct donation pays almost
exactly **2× per member-dollar**. That is the intended incentive and it is not
an arbitrary bonus — it is the honest exchange rate.

Tier 3 is rounded from 12,590 down to 12,500. Round numbers are worth more than
the 90 NB¥.

### Subscriptions must not be strictly dominated

A pure "direct pays double" rule makes subscribing the wrong choice for a member
who only cares about NB¥, which is bad: recurring revenue is worth more to the
league than a one-off of the same size, and Twitch sub count is itself a growth
lever (emotes, channel standing, discoverability). Subs get a loyalty multiplier
that direct donations cannot earn:

| Consecutive months subbed | Multiplier | Tier 1 pays |
|---|---|---|
| 1–2 | ×1.0 | 3,000 |
| 3–5 | ×1.15 | 3,450 |
| 6–11 | ×1.3 | 3,900 |
| 12+ | ×1.5 | **4,500** (750 per member-$) |

Direct still wins on rate; subs win on cumulative total, on the badge, and on
never having to remember to do it again. The multiplier rewards retention, which
is the behaviour actually worth paying for.

**Prime is free money and the site should say so permanently.** A Prime
subscription costs the member nothing they aren't already paying Amazon and
hands the league $2.25/month. Any member with Prime who isn't subbed is the
cheapest available win. This belongs as a standing line on `/members`, not a
one-off Discord announcement.

### Anti-abuse on the pegged side

- **Gifted subs pay the gifter in full and the recipient zero.** The gifter paid;
  they get the NB¥. Paying the recipient too makes gifting yourself through alt
  accounts a laundry. The gift is still announced publicly — the social credit is
  the recipient-side reward.
- **Chargebacks and cancelled subs claw back.** A refunded dollar is not a dollar
  the league received.
- **Only subs to the league's own channel count.**
- **Twitch identity links to the member record**, the same way Discord already
  does via `/link`. Without this there is no way to credit a sub to a balance.

---

## 3. One shared free-earning cap

**`NBY_FREE_MONTHLY_CAP = 2,500` NB¥ per member per calendar month.** Every
unpegged faucet debits one shared allowance. When it is exhausted the dailies
still run, still track streaks, and still post to leaderboards — they just pay
zero.

This is the most important rule in the document after the peg, and it is worth
more than tuning any individual faucet, because **it bounds faucets that haven't
been found yet**. The trivia hole in § 1 becomes a 2,500/month bug instead of an
unbounded one. Every future minigame is safe by construction on the day it
ships, before anyone has thought hard about its reward curve.

2,500 is set deliberately just above a Prime sub (2,250). That is the target for
the *eventual* steady state, once the minigames are back: a maximally engaged
member who pays nothing earns roughly what a *free* Prime sub would have given
the league. Participation stays real, paying is still better, and the ceiling is
low enough that the free side cannot dominate the pegged side. At launch, with
the games suspended, real free earning will land well below the cap — see below.

This is the complete free-earning list — every unpegged way to get NB¥. Anything
not on it pays nothing.

| Faucet | Today | Proposed | Counts against cap | Note |
|---|---|---|---|---|
| Box score submission | 200 | **300** | ✅ | real labour, self-limiting, and only 13 have ever been submitted — this one is *underused*, not over-rewarded |
| Bio field fill | 10/field | 10 | ✅ | self-limiting, the fields run out |
| Poo Poo cleanup | 25 / 50 / 100 | unchanged | ✅ | admin-reviewed and self-limiting |
| Achievement — competitive | 250 / 500 / 1000 | unchanged | ❌ exempt | championships, Finals, FOTY/COTY, Juggernaut, Cinderella, Dynasty, MVP Maker, Star Factory — see below |
| Achievement — contribution | 250 / 500 / 1000 | unchanged | ❌ exempt | Archivist only |
| Achievement — tenure/volume | 250 / 500 / 1000 | **0 — badge only** | — | Wheeler Dealer, Polyamorous, Blank Check, Seasoned GM, Win Machine, Mr. Consistent |
| Achievement — betting/investing | already excluded | **0** | — | paying for gambling volume pays people to churn |
| Signup balance (`NBY_START`) | 1,000 | **500** | ❌ one-time | under the peg a signup bonus is a real dollar; 59 members is $59 |
| Poeltl daily solve | 50 | **0 — suspended** | ✅ when back | see below |
| Perry daily top 3 | 100 / 50 / 25 | **0 — suspended** | ✅ when back | see below |
| Trivia | `2^(n-1)` → 512, client-declared | **0 — suspended** | ✅ when back | see below |

### The minigames pay nothing at launch

**Decided 2026-09-05.** Poeltl, Perry and Trivia award no NB¥ on the reset. The
games keep running — streaks, leaderboards, Discord results, all of it unchanged.
They simply stop minting.

This is a suspension, not a deletion, and the reintroduction is meant to be
deliberate. The reasoning: the games were 30,000 NB¥ of the old mint (Perry
14,500, Trivia 12,243, Poeltl 3,200) and only one of the three could survive
contact with a determined member — Trivia's reward was never verified
server-side at all. Rather than ship three reward curves nobody has confidence in
alongside a brand-new peg, launch with the peg and the contribution faucets only,
watch what the real distribution looks like, and add the games back one at a time
with numbers derived from that.

What has to be true before a game pays again:

- **Its reward is computed server-side from state the server owns.** Trivia fails
  this today (§ 5) and must be fixed before it is reconsidered, not as part of
  reconsidering it.
- **Its maximum monthly yield is known**, not emergent. Poeltl is trivially
  bounded (one puzzle a day). Perry is bounded by the podium. Trivia, as built,
  is unbounded.
- **It debits the shared monthly cap below**, so its yield composes with every
  other faucet rather than stacking on top.

### The cap stays even with the games off

With the minigames suspended, the 2,500/month allowance is not binding for most
members — the contribution faucets are self-limiting and a typical member will
not come close. It is kept anyway, and stated now rather than added later, for
two reasons: it is the precondition above that lets a game be switched back on
without redesigning anything around it, and a cap introduced *after* members have
grown used to uncapped earning reads as a takeaway in a way that a cap present
from day one does not.

### Achievements: keep the scale, change what qualifies

Achievements are one-time and non-repeatable, so they are not a faucet risk in
the way a daily is. That is why the table above marks them **exempt from the
monthly cap** — a member who finally wins a title in a month they've already
capped should still get paid, and the alternative is a confusing silent zero.

The scale (250 bronze / 500 silver / 1000 gold) is unchanged. What changes is
which achievements pay at all, and the line is between *results* and *tenure*.
Wheeler Dealer, Polyamorous, Blank Check and the rest accrue automatically to
anyone who sticks around — they are the bulk of the old 101,000, and a badge is
the right reward for them. Winning a title is not something you accrue.

The retroactive burst will not re-fire on its own: `build/achievement-notify.js`
seeds its snapshot silently on the first run, so deleting
`$NBS_DATA_DIR/achievement-state.json` at reset costs nothing and grants nothing.

---

## 4. Sinks

Three sinks exist today and two of them are one-time-per-member. This section is
the actual work of the redesign.

**Hard constraint: NB¥ never buys competitive advantage.** Not roster moves, not
cap relief, not draft position, not queue priority, not information other teams
don't have. Everything below is broadcast, cosmetic, or flavour. A league where
donations buy wins is a worse league than one with no currency at all, and this
line is much easier to hold from the start than to walk back later.

The anchor is the one price that has actually been tested on real members:
**a stream game was $10, so it is 10,000 NB¥.**

This is the complete spend list — every way NB¥ leaves a member's balance.

| Sink | Price | Recurring |
|---|---|---|
| **Broadcast** | | |
| **Stream a game** | **10,000** | ✅ flagship — flat price, first come first serve |
| Pick a playoff game to be streamed | 25,000 | seasonal |
| Alt uniform / court for your streamed games | 10,000/season | seasonal |
| **Commissions** | | |
| NBNTV hype segment for your team | 15,000 | ✅ |
| Trade Retro on a trade you name | 5,000 | ✅ |
| Sponsor a power-rankings blurb (byline credit) | 3,000 | ✅ |
| Name a Poeltl puzzle day, or a league award | 25,000 | rare |
| **Cosmetics** | | |
| Team theme unlock | 5,000 (unchanged) | per theme |
| Custom avatar | 5,000 first, 2,500 per change after | ✅ |
| Name colour / status text | 500 per change (unchanged) | ✅ |
| Profile banner | 1,500 | ✅ |
| Sitewide custom flair/title beside your name | 2,000/season | ✅ |
| Custom Discord role colour | 3,000/season | ✅ |
| **Gameplay** | | |
| Poeltl / Perry mulligan | 250 | ✅ daily |
| **Rakes** (burned, not paid to anyone — see below) | | |
| Pool bet rake | 5% of the pool | ✅ |
| Tip burn | 5% on amounts over 1,000 | ✅ |
| Invest transaction fee | 1% on buy **and** on sell | ✅ |

### Stream games: flat price, first come first serve

**Decided 2026-09-05.** A slot is 10,000 NB¥ and goes to whoever claims it
first. No auction, no bidding, no contested-slot mechanism.

The reasoning is that there is no demand data to price against — nobody has
bought a stream this year and the season hasn't started. An auction is a better
*price-discovery* mechanism precisely when you don't know the price, but it is
also much more machinery, it is unpleasant to lose repeatedly, and it structurally
favours whoever has the largest balance. First come first serve is legible,
cheap to build, and rewards paying attention rather than hoarding.

Two things this decision needs, which the auction would have handled implicitly:

- **A per-team purchase cap.** With a flat price and no cap, one member with a
  large balance can buy the entire slate. Proposed: **two games per team per
  month**, which at 10,000 each is 20,000 NB¥/month — well beyond what the free
  side can produce and comfortably within reach of a Tier 2 subscriber who saves.
  This is the guardrail that makes FCFS safe; without it the flagship sink becomes
  one member's private broadcast schedule.
- **Revisit the price after the first month of real demand.** If every slot is
  claimed within minutes of opening, 10,000 is too cheap and the sink isn't
  draining what it should. If nothing sells by mid-season, it's too expensive.
  Either way the number should be re-derived from behaviour, not defended because
  it's written here. The $10 anchor is a starting point, not a finding.

### Turn the transfer systems into sinks

Betting, tipping and investing currently move NB¥ between members without
destroying any. The three rakes at the bottom of the table above are why they
belong on a spend list at all — the rake is burned, not paid to a house account,
so each one is a genuine drain rather than a transfer. Why each number:

- **Pool bets, 5% of the pool.** Pool betting is currently exactly zero-sum. A
  rake makes it a net drain, which is the correct shape for a gambling system
  inside a currency you are trying to keep scarce.
- **Tips, 5% over 1,000 NB¥.** The threshold keeps small tips frictionless —
  tipping is a social feature first — while discouraging the consolidation of
  balances into one account.
- **Invest, 1% each way.** Necessary but nowhere near sufficient: see § 5, where
  a 50% self-pump clears a 1% fee without noticing it.

---

## 5. Remove or fix before reopening

| | Verdict |
|---|---|
| **Fixed-odds bets** | **Remove.** An unbacked mint whose size is set by whoever writes the odds. If they're kept for flavour, require the book to sum to ≥105% implied probability so the house has a vig, and cap total exposure per bet. |
| **Trivia streak endpoint** | **Fix before it ever pays again.** `post_trivia_answer` trusts a client-supplied `streak` and verifies no answer. Suspending the reward (§ 3) closes the hole for now — but the fix is the precondition for reintroducing the game, not part of the work of reintroducing it. The server has to own the session. |
| **Invest** | **Fix all four holes or leave it closed.** Transaction fee, position cap, settlement delay (no selling until N further games have been played), and — most important — **sentiment must exclude the trader's own trades**. Right now a member moves the price they are about to trade against. The fee alone does not close this; a 50% pump clears a 1% fee comfortably. |
| **Tenure achievement payouts** | **Remove the NB¥**, keep the badge (§ 3). |
| **`POST /api/bets/admin/adjust`** | **Keep** — it is the achievement job's only channel — but require a structured reason category rather than free text. Every achievement mint currently lands in the ledger as `Admin adjustment: …` and is indistinguishable from a manual grant, which is why § 1's numbers took a parser to recover. |

---

## 6. Does it balance?

Assuming eight subscribers (3 Prime, 4 Tier 1, 1 Tier 2) and ~$20/month in
direct donations:

| | NB¥/month |
|---|---|
| Pegged mint (subs + donations) | ~44,750 (= $44.75 real) |
| Minigames | **0** — suspended |
| Contributions (bio, cleanup, box scores) | ~3,000 |
| Achievement drip | ~1,500 |
| **Total mint** | **~49,250** |

**Money is 91% of all minting.** The first axiom is satisfied structurally rather
than by hope — and, with the games off, satisfied more emphatically than the
axiom strictly requires.

Sink capacity on the other side: four stream games (40,000), rakes (~2,500),
cosmetics and commissions (~15,000) ≈ 57,500 — though that is capacity, not a
forecast, since it depends entirely on what members choose to buy.

The economy is therefore comfortably sink-dominant at launch, which is the right
direction to be wrong in and leaves deliberate room to switch the minigames back
on without immediately overshooting. If it drifts the other way, the elastic
lever is stream games, and that lever points the right way: more streams sold
means more streams aired, which means more subs. The flagship sink and the
primary faucet reinforce each other, which is the part of this design most worth
protecting.

### The honest risk: there is now almost no free path

Worth stating plainly rather than discovering in Discord. With the minigames
suspended, a member who neither pays nor does league admin work has essentially
no way to earn NB¥ — bio fills and Poo Poo cleanup are the only open doors, and
both run out. For most of the 59 members the practical answer to "how do I get
NB¥" becomes "subscribe."

That is a defensible launch position — it is precisely what the first axiom asks
for, the sinks are all cosmetic so nobody is locked out of anything competitive,
and the alternative was shipping three unexamined reward curves. But it is a real
change in how the site feels to a non-paying member, and it is the thing most
likely to generate complaints in week one. Two mitigations worth considering
before launch rather than after:

- **Raise the contribution faucets rather than the game ones.** Box scores at 300
  and cleanup at 25–100 are the *right* things to pay for — they are real work
  that saves the commissioner time, they are admin-reviewed, and they cannot be
  farmed. If the free side needs to be larger, this is where the room is.
- **Bring one game back early.** Poeltl is the safest of the three: one puzzle a
  day, trivially bounded, server-owned answer. If the reintroduction is going to
  happen anyway, doing it deliberately in month two beats doing it reactively in
  week one.

---

## 7. Open questions

- **Do past donors get credit at reset?** Members who already paid ~$10 for
  stream games have a real claim under the new peg. Recommendation: honour it. It
  is a small, one-time, genuinely-pegged mint, and it is the clearest possible
  signal that the peg means something.
- **What is the reset's public story?** The balances being wiped are, for most
  members, achievement money they didn't ask for. Framing matters: this is the
  economy getting a real currency, not members being punished. Worth writing the
  announcement before the code.
- **When and in what order do the minigames come back?** § 3 sets the bar each
  one has to clear; it does not set a date or an order. Poeltl is the obvious
  first candidate (bounded, server-owned answer, nothing to fix). Trivia is last
  and needs real work first.
- **Does the free-earning cap reset on the calendar month or the league year?**
  Calendar month is simpler and matches how subs bill. Flagged because the league
  otherwise runs on the July 1 league year (`nbn-api/season_clock.py`) and the
  mismatch will confuse someone eventually.
