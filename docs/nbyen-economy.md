# The NB¥ economy

**Status: built 2026-09-25, not yet switched on.** NB¥ restarts from zero with
a deliberately small economy: money in only from a starting grant, real
dollars and Twitch subs; money out only on bets and buying a stream. More ways
to earn and spend come back one at a time, each with a price decided when it
returns. Everything below the appendix line is the September proposal this
came from. It's kept for its reasoning; its numbers are on the old scale.

## 1. The peg

**$1 = 100 NB¥. One stream game = $10 = 1,000 NB¥.** That's the one number the
rest is built from. The September proposal used 1,000 NB¥ per dollar; the scale
was cut by ten at launch, so every price in it divides by ten.

## 2. How you earn

| Source | Amount | When |
|---|---|---|
| Starting grant | 1,000 | Once. Every member at the reset, and every member added after it (`POST /api/members`). |
| Donations | 100 per $1 | When the board logs it on `/donations`. Editing a donation moves exactly the difference, to whoever it now names. |
| Twitch subs | 300 a month for Tier 1 or Prime, 700 for Tier 2, 1,700 for Tier 3 | Once a month, by `nbn-twitch-subs.timer`. |
| Winning bets | Set by the bookie's odds | When a bet closes. |
| Futures | 100 per winning share, or a sale at the market price | When you sell, or when the market settles. |
| Box score screenshots | 25 per side, so 50 a game | The first screenshot for each team's side of a game pays its uploader. A game typed in by hand pays 50 when it's committed. Committing a game that came in as screenshots pays nothing more. Back on 2026-10-21. |
| Pick'em | 100 for each day's winner, 1,000 for the season's | Paid to first place, with every tied winner getting the full amount. A day pays once all its box scores are in; the season once its last scheduled day is final. Paid by `settle()` in `nbn-api/routers/pickem.py`, kind `pickem`. On since 2026-10-22. |

- **Every source is a real ledger line.** There's no default balance any more.
  A member nobody has paid has 0.
- **Donations at the reset** were the $834 on record, from 18 members:
  83,400 NB¥, from 2,000 (Drew) to 10,000 (RJ, KVL, cheppywire).
- **Twitch only reports who is subbed right now**, so the job runs once a month
  and a sub active that day counts for the month. It can safely run twice: each
  payment carries `twitch:<month>:<subscriber id>`.
- **A gifted sub pays the gifter**, not the recipient. The gifter paid, and
  paying both would let someone mint by gifting to an alt.
- **A subscriber needs a `twitch` login on their member record** to be paid.
  The job lists anyone it couldn't match. Prime and Tier 1 pay the same because
  the Twitch API can't tell them apart.

## 3. How you spend

| | Price |
|---|---|
| Buy a stream | 1,000 |
| A bet | up to 100 per bet |
| Futures shares | at the market price, plus a 2% fee. No cap unless a bookie sets one on that market |

Themes, avatars and name colours people already own stay theirs. Buying new
ones is paused (§ 6).

## 4. Betting

- **Fixed odds only.** Pool bets are retired. Closed ones stay in `bets.json`
  as history.
- **There is no house wallet.** Bookies price by hand, and odds that add up to
  less than 100% pay out more than was staked, which creates NB¥. That's
  accepted, on two conditions:
  - **It's visible.** `GET /api/bets/house` and the top of `/bet` show the
    house's running result since the reset. Negative means the odds created
    that much NB¥. The bet form also says so while the bookie types the odds.
  - **The per-bet cap is 100.** One badly priced long shot can't pay thousands.
- **The quick over/under templates price both sides at −110** (52.4% each, a
  1.91× payout). On balanced action the house keeps a little.
- If the house number drifts a long way negative, the fix is a tighter cap or
  a required book above 100%. It's not a bank.

## 4a. Futures markets

Added 2026-09-25. The Futures tab on `/bet`; code in
`nbn-api/routers/markets.py` and `bet/futures.js`.

- **A Yes share pays 100 NB¥ if its outcome happens; a No share pays 100 if it
  doesn't.** The price is the market's odds: a Yes at 23 NB¥ is 23%, and the
  matching No costs 77.
- **Nobody sets prices.** An automated market maker (LMSR) quotes every
  outcome. Buying pushes a price up and the rest down; prices always sum to 100.
  A bookie opens a market, can seed its opening odds, and names the winner.
  That's all. The point is that a league trade moves the price as soon as a
  member acts on it, with no committee keeping lines current.
- **Members can sell any time before close.** You sell shares you hold; to bet
  against an outcome, you buy its No. To the market maker a No on Boston is one
  share of every other outcome, so it needs no math of its own.
