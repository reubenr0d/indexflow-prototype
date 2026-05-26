import { getAllPosts } from "@/lib/blog.server";
import { SITE_URL } from "@/lib/site";

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export const dynamic = "force-static";
export const revalidate = 3600;

export async function GET() {
  const posts = await getAllPosts();
  const lastBuildDate = posts[0]
    ? new Date(`${posts[0].date}T00:00:00Z`).toUTCString()
    : new Date().toUTCString();

  const items = posts
    .map((post) => {
      const url = `${SITE_URL}/blog/${post.slug}`;
      const pubDate = new Date(`${post.date}T00:00:00Z`).toUTCString();
      const categories = post.tags
        .map((tag) => `      <category>${escapeXml(tag)}</category>`)
        .join("\n");
      return `    <item>
      <title>${escapeXml(post.title)}</title>
      <link>${url}</link>
      <guid isPermaLink="true">${url}</guid>
      <pubDate>${pubDate}</pubDate>
      <description>${escapeXml(post.description)}</description>
      <author>noreply@indexflow.org (${escapeXml(post.author)})</author>
${categories}
    </item>`;
    })
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>IndexFlow Blog</title>
    <link>${SITE_URL}/blog</link>
    <atom:link href="${SITE_URL}/blog/feed.xml" rel="self" type="application/rss+xml" />
    <description>Technical deep dives, protocol architecture, and insights on structured DeFi infrastructure from the IndexFlow team.</description>
    <language>en-US</language>
    <lastBuildDate>${lastBuildDate}</lastBuildDate>
${items}
  </channel>
</rss>
`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
