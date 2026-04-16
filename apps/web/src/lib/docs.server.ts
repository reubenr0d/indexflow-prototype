import { cache } from "react";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import GithubSlugger from "github-slugger";
import type { DocsCategory, DocsDocument, DocsHeading, DocsManifestEntry, DocsNavItem } from "@/lib/docs-types";

interface DocsFileConfig {
  fileName: string;
  slug: string;
  title: string;
  category: DocsCategory;
  aliases?: string[];
}

const DOCS_FILE_CONFIG: DocsFileConfig[] = [
  {
    fileName: "README.md",
    slug: "readme",
    title: "Overview",
    category: "Core Concepts",
    aliases: ["overview", "contracts-reference", "troubleshooting", "security-risk"],
  },
  {
    fileName: "TECHNICAL_ARCHITECTURE_AND_ROADMAP.md",
    slug: "technical-architecture-roadmap",
    title: "Technical Architecture & Roadmap",
    category: "Core Concepts",
  },
  {
    fileName: "INVESTOR_FLOW.md",
    slug: "investor-flow",
    title: "Investor Flow",
    category: "Core Concepts",
    aliases: ["investor"],
  },
  {
    fileName: "SHARE_PRICE_AND_OPERATIONS.md",
    slug: "share-price-and-operations",
    title: "Share Price & Operations",
    category: "Core Concepts",
  },
  {
    fileName: "ASSET_MANAGER_FLOW.md",
    slug: "asset-manager-flow",
    title: "Curator & Asset Manager Flow",
    category: "Guides",
    aliases: ["operator", "curator"],
  },
  {
    fileName: "PERP_RISK_MATH.md",
    slug: "perp-risk-math",
    title: "Perp Risk Math",
    category: "Guides",
  },
  {
    fileName: "OPERATOR_INTERACTIONS.md",
    slug: "operator-interactions",
    title: "Operator Interactions",
    category: "Guides",
  },
  {
    fileName: "PRICE_FEED_FLOW.md",
    slug: "price-feed-flow",
    title: "Price Feed Flow",
    category: "Infrastructure",
    aliases: ["oracle-price-sync"],
  },
  {
    fileName: "ORACLE_SUPPORTED_ASSETS.md",
    slug: "oracle-supported-assets",
    title: "Oracle & Supported Assets",
    category: "Infrastructure",
  },
  {
    fileName: "GLOBAL_POOL_MANAGEMENT_FLOW.md",
    slug: "global-pool-management-flow",
    title: "Global Pool Management",
    category: "Infrastructure",
    aliases: ["pool-management"],
  },
  {
    fileName: "CROSS_CHAIN_COORDINATION.md",
    slug: "cross-chain-coordination",
    title: "Cross-Chain Coordination",
    category: "Infrastructure",
  },
  {
    fileName: "DEPLOYMENTS.md",
    slug: "deployments",
    title: "Deployments",
    category: "Infrastructure",
  },
  {
    fileName: "E2E_TESTING.md",
    slug: "e2e-testing",
    title: "E2E Testing",
    category: "Operations",
  },
  {
    fileName: "PWA_PUSH_NOTIFICATIONS.md",
    slug: "pwa-push-notifications",
    title: "Push Notifications",
    category: "Operations",
    aliases: ["pwa-notifications"],
  },
  {
    fileName: "UTILITY_TOKEN_TOKENOMICS.md",
    slug: "utility-token-tokenomics",
    title: "Utility Token & Tokenomics",
    category: "Protocol",
  },
  {
    fileName: "REGULATORY_ROADMAP_DRAFT.md",
    slug: "regulatory-roadmap-draft",
    title: "Regulatory Roadmap",
    category: "Protocol",
  },
  {
    fileName: "AGENTS_FRAMEWORK.md",
    slug: "agents-framework",
    title: "Agents Framework",
    category: "Protocol",
  },
  {
    fileName: "WHITEPAPER_DRAFT.md",
    slug: "whitepaper",
    title: "Whitepaper",
    category: "Protocol",
  },
];

const CONFIG_BY_SLUG = new Map(DOCS_FILE_CONFIG.map((entry) => [entry.slug, entry]));
const ALIAS_TO_CANONICAL = new Map(
  DOCS_FILE_CONFIG.flatMap((entry) => (entry.aliases ?? []).map((alias) => [alias, entry.slug] as const))
);

