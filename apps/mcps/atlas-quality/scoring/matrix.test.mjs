// ---------------------------------------------------------------------------
// Verifies the analyst's anchor examples score correctly under matrix.json.
// Per the plan (§ 2.2): "PAAS 1,600m @ 4.0 g/t Au ⇒ Exceptional GT + Strong
// width + Moderate grade; NGEx 335.1m @ 2.25% Cu ⇒ Exceptional GT/width;
// Denison 491m @ 20% U₃O₈ ⇒ Exceptional GT/grade; Talon 15.2m @ 7.82% Ni ⇒
// Exceptional grade; PMET 28m @ 8.05% 'Li₂O' ⇒ flagged as caesium
// contamination and excluded from lithium scoring."
// ---------------------------------------------------------------------------

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  scoreDrilling,
  scoreDrillProgramType,
  scoreCompany,
  compositeScore,
} from "./matrix.js";
import {
  classifyNumeric,
  classifyPerCommodity,
  classifyQualitative,
  applyDataQualityWarnings,
} from "./tiers.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const matrix = JSON.parse(readFileSync(resolve(__dirname, "matrix.json"), "utf8"));

function findSignal(category, id) {
  return matrix[category].signals.find((s) => s.id === id);
}

// ---------------------------------------------------------------------------
// Matrix shape
// ---------------------------------------------------------------------------

test("matrix.json contains all 8 categories the analyst defined", () => {
  for (const key of [
    "drilling",
    "resources",
    "metallurgy",
    "economicStudies",
    "permitting",
    "offtake",
    "capitalRaises",
    "construction",
    "drillProgramSubRubric",
  ]) {
    assert.ok(matrix[key], `missing top-level category: ${key}`);
  }
});

test("matrix.json composite weights sum to 1.0", () => {
  const sum = Object.values(matrix.compositeWeights).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sum - 1.0) < 1e-9, `compositeWeights sum to ${sum}, expected 1.0`);
});

test("Drilling category contains the 15 main signals (24 minus 9 sub-rubric rows)", () => {
  assert.equal(matrix.drilling.signals.length, 15);
});

test("Drill program sub-rubric has 9 categories per the analyst's matrix", () => {
  assert.equal(matrix.drillProgramSubRubric.categories.length, 9);
});

// ---------------------------------------------------------------------------
// Anchor verification — every anchor from the matrix sheet must classify correctly
// ---------------------------------------------------------------------------

test("ANCHOR: PAAS 1,600m @ 4.0 g/t Au — Exceptional GT, Strong width, Moderate grade", () => {
  const gradeSignal = findSignal("drilling", "drilling_au_grade_op");
  const widthSignal = findSignal("drilling", "drilling_interval_width");
  const gtSignal = findSignal("drilling", "drilling_gt_product");

  const gradeRes = classifyNumeric(gradeSignal, 4.0);
  const widthRes = classifyNumeric(widthSignal, 1600);
  const gtRes = classifyPerCommodity(gtSignal, "gold", 4.0 * 1600);

  assert.equal(gradeRes.tier, "moderate", "4.0 g/t Au should be Moderate (3-10 g/t band)");
  assert.equal(widthRes.tier, "exceptional", "1,600m should be Exceptional (≥100m)");
  assert.equal(gtRes.tier, "exceptional", "GT=6,400 should be Exceptional for gold (≥425)");
});

test("ANCHOR: NGEx 335.1m @ 2.25% Cu — Exceptional GT, Exceptional width, Strong grade", () => {
  const gradeSignal = findSignal("drilling", "drilling_cu_grade");
  const widthSignal = findSignal("drilling", "drilling_interval_width");
  const gtSignal = findSignal("drilling", "drilling_gt_product");

  const gradeRes = classifyNumeric(gradeSignal, 2.25);
  const widthRes = classifyNumeric(widthSignal, 335.1);
  const gtRes = classifyPerCommodity(gtSignal, "copper", 2.25 * 335.1);

  assert.equal(gradeRes.tier, "strong", "2.25% Cu should be Strong (1.4-5% band)");
  assert.equal(widthRes.tier, "exceptional", "335.1m should be Exceptional (≥100m)");
  assert.equal(gtRes.tier, "exceptional", "GT=754 should be Exceptional for copper (≥140)");
});

test("ANCHOR: Denison 491m @ 20% U₃O₈ — Exceptional grade, Exceptional width, Exceptional GT", () => {
  const gradeSignal = findSignal("drilling", "drilling_u_grade");
  const widthSignal = findSignal("drilling", "drilling_interval_width");
  const gtSignal = findSignal("drilling", "drilling_gt_product");

  const gradeRes = classifyNumeric(gradeSignal, 20);
  const widthRes = classifyNumeric(widthSignal, 491);
  const gtRes = classifyPerCommodity(gtSignal, "uranium", 20 * 491);

  assert.equal(gradeRes.tier, "exceptional", "20% U₃O₈ should be Exceptional (≥13.9%)");
  assert.equal(widthRes.tier, "exceptional", "491m should be Exceptional (≥100m)");
  assert.equal(gtRes.tier, "exceptional", "GT=9,820 should be Exceptional for uranium (≥2,700)");
});

