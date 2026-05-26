// Lightweight headline classifier for long-entry news confirmation.

const BULLISH_HINTS = [
  "intersect",
  "intercept",
  "high-grade",
  "high grade",
  "resource",
  "maiden",
  "pea",
  "pfs",
  "dfs",
  "feasibility",
  "permit",
  "offtake",
  "financing closed",
  "raises",
  "production",
  "record",
  "expands",
  "discovery",
  "bonanza",
  "upgrade",
  "increase",
  "extends",
];

const BEARISH_HINTS = [
  "miss",
  "delay",
  "suspend",
  "halt",
  "dilut",
  "offering",
  "refused",
  "downgrade",
  "cut",
  "weak",
  "failed",
  "lawsuit",
  "investigation",
  "bankrupt",
];

const FACTUAL_HINTS = [
  "drill",
  "assay",
  "results",
  "update",
  "announces",
  "report",
  "study",
  "resource estimate",
];

export function classifyHeadlineSentiment(title) {
  const text = String(title || "").toLowerCase();
  if (!text.trim()) return "neutral";
  let bull = 0;
  let bear = 0;
  let factual = 0;
  for (const h of BULLISH_HINTS) if (text.includes(h)) bull += 1;
  for (const h of BEARISH_HINTS) if (text.includes(h)) bear += 1;
  for (const h of FACTUAL_HINTS) if (text.includes(h)) factual += 1;
  if (bear > bull && bear > 0) return "bearish";
  if (bull > bear && bull > 0) return "bullish";
  if (factual > 0) return "factual";
  return "neutral";
}

export function headlineAgeDays(publishedAt, nowMs = Date.now()) {
  const t = Date.parse(publishedAt || "");
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.floor((nowMs - t) / (24 * 60 * 60 * 1000)));
}

/**
 * @returns {{ qualifies: boolean, bestHeadline: object|null, sentiment: string|null }}
 */
export function pickQualifyingLongHeadline(headlines, { maxAgeDays = 90, nowMs = Date.now() } = {}) {
  if (!Array.isArray(headlines) || headlines.length === 0) {
    return { qualifies: false, bestHeadline: null, sentiment: null };
  }
  let best = null;
  let bestSentiment = null;
  for (const h of headlines) {
    const age = headlineAgeDays(h.publishedAt, nowMs);
    if (age !== null && age > maxAgeDays) continue;
    const sentiment = classifyHeadlineSentiment(h.title);
    if (sentiment !== "bullish" && sentiment !== "factual") continue;
    if (!best || (h.publishedAt && (!best.publishedAt || h.publishedAt > best.publishedAt))) {
      best = h;
      bestSentiment = sentiment;
    }
  }
  return {
    qualifies: Boolean(best),
    bestHeadline: best,
    sentiment: bestSentiment,
  };
}
