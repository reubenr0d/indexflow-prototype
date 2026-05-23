# X (Twitter) Thread Draft

---

## Metadata

- **Topic:** Operator of the Week #3 — Season 1 Week 4 spotlight (curator TBD; institutional / AIFM-licensed flavor available)
- **Pillar:** P4 Operator Stories
- **Calendar week:** Week 4 (Season 1) — Wed Jun 17, third Operator-of-the-Week thread
- **Source:** `/operators` page, the curator's basket page at `/baskets/<address>`, a 15-minute DM/Telegram interview with the curator pre-post
- **Hook type:** Personal Story

---

## Pre-post fill-in instructions

This is a **template stub**. Before posting, fill in every `<...>` placeholder with the real values pulled from the curator's basket and a quick interview. The shape mirrors the Week 2 and Week 3 Operator-of-the-Week spotlights so the audience has a recognizable cadence by Week 4.

Required pre-post inputs (collect Mon Jun 15 / Tue Jun 16 so the thread is ready Tue evening):

1. `<curator-handle>` — the curator's X handle, exactly as it appears on the profile (with the `@`).
2. `<curator-context>` — one phrase identifying them. Use the **institutional flavor** if Curator 3 is a licensed manager: "an AIFM-licensed fund manager", "a MiFID investment firm operator", "a SEC RIA running a side allocation". Otherwise use the **default flavor**: "a crypto-native curator from `<scene/ecosystem>`", "a long-time DeFi systems builder", etc.
3. `<basket-name>` — the human label the curator uses for the basket. Falls back to the address if there isn't one.
4. `<basket-thesis>` — one sentence on what the basket expresses. Either a tradable thesis ("mid-cap mining majors with funding-rate carry") or a structural one ("an income sleeve for a fund's discretionary mandate").
5. `<reserve-bps>` — the curator's `minReserveBps` choice, e.g. `2000` for 20%.
6. `<fee-bps>` — the manager fee in bps, e.g. `50` for 50bps.
7. `<change-next>` — the curator's own one-line answer to "what would you change next?". Use the words they actually said.
8. `<basket-address>` — the deployed basket address, used for the `/baskets/<address>` deeplink.
9. **(institutional flavor only)** `<fund-wrapper>` — short label for the regulated wrapper, e.g. "their AIFM-managed Cayman AIF", "their MiFID-licensed UCITS sleeve", "their SEC RIA's separately managed account". Per `docs/REGULATORY_ROADMAP_DRAFT.md` institutional-access section, this anchors the bring-your-own-license narrative inside a real operator's footprint.

If the curator is a licensed manager, lead with **Tweet 1A** below. If not, lead with **Tweet 1B**. Pick exactly one.

---

## Thread (6 tweets)

### Tweet 1A -- Hook (institutional flavor, use if Curator 3 is a licensed manager)

`<curator-handle>` runs `<fund-wrapper>`. They built their first IndexFlow basket inside their existing fund wrapper this week.

Same compliance pattern they already use for Uniswap and Aave. New execution infrastructure. Here's what they shipped and why.

### Tweet 1B -- Hook (default flavor, use if Curator 3 is not a licensed manager)

`<curator-handle>` is `<curator-context>`. They built `<basket-name>` on testnet this week, picked an unusual reserve and fee policy, and answered our questions on why.

Here's the operator's view of one basket.

### Tweet 2 -- Why this basket

`<basket-name>` is `<basket-thesis>`.

The pitch in one line: *"<one-sentence quote from the curator on why this exposure now>"*.

Asset set on the basket page; the underlying narrative is the operator's, not ours.

### Tweet 3 -- Reserve and fee policy

Reserve floor: `<reserve-bps / 100>`% of NAV, enforced in `BasketVault.allocateToPerp()`. Manager fee: `<fee-bps>` bps.

Their reasoning: *"<one-line quote — usually a redemption-headroom or fund-flow argument>"*.

Reserve depth is a product-quality parameter, not a treasury setting.

### Tweet 4 -- What worked

What surprised the curator: *"<one-line quote on something that went better than expected>"*.

Typical answers from Week 2/3 spotlights: the `topUpReserve()` non-dilutive top-up, the `getRequiredReserveUsdc()` floor in the UI, the speed of the perp allocation loop.

### Tweet 5 -- What they'd change

What `<curator-handle>` would change next: `<change-next>`.

We log every spotlight's "what next" answer; the recurring requests become the Season 2 backlog.

### Tweet 6 -- CTA

Clone the basket — the address is the parameter set, not the strategy. Fork your own and adjust the assets, reserve, fees.

[link to /baskets/<basket-address>?utm_source=x&utm_campaign=spotlight-w4-curator-3 — or, if cloning isn't wired by Wed Jun 17, link to /operators with the same utm tags]

---

## Standalone Tweets (extract 3-5 from thread)

> Fill these in after the thread is finalized. Pull the quote tweets from Tweet 2 (basket thesis), Tweet 3 (reserve reasoning), Tweet 4 (surprise), and Tweet 5 (what's next). The institutional-flavor standalone — "`<curator-handle>` runs `<fund-wrapper>` and just shipped their first IndexFlow basket inside it" — is the screenshot-shareable one if Curator 3 is a licensed manager.

1. *(quote-tweet from the basket-thesis line in Tweet 2)*
2. *(quote-tweet from the reserve-and-fee line in Tweet 3)*
3. *(quote-tweet from the "what worked" line in Tweet 4)*

---

## Notes

- This is the **third Operator-of-the-Week spotlight** of Season 1. Cadence by Week 4 should feel familiar to followers; resist re-templating the format.
- Posting window: 15:00 UTC Wed Jun 17 (US morning + EU afternoon). Quote-tweet `<curator-handle>` in the thread so they get the notification and can amplify on their side.
- **DM workflow:** reach out to `<curator-handle>` on Mon Jun 15 with the four interview prompts (why this basket, reserve reasoning, what worked, what they'd change). Lock content by Tue Jun 16 EOD; final voice pass Wed morning. Send a draft for their sign-off before the curator quote-tweets it — the spotlight should not be the first they see of it.
- **Institutional flavor choice:** if Curator 3 is a licensed manager, this thread becomes the Week 4 Track A *living proof* — the Monday bring-your-own-license thread (theoretical) followed by a real operator demonstrating it (concrete). Lean into the wrapper specifics in Tweet 1A and pull a quote from the curator about why permissionless execution infrastructure beat the alternatives they evaluated. If Curator 3 is not a licensed manager, fall back to the default flavor and treat this as a normal Week 2/3-shape spotlight; the bring-your-own-license narrative still holds on its own from Mon/Tue.
- [IMAGE: candidate for tweet 1 — screenshot of the basket page at `/baskets/<basket-address>` showing the basket name, the reserve panel, the asset list, and the operator's handle. Visual tweets get ~150% more engagement.]
- Tweet 3 uses the canonical "Reserve depth is a product-quality parameter, not a treasury setting." line verbatim. Do not paraphrase.
- Brand voice: zero emojis, zero hashtags, no "thread on…", no "so…", no "okay…". Smart-colleague register, with the curator's own words quoted in full sentences (don't trim their phrasing).
- The Wed slot is the second-to-last operator amplification before the season closes Sunday — pair the spotlight with a soft mention of the 72-hour push coming Friday so the curator's reply audience sees the season-close motion before Friday morning.
