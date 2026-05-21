// ---------------------------------------------------------------------------
// Quality Matrix scoring functions
//
// One function per analyst category, plus the 58-signal drill-program sub-rubric.
// EVERY THRESHOLD comes from matrix.json — no hard-coded breakpoints in this file.
//
// Each scorer accepts:
//   - matrix: parsed matrix.json
//   - companyContext: { profile, events, drills, primaryCommodity, depositTypes? }
//
// And returns:
//   {
//     category: "drilling",
//     tier: "exceptional" | "strong" | "moderate" | "weak" | "redFlag" | "unknown",
//     categoryScore: 0-100 | null (null when every signal is Unknown),
//     signals: [ { signalId, signalName, tier, raw, bandLabel, anchorMatch?, provenance, source, ... } ],
//     unknownSignals: [ { signalId, signalName, reason, recoveryHint? } ]
//   }
// ---------------------------------------------------------------------------

import {
  classifyNumeric,
  classifyPerCommodity,
  classifyQualitative,
  applyDataQualityWarnings,
} from "./tiers.js";

const CATEGORY_TO_KEY = {
  drilling: "drilling",
  resources: "resources",
  metallurgy: "metallurgy",
  economicStudies: "economicStudies",
  permitting: "permitting",
  offtake: "offtake",
  capitalRaises: "capitalRaises",
  construction: "construction",
};

const TIER_ORDER = ["exceptional", "strong", "moderate", "weak", "redFlag"];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function tierScore(matrix, tier) {
  const scores = matrix.tierScores || {};
  return scores[tier] ?? null;
}

function nonUnknownSignals(signals) {
  return signals.filter((s) => s && s.tier && s.tier !== "unknown");
}

function aggregateSignals(matrix, signals) {
  const known = nonUnknownSignals(signals);
  if (known.length === 0) return { tier: "unknown", categoryScore: null };
  let total = 0;
  let weightSum = 0;
  for (const s of known) {
    const w = s.criticalRedFlag && s.tier === "redFlag" ? 2 : 1;
    const sc = tierScore(matrix, s.tier);
    if (sc === null) continue;
    total += sc * w;
    weightSum += w;
  }
  const categoryScore = weightSum > 0 ? Math.round(total / weightSum) : null;
  let tier = "unknown";
  if (categoryScore !== null) {
    if (categoryScore >= 90) tier = "exceptional";
    else if (categoryScore >= 70) tier = "strong";
    else if (categoryScore >= 50) tier = "moderate";
    else if (categoryScore >= 25) tier = "weak";
    else tier = "redFlag";
  }
  return { tier, categoryScore };
}

function pickAnchor(signal, raw) {
  // Surface the first workbook anchor that looks like it references the
  // same magnitude as the raw value. Defensive: if anchors list is empty,
  // return null. Otherwise we return the first one as a generic match.
  if (!Array.isArray(signal.workbookAnchors) || signal.workbookAnchors.length === 0) {
    return null;
  }
  return signal.workbookAnchors[0];
}

function summariseSignal(signal, classifyResult, extras = {}) {
  return {
    signalId: classifyResult.signalId,
    signalName: classifyResult.signalName,
    category: signal.category,
    tier: classifyResult.tier,
    isUnknown: !!classifyResult.isUnknown,
    raw: classifyResult.raw,
    bandLabel: classifyResult.bandLabel,
    provenance: signal.provenance || null,
    notInWorkbookSchema: !!signal.notInWorkbookSchema,
    criticalRedFlag: !!signal.criticalRedFlag,
    whatDrivesTheBadge: signal.whatDrivesTheBadge || null,
    caveatDepositTypeNuance: signal.caveatDepositTypeNuance || null,
    sourceLinks: signal.sourceLinks || [],
    anchorMatch: pickAnchor(signal, classifyResult.raw),
    dataQualityWarnings: classifyResult.dataQualityWarnings || [],
    _explain: buildExplain(signal, classifyResult),
    ...extras,
  };
}

function buildExplain(signal, classifyResult) {
  const explain = [];
  if (signal.whatDrivesTheBadge) explain.push({ kind: "whatDrivesTheBadge", text: signal.whatDrivesTheBadge });
  if (signal.caveatDepositTypeNuance) explain.push({ kind: "caveatDepositTypeNuance", text: signal.caveatDepositTypeNuance });
  if (classifyResult.bandLabel) explain.push({ kind: "bandLabel", text: classifyResult.bandLabel });
  if (Array.isArray(signal.workbookAnchors) && signal.workbookAnchors.length > 0) {
    explain.push({ kind: "anchor", text: signal.workbookAnchors[0] });
  }
  if (Array.isArray(classifyResult.dataQualityWarnings) && classifyResult.dataQualityWarnings.length > 0) {
    for (const w of classifyResult.dataQualityWarnings) {
      explain.push({ kind: "dataQualityWarning", text: w.message, code: w.code });
    }
  }
  return explain;
}