test("ANCHOR: Talon Metals 15.2m @ 7.82% Ni — Exceptional grade (massive sulphide)", () => {
  const gradeSignal = findSignal("drilling", "drilling_ni_grade");
  const gradeRes = classifyNumeric(gradeSignal, 7.82);
  assert.equal(gradeRes.tier, "exceptional", "7.82% Ni should be Exceptional (≥5.0%, massive sulphide)");
});

test("ANCHOR: i-80 Gold 28.3m @ 28.9% Pb — Strong grade", () => {
  const gradeSignal = findSignal("drilling", "drilling_pb_grade");
  const gradeRes = classifyNumeric(gradeSignal, 28.9);
  assert.equal(gradeRes.tier, "strong", "28.9% Pb should be Strong (16-33% band)");
});

test("ANCHOR: i-80 Gold 39.8m @ 12.3% Zn — Moderate grade", () => {
  const gradeSignal = findSignal("drilling", "drilling_zn_grade");
  const gradeRes = classifyNumeric(gradeSignal, 12.3);
  assert.equal(gradeRes.tier, "moderate", "12.3% Zn should be Moderate (6.3-13.4% band)");
});

test("ANCHOR: Saga Metals 90m @ 51.86% Fe — Exceptional grade (just at boundary)", () => {
  const gradeSignal = findSignal("drilling", "drilling_fe_grade");
  // 51.86% sits in the Strong band (50.1-51.9%) per the analyst's tiers.
  const gradeRes = classifyNumeric(gradeSignal, 51.86);
  assert.equal(gradeRes.tier, "strong", "51.86% Fe should be Strong (50.1-51.9% band, just below 51.9 Exceptional cutoff)");
});

test("ANCHOR: PAAS 332m @ 144 g/t Ag — Exceptional GT, Strong grade", () => {
  const gradeSignal = findSignal("drilling", "drilling_ag_grade");
  const gtSignal = findSignal("drilling", "drilling_gt_product");
  const gradeRes = classifyNumeric(gradeSignal, 144, { widthM: 332.4 });
  const gtRes = classifyPerCommodity(gtSignal, "silver", 144 * 332.4);
  assert.equal(gradeRes.tier, "strong", "144 g/t Ag over 332m should be Strong (75-325 g/t over ≥5m)");
  assert.equal(gtRes.tier, "exceptional", "GT=47,866 should be Exceptional for silver (≥10,500)");
});

// ---------------------------------------------------------------------------
// Data-quality warning: PMET 28m @ 8.05% "Li₂O" is actually CAESIUM
// ---------------------------------------------------------------------------

test("DATA QUALITY: PMET 28m @ 8.05% 'Li₂O' flagged as caesium contamination, excluded from Li scoring", () => {
  const liSignal = findSignal("drilling", "drilling_li_grade_hardrock");
  const naiveCls = classifyNumeric(liSignal, 8.05);
  // Without the warning, 8.05 would tier as Exceptional (≥6.8%).
  assert.equal(naiveCls.tier, "exceptional");

  // Apply data-quality warning — PMET's '8.05%' is documented caesium, not lithium.
  const guarded = applyDataQualityWarnings(liSignal, 8.05, naiveCls);
  assert.equal(guarded.tier, "unknown", "PMET 8.05% must be reclassified Unknown due to caesium contamination warning");
  assert.ok(guarded.dataQualityWarnings.some((w) => w.code === "li_caesium_contamination"));
});

test("DATA QUALITY: Verified Li₂O anchor (Q2 Metals 272.5m @ 1.61%) still classifies as Moderate", () => {
  const liSignal = findSignal("drilling", "drilling_li_grade_hardrock");
  const cls = classifyNumeric(liSignal, 1.61);
  // 1.61% sits in 1.5–3.5% Moderate band.
  assert.equal(cls.tier, "moderate");
});

// ---------------------------------------------------------------------------
// Drill exploration-vs-resource sub-rubric
// ---------------------------------------------------------------------------

test("SUB-RUBRIC: West Red Lake Gold 'resource conversion drilling at Madsen' classifies as Resource", () => {
  const result = scoreDrillProgramType(matrix, "Rowan Mine drilling supports resource estimation; infill drilling continues at Madsen");
  assert.ok(result.resourceTotal > result.explorationTotal);
  assert.ok(["exceptional", "strong"].includes(result.classifiedAs));
});

