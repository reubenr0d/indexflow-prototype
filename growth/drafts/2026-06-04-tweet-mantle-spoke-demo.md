# X (Twitter) Tweet Draft

---

## Metadata

- **Topic:** Mantle partner co-tweet — hub-and-spoke topology demo (basket on Sepolia hub, deposit from Mantle spoke)
- **Pillar:** P3 Technical Credibility
- **Calendar week:** Week 2 (Season 1 — Mantle partnership slot, Cross-Chain Couriers preview)
- **Source:** `docs/CROSS_CHAIN_COORDINATION.md`, `docs/INVESTOR_FLOW.md` deposit routing section, `config/chains.json` hub/spoke roles
- **Hook type:** Data

---

## Tweet

Created a basket on Sepolia hub. Accepted a deposit from a Mantle spoke vault.

One basket, two chains, zero chain picker.

StateRelay-routed weights steer deposits to the chain that needs capital. Curator opens perps on the hub. Investors deposit wherever — same share price.

---

## Notes

### Partner coordination

- **Co-tweet target:** @Mantle_Official.
- **Coordinated post time:** Thu Jun 4, **15:00 UTC** (sits inside the 14:00-17:00 UTC weekday window from `growth/templates/tweet-thread.md`; matches Mantle's typical co-marketing slot).
- **Co-tweet sequencing:**
  1. We post this tweet from @IndexFlow at 15:00 UTC.
  2. @Mantle_Official quote-tweets it within ~10 minutes with a one-line take on hub+spoke basket vaults — coordinate the exact line in DMs the day before. Suggested angles for them: "shared perpetual liquidity treats every L2 as a deposit surface, not a separate venue", or "the right cross-chain UX is no UX".
  3. We reply to Mantle's quote-tweet from @IndexFlow with a link to `/operators` and the deeplink for `/baskets/new?utm_source=x&utm_campaign=mantle-spoke-demo`.

### Pre-post checklist

- Confirm the demo basket is actually live on Sepolia and a deposit has actually landed from a Mantle spoke `BasketVault` (not a mocked screenshot). The point is that this is a working testnet flow, not a vapor announcement.
- Verify routing weights in `StateRelay` on both chains — the Mantle spoke weight should be non-zero so the demo deposit doesn't revert at the `minDepositWeightBps` guard described in `docs/INVESTOR_FLOW.md`.
- Have the Mantle handle correct (`@Mantle_Official` per `growth/X_GROWTH_PLAN.md` Partnerships Tracker; double-check before scheduling).

### Brand voice

- Data hook. No emoji. Zero hashtags. The "one basket, two chains, zero chain picker" line is the meme — preserve it through any voice pass.
- "The user should never pick the chain. The protocol should." is a canonical key phrase; this tweet enacts it without quoting it. Save the literal phrase for a follow-up standalone in Week 4.

### Optional asset

- A small diagram (hub-and-spoke topology with a basket icon on Sepolia and a deposit arrow from Mantle) would lift engagement ~150% per the template guidance. Not required — the narrative carries on its own and partner co-tweets typically pull the visual from the partner's side.
- If we do attach an image, mark it `[IMAGE: hub-and-spoke topology — Sepolia hub with basket vault, Mantle spoke with deposit arrow, StateRelay weight badges on both]`.

### Calendar follow-up

- Quote-tweet this from @IndexFlow Friday morning Jun 5 with a one-line summary as the X-template recommends. Use the canonical phrase: "Six contracts, zero chain pickers."
- Use this thread as the reference example in the Sun Jun 14 Cross-Chain Couriers + Nox standalone (`2026-06-14-tweet-nox-mpc-signing.md`) when describing the spoke-side flow.