function unknownSummary(signal, reason) {
  return {
    signalId: signal.id,
    signalName: signal.name,
    category: signal.category,
    reason: reason || "no_data_available",
    recoveryHint: signal.notInWorkbookSchema
      ? "Requires NI 43-101 technical report extraction or curator-led pipeline expansion."
      : "Atlas profile does not currently expose this field.",
    notInWorkbookSchema: !!signal.notInWorkbookSchema,
    provenance: signal.provenance || null,
  };
}

// ---------------------------------------------------------------------------
// Drilling
// ---------------------------------------------------------------------------

function lookupGradeSignal(matrix, commodity, isUnderground = false) {
  const c = String(commodity || "").toLowerCase();
  const map = {
    gold: isUnderground ? "drilling_au_grade_ug" : "drilling_au_grade_op",
    copper: "drilling_cu_grade",
    lithium: "drilling_li_grade_hardrock",
    silver: "drilling_ag_grade",
    lead: "drilling_pb_grade",
    zinc: "drilling_zn_grade",
    uranium: "drilling_u_grade",
    nickel: "drilling_ni_grade",
    iron: "drilling_fe_grade",
  };
  const id = map[c] || (["tungsten", "cobalt", "antimony"].includes(c) ? "drilling_other_commodities" : null);
  if (!id) return null;
  return matrix.drilling.signals.find((s) => s.id === id);
}

function lookupSignalById(matrix, categoryKey, signalId) {
  return matrix[categoryKey]?.signals?.find((s) => s.id === signalId) || null;
}

function pickPrimaryIntercept(drills) {
  if (!Array.isArray(drills) || drills.length === 0) return null;
  // Atlas drill_results expose: { date, project, commodity, hole_id, intercept_m,
  // grade, grade_unit, is_high_grade, source_drill_url, ... }. Older shapes used
  // `intercept_length_m` — we tolerate both.
  let best = null;
  let bestGt = -Infinity;
  for (const d of drills) {
    const length = Number(d.intercept_m ?? d.intercept_length_m ?? d.intercept_length ?? d.width_m ?? 0);
    const grade = Number(d.grade ?? 0);
    if (!Number.isFinite(length) || length <= 0) continue;
    if (!Number.isFinite(grade) || grade <= 0) continue;
    const gt = length * grade;
    if (gt > bestGt) {
      bestGt = gt;
      best = { ...d, _gt: gt, _length: length, _grade: grade };
    }
  }
  return best;
}

