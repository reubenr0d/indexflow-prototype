# Atlas Quality Matrix Skill

Your capabilities for scoring mining companies against the in-house analyst's 8-category Quality Matrix. The `atlas-quality-mcp` server reads raw Atlas data (read-only) and computes tiers in JS using `scoring/matrix.json` as the literal source of truth.

## Tier vocabulary (uniform across every signal)

- `exceptional` — top-decile signal (numeric breakpoint at the analyst's P95) or strongest qualitative tier label.
- `strong` — clearly above average.
- `moderate` — typical for the category (workbook median).
- `weak` — sub-standard.
- `redFlag` — critical issue. In categories marked `criticalRedFlag: true` (permitting, dilution, schedule, capex, grade reconciliation, financing) this is a short trigger.
- `unknown` — Atlas does not currently expose the field. The composite scorer **re-normalises across non-Unknown categories** so this does not penalise the company. Three signals (Drill Hole Orientation, Drill Spacing, Location Context) are flagged `notInWorkbookSchema` and will always be Unknown until the data pipeline is extended.

## Composite scoring

```
composite = Σ (categoryScore × weight × provenanceFactor) / Σ effectiveWeights
```

Default weights from `matrix.json`:

| Category          | Weight |
| ----------------- | ------ |
| Drilling          | 35%    |
| Resources         | 20%    |
| Economic Studies  | 15%    |
| Metallurgy        | 10%    |
| Permitting        |  5%    |
| Offtake           |  5%    |
| Capital Raises    |  5%    |
| Construction      |  5%    |

`provenanceFactor`:
- `1.0` for categories with at least one `EMPIRICAL` signal (Drilling is the only one calibrated against real workbook data today).
- `provenanceDiscount` (default `0.7`) for categories whose every signal is `PUBLISHED_REFERENCE_ONLY`. The analyst explicitly flagged Resources / Met / Econ / Permitting / Offtake / Capital Raises / Construction as published-reference-only until they're calibrated against real data. The discount is configurable in `matrix.json`.

Composite tier from numeric composite:
- `≥90` → exceptional
- `≥70` → strong
- `≥50` → moderate
- `≥25` → weak
- `<25` → redFlag

## Tools

### get_quality_matrix_definition({ section? })

Returns the analyst's matrix verbatim from `matrix.json`. Call this **once** at the start of a run so your reasoning matches the same source of truth the scorer uses.

- `section` (optional) — `'drilling' | 'resources' | 'metallurgy' | 'economicStudies' | 'permitting' | 'offtake' | 'capitalRaises' | 'construction' | 'drillProgramSubRubric' | 'compositeWeights' | 'provenanceDiscount' | 'tierScores'`. Omit to receive the whole matrix.

Includes every signal's `tiers`, `whatDrivesTheBadge`, `caveatDepositTypeNuance`, `sourceLinks[]`, `workbookAnchors[]`, `provenance`, and `dataQualityWarnings[]`. When `section: 'drilling'` is requested the response also includes the `depositTypeAdjustments` table from `depositTypes.json`.

### get_quality_top_picks({ limit?, minCompositeScore?, commodity?, exchange?, watchlistOnly? })

Ranked composite top-N. Filters the universe via Atlas baskets, enriches the top ~30 with `/dashboard/company/{ticker}/profile` + `/dashboard/stocks/events`, scores each via `matrix.js`, returns the top-N by composite score.

- `limit` (default 10, max 30) — number of picks to return.
- `minCompositeScore` (default 0) — minimum composite score filter.
- `commodity` (optional) — filter universe by primary commodity (`'gold'`, `'copper'`, `'lithium'`, `'silver'`, `'uranium'`, `'nickel'`, `'iron'`, `'lead'`, `'zinc'`).
- `exchange` (optional) — filter universe by exchange code (`'TSX'`, `'TSXV'`, `'ASX'`, `'LSE'`, `'CSE'`, `'JSE'`, `'NYSE'`, `'NASDAQ'`).
- `watchlistOnly` (optional, default false) — if true, restrict universe to vault_fit_tier A+ / A names only.

Each pick:

```
{
  ticker, exchange, yahooSymbol, name,
  primaryCommodity, marketCapUsd,
  compositeScore,    // 0-100
  tier,              // exceptional | strong | moderate | weak | redFlag
  categoryScores: {
    drilling:         { score, tier, provenanceDiscounted },
    resources:        { ... },
    economicStudies:  { ... },
    metallurgy:       { ... },
    permitting:       { ... },
    offtake:          { ... },
    capitalRaises:    { ... },
    construction:     { ... }
  },
  unknownCategoryCount,
  _explain: { compositeWeights, provenanceDiscount }
}
```

Use the `yahooSymbol` directly with `wire_asset` / `yfinance_quote` / `yfinance_news`. Tickers come from Atlas without exchange suffixes and the MCP applies the correct one (`.V` / `.AX` / `.TO` / `.L` / `.CN` / `.JO`); NYSE/NASDAQ stay unsuffixed.

### get_quality_company_card({ ticker, exchange? })

Full per-signal tier card for one company. Every category, every signal, with tier, raw value, provenance, analyst caveat, source link, matched workbook anchor, and `_explain` array. **Use this payload as `justification` content** when opening positions: quote the top 2 contributing signals (e.g. `"Exceptional GT=754 (NGEx Lunahuasi anchor); Strong Cu grade 2.25% over 335m"`).

Returns:

```
{
  ticker, yahooSymbol, name, exchange,
  primaryCommodity, marketCapUsd,
  composite: { composite, tier, weightsUsed, provenanceDiscount, perCategory, tierScores },
  categoryResults: {
    drilling: {
      category, tier, categoryScore, provenance,
      signals: [{ signalId, signalName, tier, raw, bandLabel, provenance,
                  whatDrivesTheBadge, caveatDepositTypeNuance, sourceLinks,
                  anchorMatch, dataQualityWarnings, _explain[] }],
      unknownSignals: [{ signalId, signalName, reason, recoveryHint, notInWorkbookSchema }]
    },
    resources: { ... },
    metallurgy: { ... },
    economicStudies: { ... },
    permitting: { ... },
    offtake: { ... },
    capitalRaises: { ... },
    construction: { ... }
  }
}
```

### get_quality_short_candidates({ limit?, excludeTickers? })

Scans for Red-Flag signals in critical categories. Returns candidates outside your current quality top-N each with a citable bearish payload — the specific `criticalRedFlag` signal name, tier, raw value, source link from the matrix.

- `limit` (default 5, max 20).
- `excludeTickers` (default `[]`) — your current quality top-N tickers; they will be excluded from short candidates so you never short a name your own long model still likes.

Returns:

```
{
  asOfDate, count,
  shortCandidates: [{
    ticker, exchange, yahooSymbol, name,
    primaryCommodity, compositeScore,
    redFlagSignals: [{ signalId, signalName, category, raw, bandLabel,
                       whatDrivesTheBadge, sourceLinks, provenance }],
    _explain: { note, shortDirective }
  }]
}
```

The agent **must still pair each Red-Flag signal with a concrete bearish headline** from `yfinance_news` before opening a short; quote both in the short's `justification`.

### classify_drill_release_text({ text })

Debug helper. Pass a drill release headline + summary; returns the matched 58-signal sub-rubric breakdown (which phrases triggered which weights) and the final classification:

```
{
  classifiedAs: "exceptional" | "strong" | "moderate" | "weak" | "redFlag" | "unknown",
  resourceTotal, explorationTotal,
  summary: "resource:N exploration:M -> classifiedAs",
  matchedSignals: [{ category, phrase, resourceWeight, explorationWeight, tierHint }]
}
```

## Example calls

```
get_quality_matrix_definition()           // once at start of run
get_quality_top_picks({ limit: 12, minCompositeScore: 75 })
get_quality_company_card({ ticker: "GSR" })
get_quality_short_candidates({ limit: 5, excludeTickers: ["GSR", "PWM", "AHR"] })
classify_drill_release_text({ text: "Madsen resource conversion drilling intersects 5.2 g/t..." })
```

## Tips

- `tier` is the *qualitative* label; `compositeScore` is the *numeric* value (0-100). Use `compositeScore` to rank, `tier` to talk about it.
- When a category appears with `score: null` in `compositeScore.perCategory`, it was re-normalised out because every signal was Unknown — not because the company failed. Junior explorers will routinely have null scores on Resources / Econ / Construction.
- The `_explain` array on every signal quotes the analyst's `whatDrivesTheBadge` text + the matched workbook anchor. This is exactly what investor-facing justifications should cite.
- A `provenanceDiscounted: true` flag on a category score means the analyst hasn't empirically calibrated that category yet; the score is scaled down by `provenanceDiscount` (default 0.7) before contributing to the composite.
- Data-quality warnings (e.g. PMET caesium contamination on lithium) automatically convert a misleading signal back to Unknown — do NOT manually override them in justifications.
- The matrix is editable: changing thresholds means editing `apps/mcps/atlas-quality/scoring/matrix.json`, not JS code. Reuse `get_quality_matrix_definition()` to see the live state.
