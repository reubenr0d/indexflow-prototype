export interface DocsManifestEntry {
  slug: string;
  title: string;
  fileName: string;
  relativePath: string;
  summary: string;
  lastUpdated: string;
  aliases: string[];
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