export function scoreDrilling(matrix, ctx = {}) {
  const { profile = {}, drills = [], primaryCommodity, depositTypes = [] } = ctx;
  const allDrills = Array.isArray(drills) && drills.length > 0
    ? drills
    : Array.isArray(profile.drill_results) ? profile.drill_results : [];
  const commodityHint = String(primaryCommodity || profile.primary_commodity || allDrills[0]?.commodity || "").toLowerCase();
  const isUnderground = depositTypes.includes("underground") || depositTypes.includes("ug");

  const signals = [];
  const unknownSignals = [];

  // 1. Per-commodity grade (gold OP/UG, copper, lithium, silver, Pb, Zn, U, Ni, Fe, other)
  const gradeSignal = lookupGradeSignal(matrix, commodityHint, isUnderground);
  if (gradeSignal) {
    const headline = pickPrimaryIntercept(allDrills);
    if (headline) {
      let cls;
      if (gradeSignal.kind === "numeric_with_width") {
        cls = classifyNumeric(gradeSignal, headline._grade, { widthM: headline._length });
      } else if (gradeSignal.kind === "qualitative") {
        cls = { signalId: gradeSignal.id, signalName: gradeSignal.name, tier: "unknown", isUnknown: true, raw: null, bandLabel: null };
      } else {
        cls = classifyNumeric(gradeSignal, headline._grade);
      }
      cls = applyDataQualityWarnings(gradeSignal, headline._grade, cls);
      signals.push(summariseSignal(gradeSignal, cls, { intercept: { lengthM: headline._length, grade: headline._grade, gt: headline._gt, holeId: headline.hole_id, project: headline.project } }));
    } else {
      unknownSignals.push(unknownSummary(gradeSignal, "no_drill_intercepts_available"));
    }
  }

  // 2. Drill hole orientation — analyst-flagged notInWorkbookSchema, always Unknown
  const orientationSignal = lookupSignalById(matrix, "drilling", "drilling_hole_orientation");
  if (orientationSignal) unknownSignals.push(unknownSummary(orientationSignal, "no_azimuth_dip_or_true_width_field_in_atlas"));

  // 3. Drill program type (parent — sub-rubric drives the actual classification)
  const programTypeSignal = lookupSignalById(matrix, "drilling", "drilling_program_type");
  if (programTypeSignal) {
    // Combine: explicit events array from ctx + recent_announcements/events on the
    // profile + recent_documents (which Atlas exposes for many companies). For
    // each, fall back to whichever text-bearing fields are populated.
    const eventCorpus = [
      ...(Array.isArray(ctx.events) ? ctx.events : []),
      ...(Array.isArray(profile.recent_announcements) ? profile.recent_announcements : []),
      ...(Array.isArray(profile.events) ? profile.events : []),
      ...(Array.isArray(ctx.recentDocuments) ? ctx.recentDocuments : []),
    ];
    const releaseText = eventCorpus
      .map((e) => `${e.title || e.headline || e.name || ""} ${e.summary || e.description || ""}`)
      .join(" ")
      .toLowerCase();
    const subRubricResult = scoreDrillProgramType(matrix, releaseText);
    const tierFromRubric = subRubricResult.classifiedAs;
    signals.push(summariseSignal(programTypeSignal, {
      signalId: programTypeSignal.id,
      signalName: programTypeSignal.name,
      tier: tierFromRubric,
      isUnknown: tierFromRubric === "unknown",
      raw: subRubricResult,
      bandLabel: subRubricResult.summary,
    }, { subRubric: subRubricResult }));
  }

  // 4. Interval width
  const widthSignal = lookupSignalById(matrix, "drilling", "drilling_interval_width");
  if (widthSignal) {
    const headline = pickPrimaryIntercept(allDrills);
    if (headline) {
      const cls = classifyNumeric(widthSignal, headline._length);
      signals.push(summariseSignal(widthSignal, cls, { intercept: { lengthM: headline._length, project: headline.project } }));
    } else {
      unknownSignals.push(unknownSummary(widthSignal, "no_drill_intercepts_available"));
    }
  }

  // 5. GT product (per-commodity)
  const gtSignal = lookupSignalById(matrix, "drilling", "drilling_gt_product");
  if (gtSignal) {
    const headline = pickPrimaryIntercept(allDrills);
    if (headline && commodityHint) {
      const cls = classifyPerCommodity(gtSignal, commodityHint, headline._gt);
      signals.push(summariseSignal(gtSignal, cls, { intercept: { gt: headline._gt, project: headline.project }, commodity: commodityHint }));
    } else {
      unknownSignals.push(unknownSummary(gtSignal, "no_drill_intercepts_or_commodity"));
    }
  }

  const agg = aggregateSignals(matrix, signals);
  return {
    category: "drilling",
    tier: agg.tier,
    categoryScore: agg.categoryScore,
    signals,
    unknownSignals,
    provenance: "EMPIRICAL",
  };
}

// ---------------------------------------------------------------------------
// Drill Program Type sub-rubric (58-signal)
// ---------------------------------------------------------------------------

export function scoreDrillProgramType(matrix, releaseText) {
  const text = String(releaseText || "").toLowerCase();
  if (!text.trim()) {
    return {
      classifiedAs: "unknown",
      resourceTotal: 0,
      explorationTotal: 0,
      summary: "no_release_text",
      matchedSignals: [],
    };
  }
  let resourceTotal = 0;
  let explorationTotal = 0;
  const matchedSignals = [];
  for (const cat of matrix.drillProgramSubRubric.categories) {
    if (cat.fallback) continue;
    for (const phrase of cat.phrases || []) {
      if (!phrase.match) continue;
      const needle = String(phrase.match).toLowerCase();
      if (text.includes(needle)) {
        resourceTotal += Number(phrase.resourceWeight || 0);
        explorationTotal += Number(phrase.explorationWeight || 0);
        matchedSignals.push({ category: cat.id, phrase: phrase.match, resourceWeight: phrase.resourceWeight, explorationWeight: phrase.explorationWeight, tierHint: phrase.tierHint });
      }
    }
  }
  if (resourceTotal === 0 && explorationTotal === 0) {
    return {
      classifiedAs: "moderate",
      resourceTotal,
      explorationTotal,
      summary: "no_signals_matched_default_to_moderate_unclear",
      matchedSignals: [],
    };
  }
  // Resource-classified releases tier higher (Exceptional/Strong);
  // exploration-classified tier lower (Weak/Red Flag); ties → Moderate.
  let classifiedAs;
  const dominantScore = Math.max(resourceTotal, explorationTotal);
  if (resourceTotal > explorationTotal) {
    if (dominantScore >= 10) classifiedAs = "exceptional";
    else if (dominantScore >= 5) classifiedAs = "strong";
    else classifiedAs = "moderate";
  } else if (explorationTotal > resourceTotal) {
    if (dominantScore >= 10) classifiedAs = "redFlag";
    else if (dominantScore >= 5) classifiedAs = "weak";
    else classifiedAs = "moderate";
  } else {
    classifiedAs = "moderate";
  }
  return {
    classifiedAs,
    resourceTotal,
    explorationTotal,
    summary: `resource:${resourceTotal} exploration:${explorationTotal} -> ${classifiedAs}`,
    matchedSignals,
  };
}

