# The NB¥ economy — a proposal

**Status: draft, under discussion. Nothing here is implemented.** Written
2026-09-05, restructured the same day. Balances are being wiped and the economy
restarted, so everything here is a proposal for the *new* economy. The
current-state figures in § 5 describe the old one and are evidence for why the
reset is happening, not a description of what is being kept.

**The peg, which everything below is denominated in: 1,000 NB¥ = $1.00 net to
the league.** Every mint traces back to a dollar the league actually received.
§ 3 is why.

Sections § 1 and § 2 are the two complete lists — every way in, every way out.
§ 3 justifies each number. Read the tables; argue with the bullets.

---

## 1. How you earn NB¥

### 1a. Paying (pegged)

| Path | Member pays | League nets | NB¥ | NB¥ per member-$ |
|---|---|---|---|---|
| Prime sub | $0 | $2.25 | **2,250**/mo | — (free to give) |
| Tier 1 sub | $5.99 | $3.00 | **3,000**/mo | 501 |
| Tier 2 sub | $11.99 | $6.00 | **6,000**/mo | 500 |
| Tier 3 sub | $24.99 | $12.59 | **12,500**/mo | 500 |
| Bits (per 100) | ~$1.40 | $1.00 | **1,000** | 714 |
| **Direct donation** | $X | ~$X | **1,000 × X** | **1,000** |

Sub loyalty multiplier, applied to the monthly figure above:

| Consecutive months subbed | Multiplier | Tier 1 pays |
|---|---|---|
| 1–2 | ×1.0 | 3,000 |
| 3–5 | ×1.15 | 3,450 |
| 6–11 | ×1.3 | 3,900 |
| 12+ | ×1.5 | **4,500** |

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
`members.json`. **`admin` draws no salary** — see § 3.

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
advantage — see § 3.

| Sink | Price | Recurring |
|---|---|---|
| **Broadcast** | | |
| **Stream a game** | **10,000** | ✅ flagship — flat price, first come first serve, max 2/team/month |
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
| **Rakes** — burned, not paid to a house account | | |
| Pool bet rake | 5% of the pool | ✅ |
| Tip burn | 5% on amounts over 1,000 | ✅ |
| Invest transaction fee | 1% on buy **and** on sell | ✅ |

---

## 3. Why these numbers

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
- Tier 3 is rounded from 12,590 down to **12,500**. A round number is worth more
  than the 90 NB¥.

### Why subs get a loyalty multiplier

- A pure A2 reading makes subscribing strictly worse than donating, which is the
  wrong answer: **recurring revenue is worth more to the league than a one-off of
  the same size**, and sub count is itself a growth lever on Twitch (emotes,
  channel standing, discoverability).
- The multiplier tops out at ×1.5, which brings Tier 1 to 750 NB¥ per
  member-dollar — still below direct's 1,000. **Direct keeps the better rate, so
  A2 holds; subs win on cumulative total and on not having to remember.** The
  thing being paid for is retention, which is the behaviour actually worth buying.
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
  § 6's assumptions. **A1 survives it — money stays the largest source by a wide
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
  trivia hole in § 5 becomes a 2,500/month bug instead of an unbounded one, and
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
  verified server-side at all (§ 5).
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

- **Everything is anchored on the stream game, because it is the one price real
  members have actually paid (A3).** $10 → 10,000 NB¥, and the rest of the
  catalogue is positioned relative to it: a naming right is worth more than a
  broadcast, a profile banner is worth a fraction of one.
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

### Why the rakes exist

- Betting, tipping and investing currently move NB¥ between members **without
  destroying any**. The rake is burned rather than paid to a house account, which
  is what makes each of them a genuine drain and puts them on a spend list at all.
- **Pool bets, 5%.** Pool betting is currently exactly zero-sum. A rake makes it a
  net drain, the correct shape for gambling inside a currency you are trying to
  keep scarce.
- **Tips, 5% over 1,000.** The threshold keeps small tips frictionless — tipping
  is a social feature first — while discouraging the consolidation of balances
  into one account.
- **Invest, 1% each way.** Necessary but nowhere near sufficient: a 50% self-pump
  (§ 5) clears a 1% fee without noticing it.

---

## 4. Does it balance?

