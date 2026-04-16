import type { Metadata } from "next";
import { getAllPosts } from "@/lib/blog.server";
import { BlogPostCard } from "@/components/blog/blog-post-card";

export const metadata: Metadata = {
  title: "IndexFlow Blog | Insights & Technical Deep Dives",
  description:
    "Technical deep dives, protocol architecture, and insights on structured DeFi infrastructure from the IndexFlow team.",
  openGraph: {
    title: "IndexFlow Blog",
    description:
      "Technical deep dives, protocol architecture, and insights on structured DeFi infrastructure.",
    url: "https://indexflow.app/blog",
  },
  twitter: {
    card: "summary_large_image",
    title: "IndexFlow Blog",
    description:
      "Technical deep dives, protocol architecture, and insights on structured DeFi infrastructure.",
  },
};

export default async function BlogIndexPage() {
  const posts = await getAllPosts();

  return (
    <div className="min-h-[calc(100vh-3.5rem)] px-4 py-16 sm:px-6 sm:py-24">
      <div className="mx-auto max-w-5xl">
        <p className="font-mono text-xs font-semibold uppercase tracking-[0.24em] text-app-accent">
          Blog
        </p>
        <h1 className="mt-4 text-3xl font-bold leading-tight tracking-tight text-app-text sm:text-4xl lg:text-5xl">
          Insights &amp; Technical Deep Dives
        </h1>
        <p className="mt-5 max-w-2xl text-base leading-relaxed text-app-muted sm:text-lg">
          Protocol architecture, mechanism design, and operational insights from the team building IndexFlow.
        </p>

        {posts.length === 0 ? (
          <div className="mt-16 rounded-xl border border-app-border bg-app-surface p-12 text-center">
            <p className="text-app-muted">No posts yet. Check back soon.</p>
          </div>
        ) : (
          <div className="mt-14 grid gap-6 md:grid-cols-2">
            {posts.map((post) => (
              <BlogPostCard key={post.slug} post={post} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