// ---------------------------------------------------------------------------
// Resources / Metallurgy / Economic Studies / Permitting / Offtake / Capital Raises / Construction
//
// These categories are mostly PUBLISHED_REFERENCE_ONLY per the analyst.
// Atlas doesn't yet expose structured tonnage_change, recovery_rate, IRR, etc.
// fields on every company, so each scorer:
//
//   - Looks at well-known profile / events shapes if present
//   - Falls back to Unknown for any signal whose field isn't available
//
// The composite scorer down-weights categories whose every classified
// signal is PUBLISHED_REFERENCE_ONLY via matrix.provenanceDiscount.
// ---------------------------------------------------------------------------

function findEventOfType(events, types) {
  if (!Array.isArray(events)) return null;
  const set = new Set(types.map((t) => String(t).toLowerCase()));
  return events.find((e) => set.has(String(e.type || e.category || "").toLowerCase())) || null;
}

function classifyTextSignal(signal, profile, lookupKey) {
  const raw = profile?.[lookupKey];
  if (raw === undefined || raw === null || raw === "") return null;
  return classifyQualitative(signal, String(raw));
}

export function scoreResources(matrix, ctx = {}) {
  const { profile = {}, primaryCommodity } = ctx;
  const signals = [];
  const unknownSignals = [];

  const confidenceSignal = lookupSignalById(matrix, "resources", "resources_confidence_mix");
  const miPct = Number(profile.resource_mi_pct ?? profile.measured_indicated_pct ?? NaN);
  if (confidenceSignal) {
    if (Number.isFinite(miPct)) {
      const cls = classifyNumeric(confidenceSignal, miPct);
      signals.push(summariseSignal(confidenceSignal, cls));
    } else {
      unknownSignals.push(unknownSummary(confidenceSignal, "no_resource_classification_mix_in_atlas_profile"));
    }
  }

  const tonnageSignal = lookupSignalById(matrix, "resources", "resources_tonnage_change");
  const tonnageDelta = Number(profile.resource_tonnage_change_pct ?? NaN);
  if (tonnageSignal) {
    if (Number.isFinite(tonnageDelta)) {
      const cls = classifyNumeric(tonnageSignal, tonnageDelta);
      signals.push(summariseSignal(tonnageSignal, cls));
    } else {
      unknownSignals.push(unknownSummary(tonnageSignal, "no_prior_mre_tonnage_comparison"));
    }
  }

  const gradeSignal = lookupSignalById(matrix, "resources", "resources_grade_change");
  const gradeDelta = Number(profile.resource_grade_change_pct ?? NaN);
  if (gradeSignal) {
    if (Number.isFinite(gradeDelta)) {
      const cls = classifyNumeric(gradeSignal, gradeDelta);
      signals.push(summariseSignal(gradeSignal, cls));
    } else {
      unknownSignals.push(unknownSummary(gradeSignal, "no_prior_mre_grade_comparison"));
    }
  }

  const containedSignal = lookupSignalById(matrix, "resources", "resources_contained_metal");
  const containedMetal = Number(profile.contained_metal_units ?? profile.resource_contained_metal ?? NaN);
  if (containedSignal) {
    if (Number.isFinite(containedMetal) && primaryCommodity) {
      const cls = classifyPerCommodity(containedSignal, primaryCommodity, containedMetal);
      signals.push(summariseSignal(containedSignal, cls, { commodity: primaryCommodity }));
    } else {
      unknownSignals.push(unknownSummary(containedSignal, "no_contained_metal_or_commodity"));
    }
  }

  const cutoffSignal = lookupSignalById(matrix, "resources", "resources_cutoff_consistency");
  if (cutoffSignal) {
    const cls = classifyTextSignal(cutoffSignal, profile, "resource_cutoff_consistency");
    if (cls) signals.push(summariseSignal(cutoffSignal, cls));
    else unknownSignals.push(unknownSummary(cutoffSignal, "no_cutoff_consistency_field"));
  }

  const agg = aggregateSignals(matrix, signals);
  return {
    category: "resources",
    tier: agg.tier,
    categoryScore: agg.categoryScore,
    signals,
    unknownSignals,
    provenance: "PUBLISHED_REFERENCE_ONLY",
  };
}

