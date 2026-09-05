# The NB¥ economy — a proposal

**Status: draft, under discussion. Nothing here is implemented.** Written
2026-09-05, restructured the same day. Balances are being wiped and the economy
restarted, so everything here is a proposal for the *new* economy. The
current-state figures in § 6 describe the old one and are evidence for why the
reset is happening, not a description of what is being kept.

**The peg, which everything below is denominated in: 1,000 NB¥ = $1.00 net to
the league.** Every mint traces back to a dollar the league actually received.
§ 4 is why.

Sections § 1 and § 2 are the two complete lists — every way in, every way out.
§ 4 justifies each number. Read the tables; argue with the bullets.

---

## 1. How you earn NB¥

### 1a. Paying (pegged)

| Path | Member pays | League nets | Rate | NB¥ | NB¥ per member-$ |
|---|---|---|---|---|---|
| Prime sub | $0 | $2.25 | ×1.00 | **2,250**/mo | — (free to give) |
| Tier 1 sub | $5.99 | $3.00 | ×1.00 | **3,000**/mo | 501 |
| Tier 2 sub | $11.99 | $6.00 | ×1.17 | **7,000**/mo | 584 |
| Tier 3 sub | $24.99 | $12.59 | ×1.35 | **17,000**/mo | 680 |
| **Direct donation** | $X | ~$X | ×1.00 | **1,000 × X** | **1,000** |

"Rate" is the premium on the base peg. Tier 1, Prime and direct donations convert
at exactly 1,000 NB¥ per league-dollar; Tier 2 and Tier 3 earn a stated premium
on top. Nothing is retroactive and nothing depends on how long you have subbed.

### 1b. Salary (annual, role-based)

Paid once a year at the July 1 league-year rollover. **Highest band only — these
do not stack**, and a committee salary replaces the active-member base rather
than adding to it.

| Band | Who | NB¥/year | In stream games |
|---|---|---|---|
| Board & committee heads | `bod`, `fac_head`, `poext_head` | **12,500** | 1.25 |
| Committee | `fac`, `poext`, `agent`, `curator`, `stats`, `bookie`, `streamer` | **7,500** | 0.75 |
| Active member | an open tenure during the league year | **2,500** | 0.25 |

Prorated by months held, from the tenure and role history already in
`members.json`. **`admin` draws no salary** — see § 4.

### 1c. Contributing (free, capped)

Everything in this table draws on **one shared allowance of 2,500 NB¥ per member
per calendar month**. When it is spent the faucets pay zero — streaks and
leaderboards keep running.

| Faucet | Today | Proposed | Counts against cap |
|---|---|---|---|
| Box score submission | 200 | **300** | ✅ |
| Bio field fill | 10/field | 10 | ✅ |
| Poo Poo cleanup | 25 / 50 / 100 | unchanged | ✅ |
| Poeltl daily solve | 50 | **0 — suspended** | ✅ when back |
| Perry daily top 3 | 100 / 50 / 25 | **0 — suspended** | ✅ when back |
| Trivia | `2^(n-1)` → 512, client-declared | **0 — suspended** | ✅ when back |

### 1d. Achievements (one-time, uncapped)

| Class | Examples | NB¥ |
|---|---|---|
| Competitive | Championship, Finals Run, Conf Royalty, FOTY, COTY, Juggernaut, Cinderella, Dynasty, MVP Maker, Star Factory | 250 / 500 / 1000 |
| Contribution | Archivist | 250 / 500 / 1000 |
| Tenure & volume | Wheeler Dealer, Polyamorous, Blank Check, Seasoned GM, Win Machine, Mr. Consistent | **0 — badge only** |
| Betting & investing | High Roller, Floor Trader, Moonshot, … | **0** (already excluded) |

### 1e. One-time

| | NB¥ |
|---|---|
| Signup balance (`NBY_START`) | **500** (was 1,000) |

---

## 2. How you spend NB¥

Every way NB¥ leaves a balance. Nothing on this list confers competitive
advantage — see § 4.

Everything here except the stream game already exists and already has a price;
the only new sink being proposed is the flagship one. Betting and the stock
market are the two systems large enough to need their own treatment — § 3.

| Sink | Price | Recurring | Status |
|---|---|---|---|
| **Stream a game** | **10,000** | ✅ flagship — flat price, first come first serve, max 2/team/month | new |
| Team theme unlock | 5,000 | per theme | exists, unchanged |
| Custom avatar | 5,000 | ✅ | exists, unchanged |
| Name colour / status text | 500 per change | ✅ | exists, unchanged |
| Tip burn | 5% on amounts over 1,000 | ✅ | new rake on an existing feature |
| Betting and the stock market | see § 3 | ✅ | exists, needs work |

