#!/usr/bin/env node
/**
 * Blog post SEO sanity checks for content/blog/*.md
 * Usage: node verify-blog.cjs [slug]
 *   slug optional — defaults to all published posts
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname);

function parseFrontmatter(raw) {
  if (!raw.startsWith("---\n")) return { data: {}, content: raw };
  const end = raw.indexOf("\n---\n", 4);
  if (end === -1) return { data: {}, content: raw };
  const fm = raw.slice(4, end);
  const content = raw.slice(end + 5);
  const data = {};
  for (const line of fm.split("\n")) {
    const m = /^(\w+):\s*(.+)$/.exec(line.trim());
    if (!m) continue;
    let val = m[2].trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    data[m[1]] = val;
  }
  return { data, content };
}
const BLOG_DIR = path.join(ROOT, "content", "blog");
const MAX_DESCRIPTION = 155;
const MAX_SEO_TITLE = 60;

function checkPost(filePath) {
  const slug = path.basename(filePath, ".md");
  const raw = fs.readFileSync(filePath, "utf8");
  const { data, content } = parseFrontmatter(raw);
  const issues = [];

  if (data.published === "false" || data.published === false) {
    return { slug, issues: [], skipped: true };
  }

  const required = ["title", "description", "date", "author", "tags", "published", "image"];
  for (const f of required) {
    if (data[f] === undefined || data[f] === null || data[f] === "") {
      issues.push(`missing frontmatter: ${f}`);
    }
  }

  const desc = String(data.description ?? "");
  if (desc.length > MAX_DESCRIPTION) {
    issues.push(`description too long: ${desc.length} chars (max ${MAX_DESCRIPTION})`);
  }

  const seoTitle = data.seoTitle ?? data.title ?? "";
  const serpTitle = data.seoTitle ? String(data.seoTitle) : String(data.title ?? "");
  if (serpTitle.length > MAX_SEO_TITLE) {
    issues.push(`SERP title too long: ${serpTitle.length} chars (max ${MAX_SEO_TITLE}) — add or shorten seoTitle`);
  }

  if (/t\.me\/\+/.test(content)) {
    issues.push("Telegram invite link in body — use /docs/whitepaper instead");
  }

  if (!/## Further reading/i.test(content)) {
    issues.push('missing "## Further reading" section');
  }

  const internalBlogLinks = (content.match(/\]\(\/blog\//g) ?? []).length;
  if (internalBlogLinks < 2) {
    issues.push(`few internal blog links: ${internalBlogLinks} (aim for 2+)`);
  }

  const externalLinks = (content.match(/\]\(https?:\/\//g) ?? []).length;
  if (externalLinks < 3) {
    issues.push(`few external outlinks: ${externalLinks} (aim for 3+)`);
  }

  if (data.image) {
    const imagePath = path.join(ROOT, "apps/web/public", data.image.replace(/^\//, ""));
    if (!fs.existsSync(imagePath)) {
      issues.push(`hero image missing: ${data.image}`);
    }
  }

  return { slug, issues, skipped: false };
}

const targetSlug = process.argv[2];
const files = fs
  .readdirSync(BLOG_DIR)
  .filter((f) => f.endsWith(".md"))
  .filter((f) => !targetSlug || f === `${targetSlug}.md`)
  .map((f) => path.join(BLOG_DIR, f));

if (files.length === 0) {
  console.error(targetSlug ? `No post: ${targetSlug}` : "No blog posts found");
  process.exit(1);
}

let failed = 0;
for (const file of files) {
  const { slug, issues, skipped } = checkPost(file);
  if (skipped) {
    console.log(`SKIP ${slug} (unpublished)`);
    continue;
  }
  if (issues.length === 0) {
    console.log(`OK  ${slug}`);
  } else {
    failed += 1;
    console.log(`FAIL ${slug}`);
    issues.forEach((i) => console.log(`     - ${i}`));
  }
}

process.exit(failed > 0 ? 1 : 0);