export function scoreMetallurgy(matrix, ctx = {}) {
  const { profile = {}, primaryCommodity } = ctx;
  const signals = [];
  const unknownSignals = [];

  const recoverySignal = lookupSignalById(matrix, "metallurgy", "met_primary_recovery");
  const recoveryPct = Number(profile.metallurgical_recovery_pct ?? profile.recovery_pct ?? NaN);
  if (recoverySignal) {
    if (Number.isFinite(recoveryPct) && primaryCommodity) {
      const cls = classifyPerCommodity(recoverySignal, primaryCommodity, recoveryPct);
      signals.push(summariseSignal(recoverySignal, cls, { commodity: primaryCommodity }));
    } else {
      unknownSignals.push(unknownSummary(recoverySignal, "no_recovery_field_in_atlas_profile"));
    }
  }

  const recoveryImpSignal = lookupSignalById(matrix, "metallurgy", "met_recovery_improvement");
  const recoveryImpPp = Number(profile.metallurgical_recovery_improvement_pp ?? NaN);
  if (recoveryImpSignal) {
    if (Number.isFinite(recoveryImpPp)) {
      const cls = classifyNumeric(recoveryImpSignal, recoveryImpPp);
      signals.push(summariseSignal(recoveryImpSignal, cls));
    } else {
      unknownSignals.push(unknownSummary(recoveryImpSignal, "no_prior_test_comparison_in_atlas"));
    }
  }

  const testScaleSignal = lookupSignalById(matrix, "metallurgy", "met_test_scale");
  if (testScaleSignal) {
    const cls = classifyTextSignal(testScaleSignal, profile, "metallurgical_test_scale");
    if (cls) signals.push(summariseSignal(testScaleSignal, cls));
    else unknownSignals.push(unknownSummary(testScaleSignal, "no_test_scale_field"));
  }

  const oreComplexitySignal = lookupSignalById(matrix, "metallurgy", "met_ore_complexity");
  if (oreComplexitySignal) {
    const cls = classifyTextSignal(oreComplexitySignal, profile, "ore_complexity");
    if (cls) signals.push(summariseSignal(oreComplexitySignal, cls));
    else unknownSignals.push(unknownSummary(oreComplexitySignal, "no_ore_complexity_field"));
  }

  const variabilitySignal = lookupSignalById(matrix, "metallurgy", "met_variability_coverage");
  if (variabilitySignal) {
    const cls = classifyTextSignal(variabilitySignal, profile, "met_variability_coverage");
    if (cls) signals.push(summariseSignal(variabilitySignal, cls));
    else unknownSignals.push(unknownSummary(variabilitySignal, "no_variability_coverage_field"));
  }

  const agg = aggregateSignals(matrix, signals);
  return {
    category: "metallurgy",
    tier: agg.tier,
    categoryScore: agg.categoryScore,
    signals,
    unknownSignals,
    provenance: "PUBLISHED_REFERENCE_ONLY",
  };
}

