import { getAllPosts } from "@/lib/blog.server";
import type { BlogPostMeta } from "@/lib/blog.server";
import PrimerBlogClient from "./PrimerBlogClient";

export default async function PrimerBlog() {
  const posts = await getAllPosts();

  if (posts.length === 0) return null;

  const latestPosts: BlogPostMeta[] = posts.slice(0, 3).map((p) => ({
    slug: p.slug,
    title: p.title,
    description: p.description,
    date: p.date,
    author: p.author,
    tags: p.tags,
    published: p.published,
    image: p.image,
    readingTime: p.readingTime,
  }));

  return <PrimerBlogClient posts={latestPosts} />;
}
