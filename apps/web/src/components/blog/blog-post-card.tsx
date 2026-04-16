import Link from "next/link";
import Image from "next/image";
import { Calendar, Clock } from "lucide-react";
import type { BlogPostMeta } from "@/lib/blog.server";

export function BlogPostCard({ post }: { post: BlogPostMeta }) {
  return (
    <Link
      href={`/blog/${post.slug}`}
      className="primer-glow-card group flex flex-col overflow-hidden rounded-xl border border-app-border bg-app-bg transition-colors"
    >
      {post.image && (
        <div className="aspect-[1200/630] overflow-hidden">
          <Image
            src={post.image}
            alt={post.title}
            width={600}
            height={315}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          />
        </div>
      )}
      <div className="flex h-[4.5rem] flex-wrap content-start items-start gap-3 px-6 pt-6">
        {post.tags.slice(0, 3).map((tag) => (
          <span
            key={tag}
            className="rounded-full border border-app-accent/20 bg-app-accent-dim px-2.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-app-accent"
          >
            {tag}
          </span>
        ))}
      </div>

      <h3 className="mt-4 px-6 text-lg font-semibold leading-snug text-app-text group-hover:text-app-accent transition-colors">
        {post.title}
      </h3>

      <p className="mt-2 flex-1 px-6 text-sm leading-relaxed text-app-muted line-clamp-3">
        {post.description}
      </p>

      <div className="mt-4 flex items-center gap-4 px-6 pb-6 text-xs text-app-muted">
        <span className="inline-flex items-center gap-1">
          <Calendar className="h-3 w-3" />
          <time dateTime={post.date}>
            {new Date(post.date + "T00:00:00").toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </time>
        </span>
        <span className="inline-flex items-center gap-1">
          <Clock className="h-3 w-3" />
          {post.readingTime} min read
        </span>
      </div>
    </Link>
  );
}