---

## 3. Betting and the stock market

The two systems where NB¥ moves in volume. Both are currently **net-positive to
the money supply** when they should be net-negative, and both need more than a
price — so they are here rather than in the table above.

### Betting — `/bet`

A `bookie` opens a bet, members wager, the bookie closes it against an outcome.
Two bet types exist today and they behave completely differently:

- **Pool bets are exactly zero-sum.** `close_bet` splits the whole pool among
  whoever backed the winning option. Nothing is created. This is the correct
  shape and it should be the only shape.
- **Fixed-odds bets are house-funded.** Each winner is paid their
  `potential_payout` out of nothing, and the gap is merely *recorded* as
  `net_shortfall`. There is no vig and no cap on exposure, so **whoever writes the
  odds decides how much money to print.** In the old economy this was +18,198 in
  payouts against −15,115 wagered.

Proposed:

| | |
|---|---|
| **Fixed-odds bets** | **Removed.** If they are kept for flavour instead, the book must sum to ≥105% implied probability so the house has a vig, and each bet needs a hard exposure ceiling set at creation. |
| **Pool rake** | **5% of the pool, burned** before distribution — winners split 95%. This is what turns betting from neutral into a drain, which is the right shape for gambling inside a currency you are trying to keep scarce. |
| **Voided bets** | **No rake.** When no one backs the winning option the bet voids and everyone is refunded in full; taking 5% of a bet that never resolved is a fee for nothing. |
| **Max wager** | **1,000**, up from `NBY_MAX_WAGER = 300`. 300 was set against an economy where the median balance was 2,250; against a 10,000 stream game and a 17,000/month Tier 3 sub it is loose change. Still a per-member-per-bet cap, so one large balance cannot swallow a pool. |

### The stock market — `/invest`

Thirty team tickers plus eight index tickers (conferences and divisions). Every
price starts at 100 and moves with real game results. On top of the results-driven
price sits a **sentiment** overlay driven by member trades:
`market_price = algo_price × (1 + sentiment)`, where sentiment is
`±nbyen / SENTIMENT_DIVISOR` per trade, `SENTIMENT_DIVISOR = 50_000`, capped at
`SENTIMENT_CAP = 0.50` and decaying to zero over 82 games.

**This is not a transfer system.** Unlike a pool bet, there is no counterparty —
every NB¥ of profit is minted by the league and every loss is burned. That makes
it a faucet or a drain depending entirely on how members trade, which is why it
needs the most work of anything in this document.

Four holes, in order of severity:

1. **A member's own buy moves the price they are about to sell into.** Buy 25,000
   NB¥ of one team, sentiment goes to +50%, sell into the price you just made.
   The old ledger's ORL line — 18,533 in, 1,521 out — is someone standing at that
   door. **Fix: sentiment must be computed from everyone else's trades, never the
   trader's own.** This is the one that matters; the rest are hygiene.
2. **No transaction fee.** Fix: 1% on buy and on sell, burned. Note this does not
   close hole 1 on its own — a 50% pump clears a 1% fee without noticing it.
3. **No position cap.** One member can put their entire balance into one ticker,
   which is both the pump vector and a way to turn the market into a coin flip.
   Fix: cap exposure to a single ticker as a share of the member's balance.
4. **No settlement delay.** Buy and sell can happen in the same minute, against
   the same unchanged game data. Fix: no selling a position until some number of
   further games have been played.

Two smaller things worth knowing, both of which tilt the system toward the
member:

- **Shorts have capped losses.** `_short_equity` is
  `max(0, shares × (2 × avg_open − current))`, so a short can go to zero but never
  negative, while the upside is uncapped. That is a positive-EV instrument, which
  is fine as a design choice but should be a deliberate one.
- **Betting and investing achievements pay no NB¥** (§ 1d, already the case).
  Paying for gambling volume pays people to churn.

**Recommendation: leave `/invest` closed at the reset and reopen it once holes
1–4 are fixed.** It is the only system here that can mint without bound, the fix
list is short and well understood, and there is no reason to race it into a
brand-new economy on day one.

---

## 4. Why these numbers

The four axioms everything is derived from. The first three are the league's;
the fourth is proposed here.

- **A1.** The main way to earn NB¥ is donating USD, primarily through Twitch subs.
- **A2.** Direct donations should be incentivised relative to subs, because
  Twitch takes no cut of them.