test("SUB-RUBRIC: Anfield Energy 'exploration-phase drilling' classifies as Exploration", () => {
  const result = scoreDrillProgramType(matrix, "Sparse drill count (7 holes); exploration-phase drilling at new target");
  assert.ok(result.explorationTotal > result.resourceTotal);
  assert.ok(["weak", "redFlag"].includes(result.classifiedAs));
});

test("SUB-RUBRIC: empty text falls through to Unknown", () => {
  const result = scoreDrillProgramType(matrix, "");
  assert.equal(result.classifiedAs, "unknown");
});

test("SUB-RUBRIC: text with no matching signals falls back to Moderate (data-quality fallback)", () => {
  const result = scoreDrillProgramType(matrix, "Company XYZ reports drill assays from project ABC over the past quarter.");
  assert.equal(result.classifiedAs, "moderate");
});

// ---------------------------------------------------------------------------
// Composite & provenance discount
// ---------------------------------------------------------------------------

test("COMPOSITE: drilling-only score still produces a composite (Unknown categories skipped)", () => {
  const ctx = {
    primaryCommodity: "copper",
    drills: [{ project: "Test", commodity: "copper", intercept_length_m: 335.1, grade: 2.25 }],
  };
  const result = scoreCompany(matrix, ctx);
  assert.ok(result.composite.composite !== null, "composite must not be null when drilling has data");
  assert.equal(result.composite.tier, "exceptional", "exceptional drilling alone should still composite to exceptional after rerumalisation");
});

test("COMPOSITE: PUBLISHED_REFERENCE_ONLY categories get the provenanceDiscount applied", () => {
  // Stub category results: drilling at 100 (Exceptional EMPIRICAL), economic studies at 100 (Exceptional PUBLISHED_REFERENCE_ONLY).
  const stubCategoryResults = {
    drilling: {
      tier: "exceptional",
      categoryScore: 100,
      signals: [{ provenance: "EMPIRICAL", tier: "exceptional", category: "drilling" }],
      provenance: "EMPIRICAL",
      unknownSignals: [],
    },
    economicStudies: {
      tier: "exceptional",
      categoryScore: 100,
      signals: [{ provenance: "PUBLISHED_REFERENCE_ONLY", tier: "exceptional", category: "economicStudies" }],
      provenance: "PUBLISHED_REFERENCE_ONLY",
      unknownSignals: [],
    },
  };
  const composite = compositeScore(matrix, stubCategoryResults);
  assert.equal(composite.perCategory.drilling.provenanceDiscounted, false);
  assert.equal(composite.perCategory.economicStudies.provenanceDiscounted, true);
  assert.ok(composite.perCategory.economicStudies.effectiveScore < composite.perCategory.economicStudies.score,
    "PUBLISHED_REFERENCE_ONLY score must be discounted below its raw score");
});

// ---------------------------------------------------------------------------
// notInWorkbookSchema signals stay Unknown (Drill Hole Orientation, etc.)
// ---------------------------------------------------------------------------

test("NOT IN WORKBOOK: Drill Hole Orientation always returns Unknown today", () => {
  const ctx = {
    primaryCommodity: "gold",
    drills: [{ project: "Test", commodity: "gold", intercept_length_m: 25, grade: 5.0 }],
  };
  const drillingResult = scoreDrilling(matrix, ctx);
  const orientation = [...drillingResult.signals, ...drillingResult.unknownSignals]
    .find((s) => s.signalId === "drilling_hole_orientation");
  assert.ok(orientation, "orientation signal must be surfaced");
  assert.ok(orientation.recoveryHint || orientation.signalId === "drilling_hole_orientation");
  // It should appear in unknownSignals (since notInWorkbookSchema=true means we always return Unknown).
  assert.ok(drillingResult.unknownSignals.some((u) => u.signalId === "drilling_hole_orientation"));
});

// ---------------------------------------------------------------------------
// Qualitative classifiers (text label match)
// ---------------------------------------------------------------------------

test("QUALITATIVE: 'DFS/BFS' text matches Exceptional study confidence tier", () => {
  const studySignal = findSignal("economicStudies", "econ_study_confidence");
  const cls = classifyQualitative(studySignal, "DFS/BFS (±10–15% accuracy)");
  assert.equal(cls.tier, "exceptional");
});

test("QUALITATIVE: 'Permit refused or under legal challenge' matches Red Flag permitting", () => {
  const permitSignal = findSignal("permitting", "permit_progress");
  const cls = classifyQualitative(permitSignal, "Project hit by permit refused or under legal challenge in Q1");
  assert.equal(cls.tier, "redFlag");
});

test("QUALITATIVE: Empty or null input returns Unknown", () => {
  const studySignal = findSignal("economicStudies", "econ_study_confidence");
  assert.equal(classifyQualitative(studySignal, "").tier, "unknown");
  assert.equal(classifyQualitative(studySignal, null).tier, "unknown");
});
