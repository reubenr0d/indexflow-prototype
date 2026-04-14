import { describe, expect, it } from "vitest";
import { getAllDocsRouteSlugs, getDocsManifest, resolveCanonicalDocsSlug } from "@/lib/docs.server";
import { LEGACY_DOCS_SLUGS } from "@/lib/wiki";

describe("docs registry", () => {
  it("exposes all markdown docs from docs/", async () => {
    const docs = await getDocsManifest();
    expect(docs).toHaveLength(13);

    const files = docs.map((doc) => doc.fileName).sort();
    expect(files).toEqual([
      "ASSET_MANAGER_FLOW.md",
      "DEPLOYMENTS.md",
      "E2E_TESTING.md",
      "GLOBAL_POOL_MANAGEMENT_FLOW.md",
      "INVESTOR_FLOW.md",
      "OPERATOR_INTERACTIONS.md",
      "ORACLE_SUPPORTED_ASSETS.md",
      "PERP_RISK_MATH.md",
      "PRICE_FEED_FLOW.md",
      "PWA_PUSH_NOTIFICATIONS.md",
      "README.md",
      "SHARE_PRICE_AND_OPERATIONS.md",
      "TECHNICAL_ARCHITECTURE_AND_ROADMAP.md",
    ]);
  });

  it("keeps route slugs unique and includes legacy aliases", async () => {
    const slugs = await getAllDocsRouteSlugs();
    const unique = new Set(slugs);

    expect(unique.size).toBe(slugs.length);

    for (const legacy of LEGACY_DOCS_SLUGS) {
      expect(slugs.includes(legacy)).toBe(true);
      expect(resolveCanonicalDocsSlug(legacy)).not.toBeNull();
    }
  });
});
