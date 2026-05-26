# X (Twitter) Thread Draft

---

## Metadata

- **Topic:** NAV is not exit liquidity — the design constraint every vault protocol ignores
- **Pillar:** P1 Education
- **Calendar week:** Week 1 (Season 1) — Tue May 26 launch thread
- **Source:** `docs/WHITEPAPER_DRAFT.md` (NAV vs redeemable section), `docs/SHARE_PRICE_AND_OPERATIONS.md` (NAV mechanics, pending redemption queue)
- **Hook type:** Contrarian
- **Posted:** https://x.com/indexflowDAO/status/2059141832618205409

---

## Thread (9 tweets)

### Tweet 1 -- Hook

NAV is not exit liquidity.

Every basket protocol publishes a single number and calls it the vault's value. Almost none of them tell you what's actually withdrawable right now.

That gap is where holders get hurt. 🧵

### Tweet 2

The conflation is structural. Most vault contracts compute share price as `totalValue / totalSupply`, where totalValue includes idle cash, capital deployed into strategies, and unrealized PnL.

That is a fair valuation. It is not a redemption promise.

### Tweet 3

At redemption, only one of those buckets matters: idle reserves. The rest has to be unwound — close a perp, exit a position, bridge from another chain.

Unwinding under stress is exactly when execution is worst. Holders find this out at the worst possible moment.

### Tweet 4

There is a name for the buffer that determines how many holders can walk out the door at par: reserve depth. Most vaults treat it as a treasury setting.

Reserve depth is a product-quality parameter, not a treasury setting. It belongs in the product spec, not the multisig agenda.

### Tweet 5

Run the math on any basket that lists a fixed allocation target — 90% deployed, 10% reserve — and ask: at what redemption volume does the 10% break?

On a typical mid-cap vault, surprisingly low. The thinner the reserve, the closer the protocol runs to a queue.

[IMAGE: screenshot of /baskets/[address] detail page — reserve panel showing idleUSDC, perpAllocated, and the `getRequiredReserveUsdc()` floor side-by-side]

### Tweet 6

IndexFlow treats this as the central design constraint. Every basket has a `minReserveBps` set by the operator.

`allocateToPerp()` reads `getAvailableForPerpUsdc()` and refuses to drain the reserve below that floor. Reserve policy is enforced in the contract, not the dashboard.

### Tweet 7

Anyone — operator, depositor, partner — can call `topUpReserve()` to add USDC to the basket without minting new shares. NAV rises pro rata across existing holders.

A non-dilutive reserve top-up. Mint and redeem stay NAV-priced. No special accounting.

### Tweet 8

When local reserves can't cover a redemption, the vault doesn't revert. It pays what it can, locks the rest as a `PendingRedemption`, and emits an event. A keeper bridges USDC from a chain with excess reserves via CCIP and the fill completes.

No silent failures. No frozen withdrawals.

### Tweet 9 -- CTA

Portfolio value and exit liquidity are not the same thing.

The fix isn't better marketing. It's making redemption quality a first-class product parameter and enforcing it in the contract.

Open the testnet, set a reserve, allocate to perp. Feel it yourself.

[link to /operators with utm tags: utm_source=x&utm_campaign=nav-thread]

---

## Standalone Tweets (extract 3-5 from thread)

1. "Every basket protocol publishes a single number and calls it the vault's value. Almost none of them tell you what's actually withdrawable right now. NAV is not exit liquidity."

2. "Reserve depth is a product-quality parameter, not a treasury setting. It belongs in the product spec, not the multisig agenda."

3. "At redemption, only one bucket matters: idle reserves. The rest has to be unwound. Unwinding under stress is exactly when execution is worst."

4. "Non-dilutive reserve top-ups: anyone can call `topUpReserve()` to add USDC to a basket without minting new shares. NAV rises pro rata across existing holders. Mint and redeem stay NAV-priced."

5. "When local reserves can't cover a redemption, the vault doesn't revert. It pays what it can, locks the rest as a PendingRedemption, and a keeper bridges USDC from a chain with excess reserves. No silent failures."

---

## Notes

- This is the signature thread of Season 1. Every subsequent thread points back to it. The hook in Tweet 1 needs to be screenshot-able on its own — keep it tight.
- The canonical key phrases ("Portfolio value and exit liquidity are not the same thing", "Reserve depth is a product-quality parameter, not a treasury setting") are placed in Tweet 9 and Tweet 4 respectively — the two screenshot-prone slots.
- Tweet 5 image: prefer a real `/baskets/[address]` screenshot once the reserve panel exists. If it's not built yet on Sepolia testnet by Tue morning, fall back to a Figma mock matching the landing-page visual language (dark bg, teal accent).
- Tweet 9 CTA: link to `/operators` first; if `/operators` is not live by Tue, fall back to `/baskets` with the same utm tags and re-point on Wed.
- Posting window: 14:00–17:00 UTC Tue May 26 (post-Memorial-Day, US lunch + EU evening).
- Quote-tweet the hook with the canonical "Portfolio value and exit liquidity are not the same thing" line 2-3 hours after posting for a second reach pulse.
- Brand voice: precise, systems-language, no exclamation marks. No emojis except the 🧵 thread marker in Tweet 1.
- ≤1 hashtag per tweet, zero used. Backticks around code symbols are intentional.