- **A3.** A stream game was priced at ~$10 and should convert to NB¥ at that rate.
- **A4.** NB¥ must never buy competitive advantage.

### The peg — 1,000 NB¥ = $1.00 net to the league

- **Stated in dollars the league receives, not dollars the member spends.** This
  is the whole trick: Twitch keeps roughly half a subscription, so pricing off
  net revenue makes a direct donation pay almost exactly **2× per member-dollar**
  without any bonus multiplier. **A2 falls out of the peg rather than being
  bolted onto it.**
- **1,000-to-1 rather than 100-to-1** so the sinks have room to be granular — a
  500 NB¥ name colour and a 25,000 NB¥ naming right on the same scale.
- **Once the mint is pegged, supply growth stops being a problem.** A pegged
  currency does not inflate; a growing total just means members have savings.
  What has to be bounded is the *unpegged* fraction, which is what the free cap
  (below) and the salary bands exist to do. This reframes the whole design: the
  goal is not a small money supply, it is a small unpegged one.
- **The premium on Tier 2 and Tier 3 softens the peg slightly, deliberately.**
  Those tiers mint at 1,170 and 1,350 NB¥ per league-dollar, so a minority of NB¥
  is created with less than a dollar behind it. This is a bounded, stated
  deviation rather than a leak — Tier 1, Prime and direct donations all still
  convert at exactly 1,000 — and it buys the tier ladder below. The alternative
  that keeps the peg mathematically exact is to make Tier 1 convert at a
  *discount* and Tier 3 at par (2,400 / 5,400 / 12,590). It is cleaner on paper
  and worse in practice: identical relative incentives, uglier numbers, and it
  reads as punishing the entry tier.

### Why higher tiers convert better

**Decided 2026-09-05.** Tier 2 earns a ×1.17 premium and Tier 3 a ×1.35 premium
over the base rate. No loyalty or streak component — tier is the only thing that
changes the rate.

- **Twitch's own cut is flat, so without this there is no reason to upgrade.**
  The league nets ~50% at every tier, so a flat peg makes Tier 3 exactly 4.17×
  Tier 1 for exactly 4.17× the money. Nothing rewards the upgrade itself.
- **Upgrading is the cheapest revenue the league can get.** No acquisition cost,
  no new member to recruit, just an existing subscriber moving up. Paying
  disproportionately for it is efficient in a way that paying for volume is not.
- **The ladder is real: 501 → 584 → 680 NB¥ per member-dollar.** Paying 2× (T1→T2)
  earns 2.33×; paying 4.17× (T1→T3) earns 5.67×. The premium is visible at the
  moment of decision, which is the only moment it can work.
- **The guardrail: the top tier must still not beat a direct donation per
  member-dollar, or it inverts A2.** At 680 against direct's 1,000 there is
  comfortable headroom. **If the Tier 3 premium is ever raised past ×1.98 it
  overtakes direct donations and A2 breaks** — that is the ceiling, and it is
  worth writing down because it is not obvious from the multiplier alone.
- **No loyalty or streak multiplier** (dropped 2026-09-05). It rewarded elapsed
  time rather than a decision, it needed per-member subscription history the
  league does not currently store, and the tier premium already gives subs a
  reason to exist alongside donations. Subs also carry non-NB¥ value — emotes,
  the badge, channel standing — which does not need to be bought with currency.
- **Prime is free money and the site should say so permanently.** It costs the
  member nothing beyond what they already pay Amazon and hands the league $2.25 a
  month. Any member with Prime who isn't subbed is the cheapest available win —
  that belongs as a standing line on `/members`, not a one-off Discord post.
- Anti-abuse: **gifted subs pay the gifter in full and the recipient zero** (the
  gifter paid; paying both makes alt-gifting a laundry), chargebacks claw back,
  only the league's own channel counts, and Twitch identity has to link to the
  member record the way Discord already does via `/link`.

### Why the salary bands are what they are

- **This is the answer to "what does a non-paying member get."** Without it, and
  with the minigames suspended, a member who neither pays nor does league admin
  work has essentially no earning path at all — bio fills and Poo Poo cleanup are
  the only doors and both run dry. A guaranteed annual floor fixes that without
  reopening a grind.
- **Priced in stream games, because that is the only number with real-world
  evidence behind it (A3).** An active member earns a quarter of a broadcast a
  year, a committee member three quarters, a head or board member one and a
  quarter. That ladder is legible in a way that raw numbers are not.
