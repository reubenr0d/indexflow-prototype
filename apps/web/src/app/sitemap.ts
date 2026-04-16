import type { MetadataRoute } from "next";
import { getDocsNav } from "@/lib/docs.server";
import { getAllPosts } from "@/lib/blog.server";

const BASE_URL = "https://indexflow.app";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: BASE_URL, changeFrequency: "weekly", priority: 1.0 },
    { url: `${BASE_URL}/baskets`, changeFrequency: "daily", priority: 0.9 },
    { url: `${BASE_URL}/prices`, changeFrequency: "daily", priority: 0.7 },
    { url: `${BASE_URL}/blog`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${BASE_URL}/docs`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${BASE_URL}/terms`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${BASE_URL}/privacy`, changeFrequency: "yearly", priority: 0.3 },
  ];

  const docsNav = getDocsNav();
  const docsRoutes: MetadataRoute.Sitemap = docsNav.map((doc) => ({
    url: `${BASE_URL}/docs/${doc.slug}`,
    changeFrequency: "monthly",
    priority: 0.6,
  }));

  const posts = await getAllPosts();
  const blogRoutes: MetadataRoute.Sitemap = posts.map((post) => ({
    url: `${BASE_URL}/blog/${post.slug}`,
    lastModified: post.date,
    changeFrequency: "weekly",
    priority: 0.7,
  }));

  return [...staticRoutes, ...docsRoutes, ...blogRoutes];
}
