// Classify whether recent price action suggests a signal is already priced in.

/**
 * @returns {{
 *   pricedInLevel: "none" | "light" | "medium" | "heavy" | "skip",
 *   pricedInPenalty: number,
 *   pricedInReasons: string[],
 * }}
 */
export function classifyPricingIn(
  { priceHistory, freshness },
  config = {},
) {
  const reasons = [];
  let penalty = 0;
  let level = "none";

  const max5d = Number(config.maxRecent5dReturnPct ?? 20);
  const max20d = Number(config.maxRecent20dReturnPct ?? 50);
  const max60d = Number(config.maxRecent60dReturnPct ?? 80);
  const spikePct = Number(config.spike1dMovePct ?? 15);
  const spikeNearDrillDays = Number(config.spikeNearDrillDays ?? 7);

  if (!priceHistory?.ok) {
    return {
      pricedInLevel: "none",
      pricedInPenalty: 0,
      pricedInReasons: ["price_history_unavailable_skipped"],
      priceHistoryOk: false,
    };
  }

  const r5 = priceHistory.return5dPct;
  const r20 = priceHistory.return20dPct;
  const r60 = priceHistory.return60dPct;
  const spike = priceHistory.max1dMove30dPct;

  if (Number.isFinite(r5) && r5 > max5d) {
    penalty = Math.max(penalty, 0.5);
    level = "heavy";
    reasons.push(`return_5d_${r5.toFixed(1)}pct_gt_${max5d}`);
  } else if (Number.isFinite(r20) && r20 > max20d) {
    penalty = Math.max(penalty, 0.3);
    if (level === "none") level = "medium";
    reasons.push(`return_20d_${r20.toFixed(1)}pct_gt_${max20d}`);
  } else if (Number.isFinite(r60) && r60 > max60d) {
    penalty = Math.max(penalty, 0.15);
    if (level === "none") level = "light";
    reasons.push(`return_60d_${r60.toFixed(1)}pct_gt_${max60d}`);
  }

  const daysSinceDrill = freshness?.daysSinceLastDrillRelease;
  if (
    Number.isFinite(spike) &&
    spike > spikePct &&
    daysSinceDrill !== null &&
    daysSinceDrill <= spikeNearDrillDays
  ) {
    level = "skip";
    penalty = 1;
    reasons.push(`spike_${spike.toFixed(1)}pct_within_${spikeNearDrillDays}d_of_drill`);
  }

  if (level === "skip") {
    return { pricedInLevel: "skip", pricedInPenalty: 1, pricedInReasons: reasons, priceHistoryOk: true };
  }

  return {
    pricedInLevel: level,
    pricedInPenalty: Math.min(1, penalty),
    pricedInReasons: reasons.length ? reasons : ["within_thresholds"],
    priceHistoryOk: true,
  };
}