- **There's no per-member cap by default.** It was there to stop one member
  pushing a price where nobody could push it back. With No shares anyone can,
  and a price pushed too far is money for whoever corrects it. Big bets also
  can't raise what the house can lose, which is fixed by `b`. A bookie can
  still set `max_stake` on a market.
- **Nobody buys No on a team they work for** (a team role, or a current
  tenure as owner, GM or coach). That bet pays more the worse the team does,
  and its holder can make that happen. Selling one you already hold is always
  allowed, so someone who joins a team holding a bet against it can get out.
- **Bets on any other team are unlimited, on purpose.** With one winner, a Yes
  on another team is partly a bet against your own, and Yes on all 29 others
  is the whole of one. A limit on that was built and dropped the same day
  (2026-09-25): it stopped a contender's GM from backing the team they think
  will win, and the incentive is weak, since tanking means throwing away a real
  title chance. The trade log is public, so the disguised version is visible.
  Like betting through an alt account, it's a conduct question for the league.
- **Knowing about your own trade early is not blocked.** A GM who's about to
  land a star can buy Yes on their team, or on the team getting their star.
  The house can't lose more because of it, the edge lasts only until the trade
  is announced, and it makes the price right sooner. If it becomes a problem,
  the option is pausing a team while it has an open TRC request.
- **What a market does to the money supply is a formula.** Round trips cost
  nothing but the fee, so only the final state matters. At settlement:

  > NB¥ created = b × ln(winner's closing price ÷ winner's opening price) − fees

  It creates NB¥ when the crowd was right and destroys it when the crowd was
  wrong. The most it can create is `b × ln(1 ÷ lowest opening price)`. With the
  default `b` = 1,500 and 30 level teams that's about 5,100. A market that
  stays open until the result is obvious will create close to that, so treat
  it as the expected cost of the market, not a rare worst case.
  `tests/test_markets.py` checks the formula against the wallet.
- **The controls on that cost:**
  - `b`: halving it halves the cost, but prices move twice as far per trade.
    At 1,500, moving a team from 10% to 20% costs about 177 NB¥.
  - Close earlier (`closes_at`, or lock by hand). Closing at the playoffs keeps
    the winner's price well short of 100%.
  - The fee (default 2%), burned on every buy and sell. It also makes flipping
    stale news cost something.
  - No outcome opens under 1%, so seeded odds can't raise the maximum without
    limit (1% caps it at `b × 4.6`).
- **Voiding a market** refunds each member what they put in, net of what they
  took out by selling. Fees are refunded too.
- **Each market shows its own result**, and `GET /api/markets/house` sums them.
  `/nbyen` has a "Futures traders, net" tile. Ledger kinds are `market_buy`,
  `market_sell`, `market_payout` and `market_refund`.
- **Opening odds can come from power rankings.** "Fill with all 30 teams" on
  the new-market form weights each team from the latest published edition, by
  average ballot rank: a team's weight falls by a factor of e every 3 places
  (`SEED_SPREAD`, served by `GET /api/markets/seeds/power-rankings`). On the
  2026 preseason edition that opens the top team near 21%, the top five near
  70%, and everyone below about 12th at the 1% floor. The bookie can edit any
  weight before opening.
- **Still open:** a roster-based model for opening odds, and rules for GMs
  trading on their own pending trades. See `BACKLOG.md`.

## 5. Buying a stream

- **Any member, any upcoming game, 1,000 NB¥**, in two steps:
  1. The member requests it from the list view on `/calendar`
     (`POST /api/schedule/{id}/stream-request`). Nothing is spent; the balance
     is only checked. The game carries `stream_request` and the streamers get
     an inbox notice. The member can withdraw it (`DELETE`).
  2. A streamer accepts or declines it on `/committees/stream` (My games, and
     the stream column in Claim Games). **Accepting is the purchase**: the
     member is debited then, and the game gets its `stream` flag and
     `stream_buyer`. Declining costs nothing. Either way the member is told.
- **No daily limit.** A streamer approves each one, so a day can have as many
  bought streams as they accept.
- **Only a streamer refunds it**, in full, from Claim Games on
  `/committees/stream`. That clears the stream. The buyer
  can't cancel.
- **A bought game can't be quietly undone.** Unflagging it or deleting it is
  refused until it's refunded.

## 6. Paused, and the order it comes back

Everything here still runs. It just doesn't move NB¥. Each has a switch in
`KINDS` in `nbn-api/routers/wallet.py`, and the price it comes back at is
already in the code on the new scale.

