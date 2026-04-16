"use client";

import Link from "next/link";
import { useRef } from "react";
import { motion, useInView } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { BlogPostCard } from "@/components/blog/blog-post-card";
import type { BlogPostMeta } from "@/lib/blog.server";

export default function PrimerBlogClient({ posts }: { posts: BlogPostMeta[] }) {
  const ref = useRef<HTMLElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-80px" });

  if (posts.length === 0) return null;

  return (
    <section
      id="blog"
      ref={ref}
      className="primer-section-glow primer-section-glow-br relative border-b border-app-border bg-app-surface py-24 sm:py-32"
    >
      <div
        className="absolute inset-x-0 top-0 h-px"
        style={{
          background:
            "linear-gradient(90deg, transparent, var(--accent), transparent)",
        }}
        aria-hidden
      />
      <div className="relative z-10 mx-auto max-w-5xl px-4 sm:px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="text-center"
        >
          <p className="font-mono text-xs font-semibold uppercase tracking-[0.24em] text-app-accent">
            From the Blog
          </p>
          <h2 className="primer-gradient-text mt-4 inline-block text-3xl font-bold sm:text-4xl">
            Latest Insights
          </h2>
          <p className="mx-auto mt-4 max-w-lg text-app-muted">
            Technical deep dives, protocol architecture, and mechanism design
            from the IndexFlow team.
          </p>
        </motion.div>

        <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {posts.map((post, i) => (
            <motion.div
              key={post.slug}
              initial={{ opacity: 0, y: 16 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{
                delay: 0.15 + i * 0.1,
                duration: 0.45,
                ease: [0.22, 1, 0.36, 1],
              }}
            >
              <BlogPostCard post={post} />
            </motion.div>
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={isInView ? { opacity: 1 } : {}}
          transition={{ delay: 0.5, duration: 0.4 }}
          className="mt-10 text-center"
        >
          <Link
            href="/blog"
            className="group inline-flex items-center gap-2 text-sm font-medium text-app-accent transition-colors hover:text-app-accent/80"
          >
            View all posts
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </motion.div>
      </div>
    </section>
  );
}
