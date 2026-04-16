# Blog Post Template

> Copy this file to `growth/drafts/YYYY-MM-DD-blog-<slug>.md` and fill in.

---

## Metadata

- **Title:** [Working title]
- **SEO title:** [Under 60 chars -- this is what appears in search results]
- **Meta description:** [Under 155 chars -- search result snippet]
- **Pillar:** [P1 Vault Operator Education | P2 Market Thesis | P3 Technical Credibility | P4 Operator Stories | P5 Regulatory Clarity | P6 Unit Economics]
- **Target audience:** [Asset managers | Fintech/fund managers | Institutional issuers | RWA operators]
- **Funnel layer:** [L1 Generate | L2 Capture | L3 Manage | L4 Close]
- **Temperature:** [Cold | Warm | Hot]
- **Hook type:** [Data | Contrarian | Insider Knowledge | Curiosity Gap | Stakes | Personal Story]
- **Target word count:** 1500-2500
- **Source docs:** [List the docs/ files or sections this draws from]
- **Publish to:** Blog
- **Cross-post atomization:**
  - [ ] X thread drafted
  - [ ] Standalone tweets extracted
  - [ ] LinkedIn post drafted
  - [ ] Substack mention planned
  - [ ] Telegram pin scheduled

---

## Outline

### Hook (1-2 paragraphs)

> Open with one of the six hook types (see tweet-thread.md for reference). The reader should know within 30 seconds why this matters to them. Never open with a definition.

[Write hook here]

### Context / Why Now (2-3 paragraphs)

> Set the stage. What's happening in the market or the protocol that makes this timely?

[Write context here]

### Core Argument (3-5 sections, each 2-4 paragraphs)

> The meat of the post. Each section should make one clear point, supported by evidence (on-chain data, architecture details, comparisons, diagrams).

#### [Section 1 title]

[Content]

#### [Section 2 title]

[Content]

#### [Section 3 title]

[Content]

### So What? / Implications (2-3 paragraphs)

> What does this mean for the reader? Connect back to the broader thesis.

[Write implications here]

### Call to Action

> One clear next step: try the testnet, join Telegram, read the whitepaper, etc.

[Write CTA here]

---

## Framing Checklist

Before publishing, verify:

- [ ] Opens with a hook, not a definition
- [ ] Includes at least one "conventional wisdom is wrong" moment
- [ ] Contains a concrete example or worked number (not just abstractions)
- [ ] Ends with a single, unmissable CTA
- [ ] Is 80% education, 20% IndexFlow
- [ ] Has at least one custom illustration, diagram, or code snippet (prefer custom SVG illustrations over mermaid flowcharts -- see `apps/web/public/blog/*.svg` for the visual language: dark background, teal `#2dd4bf` accent, `#38bdf8` sky secondary, glow filters, dashed flow lines, system-ui font)
- [ ] Key phrases used where natural (see growth/README.md "Key Phrases" section)

## Notes

- Keep paragraphs to 3-4 sentences max for readability.
- Front-load value -- assume 70% of readers drop off after the hook.
- Link back to relevant docs/ pages for technical depth.
- Brand voice: "smart colleague at a conference" -- precise, systems-language, confident. Not meme-y, not corporate.
- **Illustrations**: prefer custom SVG illustrations (saved to `apps/web/public/blog/`) over mermaid flowcharts. Mermaid is acceptable for inline contract/architecture diagrams in technical posts, but conceptual diagrams (flywheels, comparisons, data visualizations) should use hand-crafted SVGs matching the landing page visual language. Reference existing SVGs in `apps/web/public/blog/` and primer components in `apps/web/src/components/primer/` for style.