Annual, at eight subscribers (3 Prime, 4 Tier 1, 1 Tier 2) and ~$20/month in
direct donations:

| Source | NB¥/year | |
|---|---|---|
| Subs + donations | **537,000** | = $537 real |
| Salaries | 260,000 | |
| Contributions (bio, cleanup, box scores) | 36,000 | |
| Achievement drip | 18,000 | |
| Minigames | 0 | suspended |
| **Total mint** | **851,000** | |

**Money is 63% of all minting** — A1 satisfied, and satisfied structurally rather
than by hope.

Sink capacity on the other side: four stream games a month (480,000/yr), rakes
(~30,000), cosmetics and commissions (~180,000) ≈ **690,000**. That is capacity,
not a forecast — it depends entirely on what members choose to buy.

**Adding salaries flips the economy from sink-dominant to mildly faucet-dominant**
— roughly 160,000 NB¥/year of slack, about 19% of the mint. Worth saying plainly
because it is the cost of the § 1b decision, and there are three dials if it
matters: lower the salary bands, raise the stream-game price, or sell more
broadcasts. The third is the one that points the right way — **more streams sold
means more streams aired, which means more subs.** The flagship sink and the
primary faucet reinforce each other, and that loop is the part of this design
most worth protecting.

---

## 5. Where the old economy stands, and what broke

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

**3. Invest is a self-pump loop.** `nbn-api/routers/invest.py` has no transaction
fee, no position cap and no cooldown, and a member's own buy moves the price they
will sell into: `sentiment_delta` is `±nbyen / SENTIMENT_DIVISOR` with
`SENTIMENT_DIVISOR = 50_000` and `SENTIMENT_CAP = 0.50`, applied as
`market_price = algo_price × (1 + sentiment)`. Buy 25,000 NB¥ of one team,
sentiment goes to +50%, sell into the price you just made. The ORL line in the
ledger (−18,533 in, +1,521 out) is someone standing at that door.

**4. Fixed-odds bets are house-funded.** Pool bets are correctly zero-sum —
`close_bet` divides the whole pool among the winners and creates nothing.
Fixed-odds settlement pays each winner their `potential_payout` out of nothing
and merely *records* the gap as `net_shortfall`. Whoever writes the odds sets the
size of the mint, with no vig and no cap on exposure. That is the +18,198 in
payouts against −15,115 wagered.

### Remove or fix before reopening

| | Verdict |
|---|---|
| **Fixed-odds bets** | **Remove.** An unbacked mint whose size is set by whoever writes the odds. If kept for flavour, require the book to sum to ≥105% implied probability so the house has a vig, and cap exposure per bet. |
| **Trivia streak endpoint** | **Fix before it ever pays again.** Suspending the reward (§ 1c) closes the hole for now, but the fix is the precondition for reintroducing the game, not part of the work of reintroducing it. The server has to own the session. |
| **Invest** | **Fix all four holes or leave it closed.** Transaction fee, position cap, settlement delay (no selling until N further games have been played), and — most important — **sentiment must exclude the trader's own trades**. The fee alone does not close this. |
| **Tenure achievement payouts** | **Remove the NB¥**, keep the badge (§ 1d). |
| **`POST /api/bets/admin/adjust`** | **Keep** — it is the achievement job's only channel — but require a structured reason category rather than free text. Every achievement mint currently lands in the ledger as `Admin adjustment: …`, indistinguishable from a manual grant, which is why § 5's numbers took a parser to recover. |

---

## 6. Open questions

- **Do past donors get credit at reset?** Members who already paid ~$10 for stream
  games have a real claim under the new peg. Recommendation: honour it. It is a
  small, one-time, genuinely-pegged mint and it is the clearest possible signal
  that the peg means something.
- **What is the reset's public story?** The balances being wiped are, for most
  members, achievement money they never asked for. This is the economy getting a
  real currency, not members being punished. Worth writing the announcement
  before the code.
- **When and in what order do the minigames come back?** § 3 sets the bar each has
  to clear; it does not set a date. Poeltl first, Trivia last and only after real
  work.
- **Calendar month for the free cap, league year for salaries** — two different
  clocks, deliberately (one is a grind limiter, one is compensation for a season).
  Flagged because it will confuse someone eventually.
