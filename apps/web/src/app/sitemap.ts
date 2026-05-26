import type { MetadataRoute } from "next";
import { getDocsNav } from "@/lib/docs.server";
import { getAllPosts } from "@/lib/blog.server";
import { SITE_URL } from "@/lib/site";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: SITE_URL, changeFrequency: "weekly", priority: 1.0 },
    { url: `${SITE_URL}/baskets`, changeFrequency: "daily", priority: 0.9 },
    { url: `${SITE_URL}/prices`, changeFrequency: "daily", priority: 0.7 },
    { url: `${SITE_URL}/blog`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${SITE_URL}/blog/feed.xml`, changeFrequency: "weekly", priority: 0.5 },
    { url: `${SITE_URL}/docs`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${SITE_URL}/terms`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE_URL}/privacy`, changeFrequency: "yearly", priority: 0.3 },
  ];

  const docsNav = getDocsNav();
  const docsRoutes: MetadataRoute.Sitemap = docsNav.map((doc) => ({
    url: `${SITE_URL}/docs/${doc.slug}`,
    changeFrequency: "monthly",
    priority: 0.6,
  }));

  const posts = await getAllPosts();
  const blogRoutes: MetadataRoute.Sitemap = posts.map((post) => ({
    url: `${SITE_URL}/blog/${post.slug}`,
    lastModified: post.date,
    changeFrequency: "weekly",
    priority: 0.7,
  }));

  return [...staticRoutes, ...docsRoutes, ...blogRoutes];
}