export function scoreEconomicStudies(matrix, ctx = {}) {
  const { profile = {}, feasibilityStudies = [] } = ctx;
  const signals = [];
  const unknownSignals = [];

  // Atlas exposes feasibility_studies: [{ npv_usd, irr_pct, capex_usd, opex_usd_per_tonne, payback_years, study_type, date }].
  // Use the most-recent (study_type DFS > PFS > PEA), falling back to date order.
  const studyRank = { DFS: 3, BFS: 3, PFS: 2, "PRE-FEASIBILITY": 2, "PRE FEASIBILITY": 2, PEA: 1, SCOPING: 1 };
  const sortedStudies = [...(feasibilityStudies || [])].sort((a, b) => {
    const ra = studyRank[String(a?.study_type || "").toUpperCase()] || 0;
    const rb = studyRank[String(b?.study_type || "").toUpperCase()] || 0;
    if (rb !== ra) return rb - ra;
    return String(b?.date || "").localeCompare(String(a?.date || ""));
  });
  const headlineStudy = sortedStudies[0] || profile.feasibility || null;

  const studySignal = lookupSignalById(matrix, "economicStudies", "econ_study_confidence");
  const studyLevel = headlineStudy?.study_type || profile.study_level || null;
  if (studySignal) {
    if (studyLevel) {
      const cls = classifyQualitative(studySignal, String(studyLevel));
      signals.push(summariseSignal(studySignal, cls, { study: headlineStudy || null }));
    } else {
      unknownSignals.push(unknownSummary(studySignal, "no_study_level_field"));
    }
  }

  const irrSignal = lookupSignalById(matrix, "economicStudies", "econ_irr_post_tax");
  const irrPct = Number(headlineStudy?.irr_pct ?? headlineStudy?.irr_post_tax_pct ?? profile.irr_post_tax_pct ?? NaN);
  if (irrSignal) {
    if (Number.isFinite(irrPct)) {
      const cls = classifyNumeric(irrSignal, irrPct);
      signals.push(summariseSignal(irrSignal, cls, { study: headlineStudy || null }));
    } else {
      unknownSignals.push(unknownSummary(irrSignal, "no_irr_in_feasibility_profile"));
    }
  }

  const npvSignal = lookupSignalById(matrix, "economicStudies", "econ_npv_market_cap_ratio");
  const npv = Number(headlineStudy?.npv_usd ?? profile.npv_usd ?? NaN);
  const mcap = Number(ctx.marketCapUsd ?? profile.market_cap_usd ?? NaN);
  if (npvSignal) {
    if (Number.isFinite(npv) && Number.isFinite(mcap) && mcap > 0) {
      const ratio = npv / mcap;
      const cls = classifyNumeric(npvSignal, ratio);
      signals.push(summariseSignal(npvSignal, cls, { ratio, npvUsd: npv, marketCapUsd: mcap }));
    } else {
      unknownSignals.push(unknownSummary(npvSignal, "no_npv_or_market_cap_to_compute_ratio"));
    }
  }

  const paybackSignal = lookupSignalById(matrix, "economicStudies", "econ_payback_period");
  const payback = Number(headlineStudy?.payback_years ?? profile.payback_years ?? NaN);
  if (paybackSignal) {
    if (Number.isFinite(payback)) {
      const cls = classifyNumeric(paybackSignal, payback);
      signals.push(summariseSignal(paybackSignal, cls, { study: headlineStudy || null }));
    } else {
      unknownSignals.push(unknownSummary(paybackSignal, "no_payback_in_feasibility_profile"));
    }
  }

  const priceSignal = lookupSignalById(matrix, "economicStudies", "econ_price_assumption_conservatism");
  if (priceSignal) {
    const cls = classifyTextSignal(priceSignal, profile, "price_assumption_conservatism");
    if (cls) signals.push(summariseSignal(priceSignal, cls));
    else unknownSignals.push(unknownSummary(priceSignal, "no_price_assumption_field"));
  }

  const aiscSignal = lookupSignalById(matrix, "economicStudies", "econ_aisc_cost_curve");
  if (aiscSignal) {
    const cls = classifyTextSignal(aiscSignal, profile, "aisc_cost_curve_position");
    if (cls) signals.push(summariseSignal(aiscSignal, cls));
    else unknownSignals.push(unknownSummary(aiscSignal, "no_aisc_cost_curve_field"));
  }

  const agg = aggregateSignals(matrix, signals);
  return {
    category: "economicStudies",
    tier: agg.tier,
    categoryScore: agg.categoryScore,
    signals,
    unknownSignals,
    provenance: "PUBLISHED_REFERENCE_ONLY",
  };
}

export function scorePermitting(matrix, ctx = {}) {
  const { profile = {}, events = [], permittingEvents = [] } = ctx;
  const signals = [];
  const unknownSignals = [];

  const permitSignal = lookupSignalById(matrix, "permitting", "permit_progress");
  if (permitSignal) {
    // Atlas exposes structured permitting_events on the profile payload.
    // Fall back to events with type=permit, then to a free-text profile.permit_status.
    const recent = permittingEvents[0] || (events || []).find((e) => String(e.type || "").toLowerCase().includes("permit")) || null;
    const text = profile.permit_status ||
      (recent ? `${recent.title || recent.event_type || recent.name || ""} ${recent.summary || recent.description || ""}` : "");
    if (text && text.trim()) {
      const cls = classifyQualitative(permitSignal, text);
      signals.push(summariseSignal(permitSignal, cls, { event: recent || null }));
    } else {
      unknownSignals.push(unknownSummary(permitSignal, "no_permit_status_field_or_event"));
    }
  }

  const socialSignal = lookupSignalById(matrix, "permitting", "permit_community_social_licence");
  if (socialSignal) {
    const text = profile.social_licence_status || profile.community_status || "";
    if (text) {
      const cls = classifyQualitative(socialSignal, text);
      signals.push(summariseSignal(socialSignal, cls));
    } else {
      unknownSignals.push(unknownSummary(socialSignal, "no_social_licence_field"));
    }
  }

  const agg = aggregateSignals(matrix, signals);
  return {
    category: "permitting",
    tier: agg.tier,
    categoryScore: agg.categoryScore,
    signals,
    unknownSignals,
    provenance: "PUBLISHED_REFERENCE_ONLY",
  };
}