function docsRootPath(): string {
  const relativeToWebApp = path.resolve(process.cwd(), "..", "..", "docs");
  if (existsSync(relativeToWebApp)) return relativeToWebApp;
  return path.resolve(process.cwd(), "docs");
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function extractSummary(markdown: string): string {
  const lines = markdown.split(/\r?\n/);
  let inFence = false;

  for (const raw of lines) {
    const line = raw.trim();

    if (line.startsWith("```")) {
      inFence = !inFence;
      continue;
    }

    if (inFence || line.length === 0 || line.startsWith("#") || line.startsWith("|") || line.startsWith("---")) {
      continue;
    }

    if (line.startsWith("**") && line.endsWith("**")) {
      continue;
    }

    return line;
  }

  return "Operational documentation for the protocol.";
}

function parseHeadings(markdown: string): DocsHeading[] {
  const lines = markdown.split(/\r?\n/);
  const headings: DocsHeading[] = [];
  const slugger = new GithubSlugger();
  let inFence = false;

  for (const raw of lines) {
    const line = raw.trim();

    if (line.startsWith("```")) {
      inFence = !inFence;
      continue;
    }

    if (inFence) continue;

    const match = /^(#{1,6})\s+(.+)$/.exec(line);
    if (!match) continue;

    const text = match[2].replace(/\s+#*\s*$/, "").trim();
    if (!text) continue;

    headings.push({
      depth: match[1].length,
      text,
      id: slugger.slug(text),
    });
  }

  return headings;
}

async function readDoc(config: DocsFileConfig): Promise<DocsDocument> {
  const filePath = path.join(docsRootPath(), config.fileName);
  const [content, stats] = await Promise.all([fs.readFile(filePath, "utf8"), fs.stat(filePath)]);

  return {
    canonicalSlug: config.slug,
    slug: config.slug,
    title: config.title,
    fileName: config.fileName,
    relativePath: `docs/${config.fileName}`,
    summary: extractSummary(content),
    lastUpdated: toIsoDate(stats.mtime),
    aliases: config.aliases ?? [],
    category: config.category,
    content,
    toc: parseHeadings(content),
  };
}

export const getDocsManifest = cache(async (): Promise<DocsManifestEntry[]> => {
  const docs = await Promise.all(DOCS_FILE_CONFIG.map((cfg) => readDoc(cfg)));
  return docs.map((doc) => ({
    slug: doc.slug,
    title: doc.title,
    fileName: doc.fileName,
    relativePath: doc.relativePath,
    summary: doc.summary,
    lastUpdated: doc.lastUpdated,
    aliases: doc.aliases,
    category: doc.category,
  }));
});

export function getDocsNav(): DocsNavItem[] {
  return DOCS_FILE_CONFIG.map((cfg) => ({
    slug: cfg.slug,
    title: cfg.title,
    category: cfg.category,
  }));
}

export function getDocNeighbors(slug: string): { prev: DocsNavItem | null; next: DocsNavItem | null } {
  const canonical = resolveCanonicalDocsSlug(slug);
  const nav = getDocsNav();
  const idx = nav.findIndex((n) => n.slug === canonical);
  return {
    prev: idx > 0 ? nav[idx - 1] : null,
    next: idx >= 0 && idx < nav.length - 1 ? nav[idx + 1] : null,
  };
}

export const getAllDocsRouteSlugs = cache(async (): Promise<string[]> => {
  const manifest = await getDocsManifest();
  const aliases = manifest.flatMap((entry) => entry.aliases);
  return [...new Set([...manifest.map((entry) => entry.slug), ...aliases])];
});

export function resolveCanonicalDocsSlug(input: string): string | null {
  if (CONFIG_BY_SLUG.has(input)) return input;
  return ALIAS_TO_CANONICAL.get(input) ?? null;
}

export const getDocBySlug = cache(async (slug: string): Promise<DocsDocument | null> => {
  const canonical = resolveCanonicalDocsSlug(slug);
  if (!canonical) return null;

  const cfg = CONFIG_BY_SLUG.get(canonical);
  if (!cfg) return null;

  const doc = await readDoc(cfg);
  return {
    ...doc,
    slug,
  };
});
