# X (Twitter) Thread Draft

---

## Metadata

- **Topic:** First Operator-of-the-Week spotlight (template stub — fill in the curator's specifics before posting)
- **Pillar:** P4 Operator Stories
- **Calendar week:** Week 2 (Season 1 — first OOTW spotlight)
- **Source:** On-chain state of `<basket-address>`, plus a one-line DM quote from `<curator-handle>`
- **Hook type:** Personal Story

---

## Thread (6 tweets)

### Tweet 1 -- Hook

@<curator-handle> built the first IndexFlow <basket-name> basket on testnet.

<one-line summary of why they chose this basket — pulled from their DM quote, e.g. "wanted real-asset exposure that an investor can redeem against on a bad day">.

Here's what they shipped — and what they'd change next time.

### Tweet 2

The thesis, in @<curator-handle>'s words:

"<paste the curator's 1-2 line DM quote on why this basket and why now>."

Assets: <comma-separated asset list, e.g. BHP.AX, RIO.AX, FMG.AX>.
Basket address: <basket-address>.

### Tweet 3

The numbers @<curator-handle> picked:

- Deposit fee: <deposit-fee-bps> bps
- Redeem fee: <redeem-fee-bps> bps
- Reserve floor: <reserve-bps> bps (≈<reserve-pct>% idle USDC)

The reserve choice is the operator decision the bot can't capture. Conservative or aggressive, it's a thesis about who the depositors are.

### Tweet 4

What @<curator-handle> would do differently:

"<paste the curator's 1-2 line DM quote on what they'd tune — fee, reserve, asset count, allocation pacing>."

This is the kind of detail operating a vault teaches you that deploying one doesn't.

### Tweet 5

Current on-chain state of the basket:

- TVL: <tvl> USDC
- Perp allocated: <perp-pct>%
- Open positions: <position-count>
- Days live: <days>
- Unique depositors: <unique-depositors>

Verify any block: <basket-explorer-url>.

### Tweet 6 -- CTA

Want to be next week's Operator?

Build a basket in 10 minutes:
indexflow.app/baskets/new?utm_source=x&utm_campaign=ootw-w2

Season 1 closes Jun 21. Active operators get earlier mainnet whitelist priority — and the next Wednesday spotlight thread.

---

## Standalone Tweets (extract 3-5 from thread)

> These extracts assume the placeholders are filled in before the thread ships. Lift the most quotable line(s) from the curator's DM and the most striking number from Tweet 5 once the basket is identified.

1. "@<curator-handle> on why <basket-name> launched at <reserve-pct>% reserve: '<one-line quote>.' Reserve depth is a product-quality parameter, not a treasury setting — and now it's a published number."

2. "First IndexFlow Operator of the Week is live. <basket-name> by @<curator-handle>: <unique-depositors> unique depositors, <perp-pct>% perp-allocated, <days> days live. The /operators leaderboard updates with the next keeper tick."

3. "Operator quotes are doing real work this season. @<curator-handle> on what they'd change: '<one-line quote>.' If you've launched a vault, that line will mean something to you."

4. "The auto-broadcast bot can tell you a basket exists. The Operator-of-the-Week thread tells you who built it, why, and what they'd do differently. One announces, one explains."

---

## Notes

**This is a TEMPLATE STUB.** Before posting, fill in the placeholders below by reading on-chain state and DM'ing the curator. Do not post with `<...>` placeholders intact.

### Pre-post checklist (do all of these in the same sitting Tue Jun 2 evening or Wed Jun 3 morning)

1. **Identify the curator.** Pull the first qualifying basket from `/operators` Curators leaderboard as of Wed Jun 3 morning. Qualifying = basket created during Season 1, ≥3 assets registered, reserve floor set, ≥1 perp allocation, non-zero TVL from at least one external depositor.
2. **DM the curator** for two one-line quotes:
   - Why this basket / why now (Tweet 2 quote).
   - What they'd change next time (Tweet 4 quote).
3. **Read on-chain state** at `<basket-address>` for Tweet 5 numbers — capture the block number used so we can reproduce.
4. **Confirm the curator's X handle** matches the off-chain mapping captured at vault creation.
5. **Get the curator's RT pre-confirmation** so the spotlight gets quote-tweeted from their handle within an hour.

### Placeholder variables to replace

- `<curator-handle>` — confirmed X handle
- `<basket-name>` — the basket's display name on `/baskets`
- `<basket-address>` — basket vault address
- `<basket-explorer-url>` — block explorer or `/baskets/[address]` URL
- `<asset-list>` — comma-separated tickers
- `<deposit-fee-bps>`, `<redeem-fee-bps>`, `<reserve-bps>`, `<reserve-pct>` — current on-chain values
- `<tvl>`, `<perp-pct>`, `<position-count>`, `<days>`, `<unique-depositors>` — current state values

### Posting cadence

- Wed Jun 3 ~15:00 UTC (within the optimal 14:00-17:00 weekday window).
- Tag @<curator-handle> in Tweet 1 only — keeps the rest of the thread reading naturally.
- Quote-tweet Tweet 1 from the founder's personal handle 2-3h later with a one-liner: "Read this if you're thinking about your reserve policy."
- Schedule the next Wednesday's OOTW thread on the calendar — this becomes a recurring weekly slot through Season 1 (Jun 10 = OOTW #2, Jun 17 = OOTW #3).

### Brand voice reminders

- Smart colleague at a conference. Not meme-y. Not corporate. Quotes from the curator should feel like real operator-talk; if a quote sounds like marketing copy, push back in DMs and ask for the actual answer.
- No emoji. Zero or one hashtag per tweet.
- Operator-voice canonical phrases that fit naturally if the quote calls for them: "portfolio value and exit liquidity are not the same thing", "reserve depth is a product-quality parameter".
