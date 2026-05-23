# X (Twitter) Thread Draft

---

## Metadata

- **Topic:** Build your first IndexFlow basket on testnet in six steps
- **Pillar:** P1 Vault Operator Education + P4 Operator Stories
- **Calendar week:** Week 2 (Season 1 — Track B / Curators headline thread)
- **Source:** `docs/ASSET_MANAGER_FLOW.md`, `/baskets/new` flow, `apps/web/src/app/baskets/new/`
- **Hook type:** Curiosity Gap

---

## Thread (9 tweets)

### Tweet 1 -- Hook

Build your first IndexFlow basket in 10 minutes.

Six steps. Two contracts. One screenshot at each.

By the end you'll have a live testnet vault, a reserve floor, a perp leg, and the auto-broadcast bot tweeting your basket address.

### Tweet 2

Step 1 — Connect.

Open indexflow.app and click Connect Wallet. Privy gives you a smart wallet with the same address on every chain. MetaMask works too. For the full operator flow you want to be on Sepolia — that's where perp allocation lives.

### Tweet 3

Step 2 — Create the basket.

On /baskets/new, name it and set fees. Default: 50 bps deposit, 50 bps redeem. Real enough to model revenue, low enough not to scare deposits. Up to 500 bps each, and setFees lets you change them later.

[IMAGE: screenshot of /baskets/new with name + fee fields filled in, "Create basket" button visible]

### Tweet 4

Step 3 — Register your assets.

A basket needs at least one asset that's active in the OracleAdapter. BHP.AX is bootstrapped on testnet via the Yahoo Finance relayer. Need something else? Admin → Assets adds it, then setAssets wires it to the vault.

[IMAGE: screenshot of /admin/assets showing BHP.AX active, then the basket setAssets call selecting it]

### Tweet 5

Step 4 — Set the reserve floor.

setMinReserveBps(2000). 20% of vault USDC stays idle and untouchable by allocateToPerp. That's the redemption buffer — the cushion investors exit through.

Reserve depth is a product-quality parameter, not a treasury setting.

[IMAGE: vault settings panel showing minReserveBps = 2000 / 20%]

### Tweet 6

Step 5 — Put capital to work.

allocateToPerp(amount) moves USDC from the vault to VaultAccounting on Sepolia. The contract checks getAvailableForPerpUsdc() first — you can't push reserves below your floor. openPosition then opens a leveraged leg in the vault's name.

[IMAGE: tx confirmation for allocateToPerp + the basket detail page showing perpAllocated > 0]

### Tweet 7

Step 6 — Watch it go live.

Your basket appears in /baskets within seconds. Then @IndexFlowBots picks up the BasketCreated event and tweets it: address, curator handle, first asset.

You're an operator. Depositors can find you on two surfaces by the next block.

### Tweet 8

Why do this on testnet during Season 1:

- Curator points on the /operators leaderboard
- USDC rewards via Boost.xyz One-Time Actions on BasketCreated, AssetRegistered, AllocateToPerp
- Earlier mainnet whitelist priority for operators who actually maintain their vaults

Active beats one-and-done.

### Tweet 9 -- CTA

indexflow.app/baskets/new?utm_source=x&utm_campaign=build-a-basket-w2

10 minutes. Six contracts. One basket.

The /operators page tracks every Season 1 curator — yours included once the bot fires.

---

## Standalone Tweets (extract 3-5 from thread)

1. Reserve depth is a product-quality parameter, not a treasury setting. setMinReserveBps(2000) is the line between a vault investors trust and one they can't redeem from. 20% on testnet is a sensible default; 40% if you expect volatility.

2. If you've never touched a perp before, the IndexFlow testnet flow is the lowest-stakes way to learn. allocateToPerp + openPosition are two function calls. The contracts enforce every safety rail — reserve floor, max position size, available capital.

3. Operator economics on IndexFlow: 50 bps in, 50 bps out, plus whatever PnL the perp leg generates. Fees accrue separately from NAV in `collectedFees` so they don't inflate share price. collectFees() sweeps them whenever you want.

4. Six steps from no basket to live testnet vault: connect, create, register, reserve, allocate, broadcast. The hardest part is picking the name.

5. Every new IndexFlow testnet basket gets posted by @IndexFlowBots within seconds of the BasketCreated event. Build a basket in 10 minutes and the bot does your launch announcement for you.

---

## Notes

- This is the recurring weekly Track B / Curators thread for Season 1 Week 2. Re-run with fresh screenshots each week; the structure stays.
- All four [IMAGE] placeholders are screenshots of the actual web UI — capture them on the live testnet right before posting (don't reuse stale screenshots, the UI ships on most weeks).
- Tweet 5 is the canonical-key-phrase tweet (`reserve depth is a product-quality parameter, not a treasury setting`). Quote-tweet it 2-3 hours after the thread lands.
- Tweet 7 introduces @IndexFlowBots — pair this thread with the Tue Jun 2 standalone (`2026-06-02-tweet-auto-broadcast-pattern.md`) so the bot account picks up follows from this thread's traffic.
- CTA `utm_campaign=build-a-basket-w2` so we can tie new BasketCreated events back to this specific thread in the Envio query.
- 50/50 bps is the default I'm picking for the testnet walk-through (matches the existing local-deploy script's posture; conservative enough not to mislead anyone). If the deploy script's defaults change, update this draft.
- 2000 bps / 20% reserve recommendation per `docs/ASSET_MANAGER_FLOW.md` "20-30% in calm markets" rule of thumb.
- Brand voice: precise, systems-language, confident. No emoji, zero hashtags. Avoid "thread on...", "okay...", "so..." openers.
- Threads perform best 14:00-17:00 UTC on weekdays (per `growth/templates/tweet-thread.md`). Mon Jun 1 is a normal weekday in 2026, so target ~15:00 UTC.