- **Sized against the real roster, not a guess.** As of 2026-09-05 `members.json`
  has 61 members: 48 with an open tenure, 18 holding a committee role, 7 on the
  board or heading a committee. Non-stacking, that is 7 × 12,500 + ~13 × 7,500 +
  ~30 × 2,500 = **~260,000 NB¥/year**, against ~537,000 of pegged revenue at
  § 5's assumptions. **A1 survives it — money stays the largest source by a wide
  margin — but this is the single biggest unpegged mint in the design and the
  first dial to turn if that ratio needs to move.**
- **Highest band only, never summed.** A `fac_head` who is also an `agent` and a
  `curator` would otherwise draw three salaries. One person, one salary.
- **"Active" means holding a team, and nothing else.** No conduct bar, no strike
  threshold, no participation test — an open tenure during the league year,
  prorated by months held, full stop. This is deliberate: **the salary is pay for
  a seat, not a reward for behaving**, and tying it to conduct would turn every
  disciplinary decision into a decision about someone's money and give the board
  a lever it has not asked for.
- **That it resembles a tenure payment is the point, and it is not the trap the
  old achievements were.** Those paid up to 77,000 NB¥ once, retroactively, for
  things already true years ago. This pays 2,500 a year, forward-looking, and you
  have to still be here next year to get it again. A bounded recurring stipend and
  an unbounded retroactive airdrop are different animals despite both keying off
  tenure.
- **`admin` draws no salary** (decided 2026-09-05). The commissioner sets these
  numbers; the cleanest way to keep that from being a conflict is for the
  commissioner not to be in any band.
- **Paid at the July 1 league-year rollover** (`nbn-api/season_clock.py`), not the
  calendar year — it is compensation for a season of work, so it should land on
  the season boundary.

### Why the free cap is 2,500/month, and shared

- **One shared allowance across every faucet is worth more than tuning any
  individual faucet, because it bounds the ones nobody has found yet.** The
  trivia hole in § 6 becomes a 2,500/month bug instead of an unbounded one, and
  every future minigame is safe on the day it ships rather than after someone
  audits its reward curve.
- **2,500 is set just above a Prime sub (2,250).** The target steady state, once
  the minigames return: a maximally engaged member who pays nothing earns roughly
  what a *free* Prime sub would have given the league. Participation stays real,
  paying stays better, and **the free side structurally cannot out-earn the paid
  side — which is A1, enforced rather than hoped for.**
- **It stays even though nothing currently comes close to it.** With the games
  suspended it is not binding for anyone. It is stated now anyway because a cap
  introduced *after* members are used to uncapped earning reads as a takeaway,
  and because it is the precondition that lets a game be switched back on without
  redesigning anything around it.

### Why the minigames pay nothing at launch

**Decided 2026-09-05.** Poeltl, Perry and Trivia keep running — streaks,
leaderboards, Discord results, all unchanged. They just stop minting.

- **They were 30,000 NB¥ of the old mint** (Perry 14,500, Trivia 12,243, Poeltl
  3,200) and only some of that survives scrutiny — Trivia's reward was never
  verified server-side at all (§ 6).
- Rather than ship three reward curves nobody has confidence in alongside a
  brand-new peg, **launch with the peg and add the games back one at a time with
  numbers derived from observed behaviour.** This is a suspension, and the
  reintroduction is meant to be deliberate.
- What has to be true before a game pays again: **its reward is computed
  server-side from state the server owns** (Trivia fails this today and must be
  fixed first, not as part of reconsidering it); **its maximum monthly yield is
  known rather than emergent**; and **it debits the shared cap**, so its yield
  composes with everything else instead of stacking on top.
- Poeltl is the obvious first candidate back — one puzzle a day, server-owned
  answer, nothing to fix.

### Why achievements changed

- **The scale is fine; what qualified was not.** 250/500/1000 under the peg is
  $0.25/$0.50/$1.00 for a one-time, non-repeatable event. That is cheap.
- **The line is between results and tenure.** Wheeler Dealer, Polyamorous and
  Blank Check accrue automatically to anyone who sticks around — nearly all 59
  members collected Wheeler Dealer and Polyamorous on the same two days in July
  2026, which is the whole tell. **Winning a title is not something you accrue.**
- **They are exempt from the monthly cap** because they are one-time and cannot
  be farmed. A member who finally wins a championship in a month they have
  already capped should still get paid; the alternative is a confusing silent zero.
