import Link from "next/link";
import { CheckCircle2, ExternalLink, Megaphone } from "lucide-react";
import {
  contentCalendarRowKey,
  type BlogPostMetaLite,
  type ContentCalendarRow,
} from "@/lib/ops-types";

interface PublishedStripProps {
  postedRows: ContentCalendarRow[];
  recentBlogPosts: BlogPostMetaLite[];
}

export function PublishedStrip({ postedRows, recentBlogPosts }: PublishedStripProps) {
  const posted = postedRows.filter((r) => r.status === "posted" && r.postedUrl);
  if (posted.length === 0 && recentBlogPosts.length === 0) return null;
  return (
    <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
      <header className="flex items-center gap-2 text-app-muted">
        <Megaphone className="h-4 w-4" />
        <h2 className="text-xs font-semibold uppercase tracking-wider">
          Published — receipts of what we said
        </h2>
      </header>
      <p className="mt-2 max-w-2xl text-sm text-app-muted">
        Every posted X thread comes back into the repo as a `posted_url` on its calendar
        row; every blog post is markdown in <code className="font-mono text-xs">content/blog/</code>.
      </p>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-app-text">
            X threads ({posted.length})
          </h3>
          <ul className="mt-3 space-y-2">
            {posted.slice(-6).reverse().map((row) => (
              <li
                key={contentCalendarRowKey(row)}
                className="flex items-start gap-2 rounded-md border border-app-border bg-app-surface px-3 py-2"
              >
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-app-success" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-mono text-xs text-app-muted">
                      {row.date} {row.day}
                    </span>
                    <a
                      href={row.postedUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-0.5 text-[11px] text-app-accent hover:underline"
                    >
                      view
                      <ExternalLink className="h-2.5 w-2.5" />
                    </a>
                  </div>
                  <div className="mt-0.5 text-xs text-app-text">
                    {row.slotType} · {row.track} · {row.hookType}
                  </div>
                </div>
              </li>
            ))}
            {posted.length === 0 && (
              <li className="text-xs italic text-app-muted">No posts yet this season.</li>
            )}
          </ul>
        </div>

        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-app-text">
            Blog
          </h3>
          <ul className="mt-3 space-y-2">
            {recentBlogPosts.map((post) => (
              <li
                key={post.slug}
                className="rounded-md border border-app-border bg-app-surface px-3 py-2"
              >
                <Link
                  href={`/blog/${post.slug}`}
                  className="block text-sm font-medium text-app-text hover:text-app-accent"
                >
                  {post.title}
                </Link>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-app-muted">
                  <span className="font-mono">{post.date}</span>
                  {post.tags.slice(0, 3).map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full border border-app-border bg-app-bg px-1.5 py-0.5 font-mono"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