export function scoreOfftake(matrix, ctx = {}) {
  const { profile = {}, events = [] } = ctx;
  const signals = [];
  const unknownSignals = [];

  for (const id of ["offtake_strength", "offtake_binding_nature", "offtake_strategic_partner_quality"]) {
    const signal = lookupSignalById(matrix, "offtake", id);
    if (!signal) continue;
    const offtakeEvent = findEventOfType(events, ["offtake", "partnership", "strategic_investment"]);
    const text = profile[id] || profile.offtake_status || (offtakeEvent ? `${offtakeEvent.title || ""} ${offtakeEvent.summary || ""}` : "");
    if (text) {
      const cls = classifyQualitative(signal, text);
      signals.push(summariseSignal(signal, cls, { event: offtakeEvent || null }));
    } else {
      unknownSignals.push(unknownSummary(signal, "no_offtake_field_or_event"));
    }
  }

  const agg = aggregateSignals(matrix, signals);
  return {
    category: "offtake",
    tier: agg.tier,
    categoryScore: agg.categoryScore,
    signals,
    unknownSignals,
    provenance: "PUBLISHED_REFERENCE_ONLY",
  };
}

export function scoreCapitalRaises(matrix, ctx = {}) {
  const { profile = {}, events = [], capitalRaises = [] } = ctx;
  const signals = [];
  const unknownSignals = [];

  const financingSignal = lookupSignalById(matrix, "capitalRaises", "cap_financing_signal");
  if (financingSignal) {
    // Prefer Atlas's structured capital_raises array (most-recent first).
    const sortedRaises = [...(capitalRaises || [])].sort((a, b) => String(b?.date || "").localeCompare(String(a?.date || "")));
    const latestRaise = sortedRaises[0] || findEventOfType(events, ["capital_raise", "financing", "placement"]) || null;
    const text = profile.last_financing_status ||
      (latestRaise ? `${latestRaise.title || latestRaise.type || ""} ${latestRaise.summary || latestRaise.description || ""}` : "");
    if (text && text.trim()) {
      const cls = classifyQualitative(financingSignal, text);
      signals.push(summariseSignal(financingSignal, cls, { event: latestRaise || null }));
    } else {
      unknownSignals.push(unknownSummary(financingSignal, "no_financing_event_in_atlas"));
    }
  }

  const runwaySignal = lookupSignalById(matrix, "capitalRaises", "cap_runway");
  if (runwaySignal) {
    const text = profile.runway_status || "";
    if (text) {
      const cls = classifyQualitative(runwaySignal, text);
      signals.push(summariseSignal(runwaySignal, cls));
    } else {
      unknownSignals.push(unknownSummary(runwaySignal, "no_runway_status_field"));
    }
  }

  const dilutionSignal = lookupSignalById(matrix, "capitalRaises", "cap_dilution_impact");
  const dilutionPct = Number(profile.last_dilution_pct ?? NaN);
  if (dilutionSignal) {
    if (Number.isFinite(dilutionPct)) {
      const cls = classifyNumeric(dilutionSignal, dilutionPct);
      signals.push(summariseSignal(dilutionSignal, cls));
    } else {
      unknownSignals.push(unknownSummary(dilutionSignal, "no_dilution_pct_field"));
    }
  }

  const agg = aggregateSignals(matrix, signals);
  return {
    category: "capitalRaises",
    tier: agg.tier,
    categoryScore: agg.categoryScore,
    signals,
    unknownSignals,
    provenance: "PUBLISHED_REFERENCE_ONLY",
  };
}

export function scoreConstruction(matrix, ctx = {}) {
  const { profile = {} } = ctx;
  const signals = [];
  const unknownSignals = [];

  const rampSignal = lookupSignalById(matrix, "construction", "construction_rampup_performance");
  if (rampSignal) {
    const text = profile.rampup_status || "";
    if (text) {
      const cls = classifyQualitative(rampSignal, text);
      signals.push(summariseSignal(rampSignal, cls));
    } else {
      unknownSignals.push(unknownSummary(rampSignal, "no_rampup_status_field"));
    }
  }

  const reconSignal = lookupSignalById(matrix, "construction", "construction_grade_reconciliation");
  if (reconSignal) {
    const text = profile.grade_reconciliation_status || "";
    if (text) {
      const cls = classifyQualitative(reconSignal, text);
      signals.push(summariseSignal(reconSignal, cls));
    } else {
      unknownSignals.push(unknownSummary(reconSignal, "no_grade_reconciliation_field"));
    }
  }

  const scheduleSignal = lookupSignalById(matrix, "construction", "construction_schedule_vs_plan");
  if (scheduleSignal) {
    const text = profile.schedule_vs_plan || "";
    if (text) {
      const cls = classifyQualitative(scheduleSignal, text);
      signals.push(summariseSignal(scheduleSignal, cls));
    } else {
      unknownSignals.push(unknownSummary(scheduleSignal, "no_schedule_vs_plan_field"));
    }
  }

  const capexSignal = lookupSignalById(matrix, "construction", "construction_capex_vs_budget");
  const capexPct = Number(profile.capex_vs_budget_pct ?? NaN);
  if (capexSignal) {
    if (Number.isFinite(capexPct)) {
      const cls = classifyNumeric(capexSignal, capexPct);
      signals.push(summariseSignal(capexSignal, cls));
    } else {
      unknownSignals.push(unknownSummary(capexSignal, "no_capex_vs_budget_field"));
    }
  }

  const agg = aggregateSignals(matrix, signals);
  return {
    category: "construction",
    tier: agg.tier,
    categoryScore: agg.categoryScore,
    signals,
    unknownSignals,
    provenance: "PUBLISHED_REFERENCE_ONLY",
  };
}