- **The old retroactive burst will not re-fire.** `build/achievement-notify.js`
  seeds its snapshot silently on first run, so deleting
  `$NBS_DATA_DIR/achievement-state.json` at reset costs nothing and grants nothing.

### Why the sinks are priced where they are

- **The stream game is the only new sink, and it is the one price real members
  have actually paid (A3).** $10 → 10,000 NB¥. Everything else on the § 2 list
  already exists at its current price and is left alone — a proposed catalogue of
  banners, flair, commissions and naming rights was cut on 2026-09-05 as **stuff
  the league does not actually want to sell.** A sink nobody wants to buy drains
  nothing, so an invented catalogue is not a real answer to the sink problem
  however good it looks in a table.
- **Flat price, first come first serve** (decided 2026-09-05). An auction is the
  better price-discovery mechanism when you don't know the price — and nobody has
  bought a stream this year, so nobody does. But it is far more machinery, it is
  unpleasant to lose repeatedly, and **it structurally favours whoever has the
  largest balance.** FCFS is legible, cheap to build, and rewards paying attention
  rather than hoarding.
- **Hence the 2-per-team-per-month cap**, which is the guardrail an auction would
  have provided implicitly. Flat price with no cap means one member with a large
  balance can buy the entire slate, and **the flagship sink becomes their private
  broadcast schedule.** At 10,000 each the cap is 20,000/month — beyond what the
  free side can produce, within reach of a Tier 2 subscriber who saves.
- **Revisit the price after the first month of real demand.** Every slot claimed
  within minutes means 10,000 is too cheap and the sink isn't draining. Nothing
  sold by mid-season means it's too expensive. The $10 anchor is a starting point,
  not a finding, and the number should be re-derived from behaviour rather than
  defended because it is written here.
- **Nothing in the catalogue is competitive (A4).** No roster moves, no cap
  relief, no draft position, no queue priority, no information other teams don't
  have. A league where donations buy wins is worse than one with no currency at
  all, and this line is far easier to hold from the start than to walk back later.

### Why the tip burn exists

- Tipping moves NB¥ between members **without destroying any**. The burn is
  destroyed rather than paid to a house account, which is what makes it a drain
  and puts it on the spend list at all.
- **5% over 1,000.** The threshold keeps small tips frictionless — tipping is a
  social feature first, and taxing a 50 NB¥ thank-you would just stop people
  sending them — while discouraging the consolidation of balances into one
  account.
- The betting rake and the invest fee follow the same logic and are argued
  where they belong, in § 3.

---

## 5. Does it balance?

Annual, at eight subscribers (3 Prime, 4 Tier 1, 1 Tier 2) and ~$20/month in
direct donations:

| Source | NB¥/year | |
|---|---|---|
| Subs + donations | **549,000** | against $537 actually received |
| Salaries | 260,000 | |
| Contributions (bio, cleanup, box scores) | 36,000 | |
| Achievement drip | 18,000 | |
| Minigames | 0 | suspended |
| **Total mint** | **863,000** | |

**Money is 64% of all minting** — A1 satisfied, and satisfied structurally rather
than by hope.

The 549,000 against $537 is the tier premium showing up in the aggregate: about
12,000 NB¥/year, 1.4% of the mint, is the cost of the Tier 2 and Tier 3 rates.
Small enough not to matter, and it scales with exactly the behaviour it is meant
to encourage.

Sink capacity on the other side:

| Sink | NB¥/year | |
|---|---|---|
| Stream games | **480,000** | at four a month |
| Existing cosmetics (themes, avatars, name colours) | ~30,000 | mostly one-time per member; runs dry |
| Rakes and the tip burn | ~30,000 | scales with betting volume |
| **Total capacity** | **~540,000** | |

That is capacity, not a forecast, and it leaves **a gap of roughly 320,000
NB¥/year — 37% of the mint.**

### The economy has one real sink

This is the honest headline of § 5 and it is worth stating flatly: after cutting
the proposed catalogue, **stream games are 89% of all sink capacity.** Cosmetics
run dry — a member buys one avatar and one theme and is done — and the rakes only
scale with gambling volume the design is otherwise trying to shrink.

That makes the whole economy's balance a function of one number: **how many
broadcasts get sold.** At four a month there is a 320,000/year gap. At eight a
month it closes entirely. Nothing else on the list can move enough to matter.

Three things follow:

- **The stream-game price and volume are now the only meaningful dial**, which
  raises the stakes on the § 4 note about revisiting the price after real demand
  data. Getting it wrong is no longer a minor mispricing.
