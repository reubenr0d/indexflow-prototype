// ---------------------------------------------------------------------------
// Generic tier classifier
//
// Reads tier breakpoints from matrix.json. Handles the three breakpoint
// shapes the analyst uses:
//
//   1. numeric                  — { min?, max? }
//   2. numeric_with_width       — { min?, max?, minWidthM? } (gold UG, silver)
//   3. qualitative              — { label } only; caller matches phrase
//
// Returns a uniform tier result. Caller decides what to do with `tier:
// "unknown"` (the matrix.js category scorer re-normalises across non-Unknown
// signals).
//
// NO HARD-CODED THRESHOLDS. Every number comes from matrix.json — edit the
// matrix to change behaviour.
// ---------------------------------------------------------------------------

const TIER_ORDER = ["exceptional", "strong", "moderate", "weak", "redFlag"];

/**
 * Classify a numeric value against a signal's tier band table.
 * @param {object} signal Matrix.json signal entry (must have .tiers).
 * @param {number|null|undefined} value Raw numeric value (g/t, %, m, years, etc.).
 * @param {object} [opts]
 * @param {number} [opts.widthM] Optional width-in-metres (for numeric_with_width tiers).
 * @returns {{ tier: string, raw: number|null, bandLabel: string|null, signalId: string, signalName: string, isUnknown: boolean }}
 */
export function classifyNumeric(signal, value, { widthM } = {}) {
  const base = {
    signalId: signal.id,
    signalName: signal.name,
    raw: value === undefined || value === null ? null : Number(value),
    bandLabel: null,
  };
  if (
    value === undefined ||
    value === null ||
    !Number.isFinite(Number(value))
  ) {
    return { ...base, tier: "unknown", isUnknown: true };
  }

  const numericValue = Number(value);
  const numericWidth = Number.isFinite(Number(widthM)) ? Number(widthM) : null;
  const direction = signal.tierDirection === "lower_is_better" ? "lower" : "higher";

  for (const tierName of TIER_ORDER) {
    const band = signal.tiers?.[tierName];
    if (!band) continue;

    const widthOk =
      band.minWidthM === undefined ||
      band.minWidthM === null ||
      (numericWidth !== null && numericWidth >= band.minWidthM);

    if (direction === "lower") {
      // For lower-is-better metrics (payback, dilution, capex overrun),
      // the bands in matrix.json are still expressed as { max, min } —
      // the standard min ≤ x < max check still works.
      const hitsMin =
        band.min === undefined || band.min === null || numericValue >= band.min;
      const hitsMax =
        band.max === undefined || band.max === null || numericValue < band.max;
      if (hitsMin && hitsMax && widthOk) {
        return {
          ...base,
          tier: tierName,
          bandLabel: band.label || null,
          isUnknown: false,
        };
      }
      continue;
    }

    // Higher-is-better default (grade, GT, recovery, IRR, NPV, etc.).
    const hitsMin =
      band.min === undefined || band.min === null || numericValue >= band.min;
    const hitsMax =
      band.max === undefined || band.max === null || numericValue < band.max;
    if (hitsMin && hitsMax && widthOk) {
      return {
        ...base,
        tier: tierName,
        bandLabel: band.label || null,
        isUnknown: false,
      };
    }
  }

  return { ...base, tier: "unknown", isUnknown: true };
}

/**
 * Classify against a per-commodity tier table (GT product, contained metal,
 * primary recovery rate). The signal must have `.perCommodityTiers[commodity]`.
 */
export function classifyPerCommodity(signal, commodity, value, opts) {
  const key = String(commodity || "").toLowerCase();
  const tiers = signal.perCommodityTiers?.[key];
  if (!tiers) {
    return {
      signalId: signal.id,
      signalName: signal.name,
      tier: "unknown",
      isUnknown: true,
      raw: value ?? null,
      bandLabel: null,
      reason: `no_commodity_tiers_for:${key}`,
    };
  }
  const cloned = { ...signal, tiers };
  return classifyNumeric(cloned, value, opts);
}

/**
 * Classify a qualitative phrase against label-only tier definitions.
 * Returns the first tier whose label substring matches (case-insensitive).
 */
export function classifyQualitative(signal, rawText) {
  const base = {
    signalId: signal.id,
    signalName: signal.name,
    raw: rawText ?? null,
    bandLabel: null,
  };
  if (!rawText || typeof rawText !== "string") {
    return { ...base, tier: "unknown", isUnknown: true };
  }

  const haystack = rawText.toLowerCase();
  for (const tierName of TIER_ORDER) {
    const band = signal.tiers?.[tierName];
    if (!band?.label) continue;
    const label = band.label.toLowerCase();
    const head = label.split("(")[0].trim();
    if (head && haystack.includes(head)) {
      return {
        ...base,
        tier: tierName,
        bandLabel: band.label,
        isUnknown: false,
      };
    }
  }
  return { ...base, tier: "unknown", isUnknown: true };
}

/**
 * Apply a data-quality warning gate. If any warning's appliesIfRawGradeAbove
 * threshold is exceeded by `rawValue`, the result becomes `unknown` and the
 * warning is attached.
 */
export function applyDataQualityWarnings(signal, rawValue, result) {
  const warnings = signal.dataQualityWarnings || [];
  const triggered = [];
  for (const w of warnings) {
    if (
      w.appliesIfRawGradeAbove !== undefined &&
      rawValue !== null &&
      rawValue !== undefined &&
      Number(rawValue) > Number(w.appliesIfRawGradeAbove)
    ) {
      triggered.push(w);
    }
  }
  if (triggered.length === 0) return result;
  return {
    ...result,
    tier: "unknown",
    isUnknown: true,
    dataQualityWarnings: triggered,
    reason: `data_quality_warning:${triggered.map((t) => t.code).join(",")}`,
  };
}

export const __testHooks = { TIER_ORDER };
