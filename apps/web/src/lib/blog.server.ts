import { cache } from "react";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import GithubSlugger from "github-slugger";

export interface BlogPostMeta {
  slug: string;
  title: string;
  description: string;
  date: string;
  author: string;
  tags: string[];
  published: boolean;
  image?: string;
  readingTime: number;
}

export interface BlogHeading {
  depth: number;
  text: string;
  id: string;
}

export interface BlogPost extends BlogPostMeta {
  content: string;
  toc: BlogHeading[];
}

function blogRootPath(): string {
  const relativeToWebApp = path.resolve(process.cwd(), "..", "..", "content", "blog");
  if (existsSync(relativeToWebApp)) return relativeToWebApp;
  return path.resolve(process.cwd(), "content", "blog");
}

function estimateReadingTime(text: string): number {
  const words = text.trim().split(/\s+/).length;
  return Math.max(1, Math.round(words / 230));
}

function parseHeadings(markdown: string): BlogHeading[] {
  const lines = markdown.split(/\r?\n/);
  const headings: BlogHeading[] = [];
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

async function readPost(filePath: string): Promise<BlogPost | null> {
  const raw = await fs.readFile(filePath, "utf8");
  const { data, content } = matter(raw);

  if (!data.title || !data.date) return null;

  const slug = path.basename(filePath, ".md");

  return {
    slug,
    title: data.title,
    description: data.description ?? "",
    date: data.date instanceof Date ? data.date.toISOString().slice(0, 10) : String(data.date),
    author: data.author ?? "IndexFlow Team",
    tags: Array.isArray(data.tags) ? data.tags : [],
    published: data.published !== false,
    image: data.image ?? undefined,
    readingTime: estimateReadingTime(content),
    content,
    toc: parseHeadings(content),
  };
}

export const getAllPosts = cache(async (): Promise<BlogPost[]> => {
  const dir = blogRootPath();
  if (!existsSync(dir)) return [];

  const files = await fs.readdir(dir);
  const mdFiles = files.filter((f) => f.endsWith(".md"));
  const posts = await Promise.all(mdFiles.map((f) => readPost(path.join(dir, f))));

  const isDev = process.env.NODE_ENV === "development";

  return posts
    .filter((p): p is BlogPost => p !== null && (isDev || p.published))
    .sort((a, b) => b.date.localeCompare(a.date));
});

export const getPostBySlug = cache(async (slug: string): Promise<BlogPost | null> => {
  const posts = await getAllPosts();
  return posts.find((p) => p.slug === slug) ?? null;
});

export const getAllPostSlugs = cache(async (): Promise<string[]> => {
  const posts = await getAllPosts();
  return posts.map((p) => p.slug);
});

export function getPostNeighbors(
  posts: BlogPost[],
  slug: string,
): { prev: BlogPostMeta | null; next: BlogPostMeta | null } {
  const idx = posts.findIndex((p) => p.slug === slug);
  return {
    prev: idx > 0 ? posts[idx - 1] : null,
    next: idx >= 0 && idx < posts.length - 1 ? posts[idx + 1] : null,
  };
}