- **Salaries are the largest thing that could be cut** if the gap needs closing
  from the faucet side — 260,000/year, almost exactly the size of the gap. That
  is a real trade: the salary is what gives non-paying members any path at all,
  so closing the gap that way reopens the problem it was added to solve.
- **The gap may simply be acceptable.** A pegged mint does not inflate, and
  members accumulating savings is not a crisis — it only becomes one if balances
  grow so large that the sinks stop feeling meaningful. That is a thing to watch
  after a season of real data, not to pre-solve now.

The direction that points the right way is still the same one: **more streams
sold means more streams aired, which means more subs.** The flagship sink and the
primary faucet reinforce each other, and with the catalogue gone that loop is no
longer just the most attractive part of the design — it is essentially the whole
of it.

---

## 6. Where the old economy stands, and what broke

Measured 2026-09-05 from `bets-ledger.json` (1,536 entries) and
`member-balances.json`. This is the economy being replaced.

| | |
|---|---|
| Outstanding | **165,538 NB¥** across 59 members (median 2,250) |
| Gross minted | ~174,200 |
| Gross **burned** | **8,100** — four cosmetic changes, one avatar, one theme, one revert |

**Sink ratio: 4.7%.** That single number is the diagnosis. Everything else is
downstream of an economy with faucets and essentially no drains.

| Source | Minted | Share |
|---|---|---|
| Achievements | 101,000 | 58% |
| Bet payouts | 18,198 | 10% |
| Perry | 14,500 | 8% |
| Trivia | 12,243 | 7% |
| Bio fills | 5,710 | 3% |
| Admin adjust | 5,000 | 3% |
| Poeltl, Poo Poo cleanup, box scores, invest | ~10,400 | 6% |

Four structural defects, which are why a reset alone would fix nothing — reset
the balances without changing the mechanisms and the same distribution reappears
within a quarter.

**1. Achievements were a tenure airdrop.** 44 achievements × (250/500/1000) is up
to 77,000 NB¥ per member. The mass drops were `Wheeler Dealer`, `Polyamorous`,
`Blank Check` and `Seasoned GM` — trade counts and roster-churn totals that
accrue automatically to anyone who has been around. Nearly all 59 members
received the first two on the same two days in July 2026.

**2. Trivia is an unmetered printer.** `post_trivia_answer` in
`nbn-api/routers/misc.py` takes `streak` from the request body and never verifies
an answer or tracks a session server-side. `POST {"streak": 10}` in a loop pays
512 NB¥ per call, without limit. The ledger's `Trivia streak 11` through
`Trivia streak 30` rows are the fingerprint of a client that kept counting past
the point the server stopped checking.

**3. Invest is a self-pump loop**, and **4. fixed-odds bets are house-funded.**
Both are dissected in § 3, where the fixes live; between them they account for
the 18,198 in bet payouts and the 3,047 in share sales above. They are listed
here only so the count of what went wrong is complete.

### Remove or fix before reopening

| | Verdict |
|---|---|
| **Fixed-odds bets** | **Remove** — § 3. |
| **Invest** | **Fix all four holes or leave it closed** — § 3. Recommended: closed at reset, reopened once fixed. |
| **Trivia streak endpoint** | **Fix before it ever pays again.** Suspending the reward (§ 1c) closes the hole for now, but the fix is the precondition for reintroducing the game, not part of the work of reintroducing it. The server has to own the session. |
| **Tenure achievement payouts** | **Remove the NB¥**, keep the badge (§ 1d). |
| **`POST /api/bets/admin/adjust`** | **Keep** — it is the achievement job's only channel — but require a structured reason category rather than free text. Every achievement mint currently lands in the ledger as `Admin adjustment: …`, indistinguishable from a manual grant, which is why § 6's numbers took a parser to recover. |

---

## 7. Open questions

- **Do past donors get credit at reset?** Members who already paid ~$10 for stream
  games have a real claim under the new peg. Recommendation: honour it. It is a
  small, one-time, genuinely-pegged mint and it is the clearest possible signal
  that the peg means something.
- **What is the reset's public story?** The balances being wiped are, for most
  members, achievement money they never asked for. This is the economy getting a
  real currency, not members being punished. Worth writing the announcement
  before the code.
- **When and in what order do the minigames come back?** § 4 sets the bar each has
  to clear; it does not set a date. Poeltl first, Trivia last and only after real
  work.
- **Calendar month for the free cap, league year for salaries** — two different
  clocks, deliberately (one is a grind limiter, one is compensation for a season).
  Flagged because it will confuse someone eventually.