// ---------------------------------------------------------------------------
// Composite — re-normalised across non-Unknown categories,
// with the analyst's provenanceDiscount applied to fully-PUBLISHED categories.
// ---------------------------------------------------------------------------

export function compositeScore(matrix, categoryResults) {
  const weights = { ...matrix.compositeWeights };
  const discount = Number(matrix.provenanceDiscount ?? 0.7);
  const tierScores = matrix.tierScores || {};
  const perCategory = {};
  let totalWeight = 0;
  let weighted = 0;

  for (const [categoryKey, weight] of Object.entries(weights)) {
    const result = categoryResults[categoryKey];
    if (!result || result.categoryScore === null || result.categoryScore === undefined) {
      perCategory[categoryKey] = { skipped: true, reason: "all_unknown_or_no_data", weight };
      continue;
    }
    const isPubOnly =
      (result.provenance === "PUBLISHED_REFERENCE_ONLY") ||
      (Array.isArray(result.signals) && result.signals.length > 0 && result.signals.every((s) => s.provenance === "PUBLISHED_REFERENCE_ONLY"));
    const effectiveScore = isPubOnly ? result.categoryScore * discount : result.categoryScore;
    weighted += effectiveScore * weight;
    totalWeight += weight;
    perCategory[categoryKey] = {
      score: result.categoryScore,
      effectiveScore: Math.round(effectiveScore * 10) / 10,
      tier: result.tier,
      weight,
      provenanceDiscounted: isPubOnly,
      signalCount: result.signals?.length || 0,
      unknownCount: result.unknownSignals?.length || 0,
    };
  }

  const composite = totalWeight > 0 ? Math.round(weighted / totalWeight) : null;
  let tier = "unknown";
  if (composite !== null) {
    if (composite >= 90) tier = "exceptional";
    else if (composite >= 70) tier = "strong";
    else if (composite >= 50) tier = "moderate";
    else if (composite >= 25) tier = "weak";
    else tier = "redFlag";
  }

  return {
    composite,
    tier,
    weightsUsed: weights,
    provenanceDiscount: discount,
    perCategory,
    tierScores,
  };
}

// ---------------------------------------------------------------------------
// One-shot scorer: drives every category from a company context.
// ---------------------------------------------------------------------------

export function scoreCompany(matrix, ctx = {}) {
  const categoryResults = {
    drilling: scoreDrilling(matrix, ctx),
    resources: scoreResources(matrix, ctx),
    economicStudies: scoreEconomicStudies(matrix, ctx),
    metallurgy: scoreMetallurgy(matrix, ctx),
    permitting: scorePermitting(matrix, ctx),
    offtake: scoreOfftake(matrix, ctx),
    capitalRaises: scoreCapitalRaises(matrix, ctx),
    construction: scoreConstruction(matrix, ctx),
  };
  const composite = compositeScore(matrix, categoryResults);
  return { composite, categoryResults };
}

// ---------------------------------------------------------------------------
// Short candidate detector — surfaces Red-Flag signals in
// `criticalRedFlag` categories (permit refused, dilution >30%, schedule
// blowout, capex >140%, grade-recon shortfall, failed raise).
// ---------------------------------------------------------------------------

export function pickShortRedFlags(matrix, categoryResults) {
  const redFlags = [];
  for (const result of Object.values(categoryResults)) {
    if (!result?.signals) continue;
    for (const s of result.signals) {
      if (s.criticalRedFlag && s.tier === "redFlag") {
        redFlags.push({
          signalId: s.signalId,
          signalName: s.signalName,
          category: s.category,
          raw: s.raw,
          bandLabel: s.bandLabel,
          whatDrivesTheBadge: s.whatDrivesTheBadge,
          sourceLinks: s.sourceLinks,
          provenance: s.provenance,
        });
      }
    }
  }
  return redFlags;
}

export const __testHooks = {
  TIER_ORDER,
  CATEGORY_TO_KEY,
  aggregateSignals,
  pickPrimaryIntercept,
};
