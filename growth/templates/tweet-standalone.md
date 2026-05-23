# X (Twitter) Standalone Tweet Template

> Copy this file to `growth/drafts/YYYY-MM-DD-tweet-<slug>.md` and fill in. Single-tweet variant of [`tweet-thread.md`](./tweet-thread.md). Standalones live next to threads in `growth/drafts/`.

---

## Metadata

- **Topic:** [One-line description]
- **Pillar:** [P1-P6]
- **Calendar week:** [Week N — Mon YYYY-MM-DD → Sun YYYY-MM-DD]
- **Source:** [Blog post or doc this is atomized from, e.g. `docs/WHITEPAPER_DRAFT.md`]
- **Hook type:** [Data | Contrarian | Insider Knowledge | Curiosity Gap | Stakes | Personal Story]
- **Target CTA link:** `https://indexflow.app/<path>?utm_source=x&utm_campaign=<slug>`

---

## Hook Type Reference

Pick one. For a standalone, the hook **is** the tweet — there's no second tweet to bail out into. Lead with the most interesting or surprising point.

| Type | Pattern | IndexFlow Example |
| ---- | ------- | ----------------- |
| **Data** | Open with a specific number that reframes what the audience cares about | "89% of DeFi vault TVL has no explicit redemption policy. That's not a feature -- it's a bug." |
| **Contrarian** | Take a position against a widely accepted belief | "Your vault's TVL is not your exit liquidity. Most protocols pretend otherwise." |
| **Insider Knowledge** | Promise exclusive information most people don't have | "We read every on-chain basket protocol's contracts. Here's the one thing none of them handle." |
| **Curiosity Gap** | Open incomplete so the reader needs the answer (or the link) | "There's a number every vault investor should check before depositing. Almost nobody does." |
| **Stakes** | Show what readers lose by not having the information | "If your vault protocol can't tell you the difference between NAV and redeemable liquidity, you have a problem." |
| **Personal Story** | Open with a specific, genuine moment from experience | "Three months on GMX v1 taught me one thing about shared liquidity nobody else writes about." |

**Avoid:** "thread on...", "I've been thinking about...", "Here are my thoughts on...", "So...", "Okay..." — these openers signal low-effort content and the X algorithm penalises them on dwell time.

---

## Body (single tweet, ≤280 chars)

> The whole tweet. Open with the hook, close with the payoff. If a CTA link is needed, include it on its own line at the end (links count for ~23 chars in X's renderer).

[Write the tweet — max 280 chars]

Character count budget if the tweet carries a link: ≤257 chars of prose + the URL.

---

## Image (optional)

If the tweet includes a screenshot or diagram, note it as `[IMAGE: description]` with alt-text. Visual tweets get ~150% more engagement on average.

- **Image description:** [What's in the image — e.g. "screenshot of `/baskets/new` form with three assets pre-filled"]
- **Alt text (accessibility, max 1000 chars):** [Plain-language description of what's in the image for screen readers and visually impaired readers]
- **Source file (if a diagram):** [Repo path to the source SVG/figma export, e.g. `growth/grants/indexflow-header-1500x500.svg`]

---

## CTA

If the standalone is a launch / push / link beat, the CTA is the link line at the end of the body. If the standalone is pure thought leadership (no link), the CTA is implicit — the next tweet in your timeline benefits from the engagement velocity.

- **Primary CTA link:** [Same as `Target CTA link` above]
- **CTA verb (if any):** [e.g. "open one", "claim your tier", "fork the agent", "join the Spaces"]

---

## Quote-tweet plan

Per the convention in [`tweet-thread.md`](./tweet-thread.md): quote-tweet the standalone with a one-line summary or sharper rephrase 2–3 hours after posting if engagement is climbing. The quote-tweet is where you push a link if the original tweet was link-free; this is how you keep the original hook clean while still capturing click-through.

- **Quote-tweet draft (if planned):** [One-line summary or sharper rephrase, ≤280 chars]
- **Quote-tweet trigger condition:** [e.g. "if impressions cross 5k in the first 2h"]

---

## Notes (brand-voice reminders)

Apply every time before posting:

- **Brand voice:** "Smart colleague at a conference" — precise, systems-language, confident. Not meme-y, not corporate.
- **No hashtag spam.** Zero or one hashtag per tweet, max. Hashtags do not help X distribution in 2026 and they read as low-effort.
- **No emojis** unless a canonical key phrase contains one (none of IndexFlow's do).
- **Avoid bail-out openers:** "Thread on…", "So…", "Okay…", "I've been thinking about…". These signal low-effort content and the X algorithm penalises them on dwell time.
- **One idea per tweet.** A standalone fails if it tries to compress a thread; better to defer and post a thread instead.
- **Canonical key phrases** to seed naturally where they fit (from [`growth/README.md`](../README.md)):
  - "Portfolio value and exit liquidity are not the same thing."
  - "Reserve depth is a product-quality parameter, not a treasury setting."
  - "Many baskets, one trading engine."
  - "NAV does not mean redeemable liquidity."
  - "Six contracts, zero chain pickers."
  - "Route by depth, not by default."
  - "TWAP the pool, sync the state, route the intent."
- **Quote-tweet rule:** if the standalone pops (impressions accelerating after 1–2h), quote-tweet it with a one-line sharper rephrase 2–3h after posting. This is the easiest way to double a standalone's reach without writing a thread.
- **File location:** standalones live next to threads in `growth/drafts/` with the naming `YYYY-MM-DD-tweet-<slug>.md`. The scheduled date for the standalone lives in [`growth/X_CONTENT_CALENDAR.md`](../X_CONTENT_CALENDAR.md).
