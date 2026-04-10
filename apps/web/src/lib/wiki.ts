// Docs compatibility map for legacy in-app wiki routes.
// Canonical docs content now renders directly from repository markdown in `docs/*.md`.

export const LEGACY_DOCS_SLUG_ALIASES: Record<string, string> = {
  overview: "readme",
  investor: "investor-flow",
  operator: "asset-manager-flow",
  "perp-risk-math": "perp-risk-math",
  "operator-interactions": "operator-interactions",
  "oracle-price-sync": "price-feed-flow",
  "pool-management": "global-pool-management-flow",
  "pwa-notifications": "pwa-push-notifications",
  "contracts-reference": "readme",
  troubleshooting: "readme",
  "security-risk": "readme",
};

export const LEGACY_DOCS_SLUGS = Object.keys(LEGACY_DOCS_SLUG_ALIASES);
