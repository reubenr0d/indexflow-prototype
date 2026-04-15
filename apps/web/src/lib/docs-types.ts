export type DocsCategory =
  | "Core Concepts"
  | "Guides"
  | "Infrastructure"
  | "Operations"
  | "Protocol";

export const DOCS_CATEGORY_ORDER: DocsCategory[] = [
  "Core Concepts",
  "Guides",
  "Infrastructure",
  "Operations",
  "Protocol",
];

export interface DocsManifestEntry {
  slug: string;
  title: string;
  fileName: string;
  relativePath: string;
  summary: string;
  lastUpdated: string;
  aliases: string[];
  category: DocsCategory;
}

export interface DocsHeading {
  depth: number;
  text: string;
  id: string;
}

export interface DocsDocument extends DocsManifestEntry {
  canonicalSlug: string;
  content: string;
  toc: DocsHeading[];
}

export interface DocsNavItem {
  slug: string;
  title: string;
  category: DocsCategory;
}
