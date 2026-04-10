import { cache } from "react";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import GithubSlugger from "github-slugger";
import type { DocsDocument, DocsHeading, DocsManifestEntry } from "@/lib/docs-types";

interface DocsFileConfig {
  fileName: string;
  slug: string;
  title: string;
  aliases?: string[];
}

const DOCS_FILE_CONFIG: DocsFileConfig[] = [
  {
    fileName: "README.md",
    slug: "readme",
    title: "Documentation Index",
    aliases: ["overview", "contracts-reference", "troubleshooting", "security-risk"],
  },
  { fileName: "INVESTOR_FLOW.md", slug: "investor-flow", title: "Investor Flow", aliases: ["investor"] },
  {
    fileName: "ASSET_MANAGER_FLOW.md",
    slug: "asset-manager-flow",
    title: "Asset Manager Flow",
    aliases: ["operator"],
  },
  { fileName: "PERP_RISK_MATH.md", slug: "perp-risk-math", title: "Perp Risk Math" },
  {
    fileName: "OPERATOR_INTERACTIONS.md",
    slug: "operator-interactions",
    title: "Operator Interactions",
  },
  {
    fileName: "PRICE_FEED_FLOW.md",
    slug: "price-feed-flow",
    title: "Price Feed Flow",
    aliases: ["oracle-price-sync"],
  },
  {
    fileName: "ORACLE_SUPPORTED_ASSETS.md",
    slug: "oracle-supported-assets",
    title: "Oracle Supported Assets",
  },
  {
    fileName: "GLOBAL_POOL_MANAGEMENT_FLOW.md",
    slug: "global-pool-management-flow",
    title: "Global Pool Management Flow",
    aliases: ["pool-management"],
  },
  { fileName: "DEPLOYMENTS.md", slug: "deployments", title: "Deployments" },
  { fileName: "E2E_TESTING.md", slug: "e2e-testing", title: "E2E Testing" },
  {
    fileName: "SHARE_PRICE_AND_OPERATIONS.md",
    slug: "share-price-and-operations",
    title: "Share Price And Operations",
  },
  {
    fileName: "PWA_PUSH_NOTIFICATIONS.md",
    slug: "pwa-push-notifications",
    title: "PWA Push Notifications",
    aliases: ["pwa-notifications"],
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
  }));
});

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