| # | Feature | Price when it returns | Before it can return |
|---|---|---|---|
| 1 | Tips | — (moves NB¥, creates none) | Nothing. Safe first. |
| 2 | Box score submissions | **On since 2026-10-21**, at 50 a game (§ 2) | It came back without the shared monthly cap below. |
| 3 | Competitive achievements | 25 / 50 / 100 | `REWARD` in `build/achievement-notify.js` still says 250/500/1000, and tenure achievements must stay badge-only. |
| 4 | Committee salaries | 250 / 750 / 1,250 a year | Not built. See the appendix, § 1b. |
| 5 | Poeltl | 5 per solve | Nothing. The server owns the answer. |
| 6 | Bio fills, Perry | 1 per field; 10 / 5 / 2.5 | Nothing. |
| 7 | Themes, avatar, name colour | **On since 2026-10-26**, at 500, 500, 50 | Nothing. They only spend NB¥. |
| 8 | Trivia | — | **The server must track the streak.** Today the browser reports its own streak, so the endpoint pays whatever it's told. |
| 9 | The market (`/invest`) | — | **On since 2026-10-23**, under § 3's rules. Playoff games aren't in the schedule, so the pending-box-score lock can't see them: lock the market by hand for the postseason. |

When the first of 2, 3, 5 or 6 comes back, add the shared monthly cap on free
earning from the appendix (§ 1c) at the same time.

While achievements are paused, the achievement job records each unlock without
paying it. So switching them back on pays unlocks from then on, not a backlog.

## 7. How it works

- **`routers/wallet.py` is the only code that changes a balance.** Every
  movement is `wallet.post()`, which applies several lines all-or-nothing and
  refuses an overdraw (402) or a paused kind (423).
- **`nbyen-ledger.jsonl` is the record.** It's append-only, one line per
  movement, each with a `kind` and usually a `ref` (`bet:…`, `stream:…`,
  `donation:…`, `twitch:…`). `member-balances.json` is a cache of it, and
  `wallet.rebuild_balances()` regenerates it.
- **The lock works across processes** (flock), because the Twitch job and the
  reset script write from outside the API.
- **`bets-ledger.json` is the old economy, frozen.** Nothing writes it. The
  legal page cites it.
- **`/nbyen` shows all of it, publicly:** every balance, totals by source,
  and the ledger filtered by member or kind (`GET /api/nbyen/summary`,
  `GET /api/nbyen/ledger`, in `routers/nbyen.py`). It's public because nearly
  all of it already was — bets, donations and balances. What it adds is who
  subs on Twitch and at what tier.
- **Net worth has one definition: `nbyen.net_worth_rows()`.** Wallet + stocks +
  futures + open bets. Each game says what its members hold
  (`invest.open_holdings()` and `markets.open_holdings()` at current prices,
  `bets.open_stakes()` at the stake), because a buy or a wager takes NB¥ out of
  the wallet long before anything comes back. Without that, someone holding
  thousands looked broke. `/nbyen`, the `/invest` portfolio card and Discord
  `/nbyen-leaders` all read it; until 2026-10-23 each counted a different subset.
- **P&L per game comes from the ledger.** A game's P&L is the sum of its kinds'
  ledger lines (`nbyen.GAMES`) plus what is still held in it. Fees and refunds
  are in, and no trade log is replayed. The `/invest` leaderboard is Wall
  Street's slice of the same sum.
- **Every NB¥ has a source, and a member's sources sum to their net worth.**
  `nbyen.SOURCES` puts every ledger kind in exactly one bucket (starting grant,
  donations, Twitch, the three games, Pick'em, box scores, rewards, tips,
  streams, shop, adjustments). The games count what is still held, as above.
  This is `/nbyen`'s Breakdown tab, and `test_nbyen` fails if a new kind is
  added to `wallet.KINDS` without a bucket. An adjustment that undoes another
  kind's mistake is counted against that kind (`nbyen.CORRECTS`, keyed by the
  adjustment's `ref`), so KVL's Donations column reads the $100 actually donated rather
  than the three test credits and their reversal.
- **Tests can't reach the live wallet.** `tests/__init__.py` points it at a temp
  directory before any test runs. It exists because `test_donations` once wrote
  a test donation into the live balances.

## 8. The reset (done 2026-09-25)

Balances and Wall Street holdings were emptied at `RESET_AT` in
`nbn-api/routers/invest.py` (2026-09-25 17:59 UTC). The one-off script that did
it, `nbyen_reset.py`, copied `member-balances.json` and `invest-holdings.json`
to `*-pre-reset.json` first, and was removed 2026-11-16 (it is in nbn-api's git
history). The Twitch sub credit it was paired with is the recurring
`nbn-twitch-subs.timer` (monthly, the 1st at 18:00): `credit_twitch_subs.py`.
