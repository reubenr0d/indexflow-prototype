// Confidence-tier classifier shared by both the live Nansen path and the
// degraded Envio fallback. The smart-money-mirror agent's frontmatter
// gates basket inclusion on `confidenceTier` ("high" / "medium" / "low"),
// so we keep the bucket boundaries in one place rather than re-deriving
// them in the agent prompt.
//
// Inputs:
//   - smartMoneyWalletCount: distinct Nansen-labelled smart-money wallets
//     holding the token in the lookback window. Envio fallback substitutes
//     "wallets that bought > 10k USD in the lookback window".
//   - netFlow7dUsd: 7-day net inflow into smart-money wallets, USD-signed.
//     Envio fallback uses net swap volume * price.
//
// Output tiers map to the agent's `minConfidenceScore` rubric: high = 80,
// medium = 65, low = 40.

export function classifyConfidenceTier({ smartMoneyWalletCount, netFlow7dUsd }) {
  const wallets = Number.isFinite(smartMoneyWalletCount) ? smartMoneyWalletCount : 0;
  const flow = Number.isFinite(netFlow7dUsd) ? netFlow7dUsd : 0;
  if (wallets >= 12 && flow >= 250_000) {
    return { tier: "high", score: 80 };
  }
  if (wallets >= 5 && flow >= 25_000) {
    return { tier: "medium", score: 65 };
  }
  if (wallets >= 3 || flow > 0) {
    return { tier: "low", score: 40 };
  }
  return { tier: "none", score: 0 };
}
