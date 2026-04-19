import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, ArrowRight, Calendar, Clock, User } from "lucide-react";
import { DocsMarkdownContent } from "@/components/docs/docs-markdown-content";
import { DocsToc } from "@/components/docs/docs-toc";
import type { BlogPost, BlogPostMeta } from "@/lib/blog.server";

function Breadcrumbs({ post }: { post: BlogPost }) {
  return (
    <nav className="flex items-center gap-1.5 text-xs text-app-muted" aria-label="Breadcrumb">
      <Link href="/blog" className="transition-colors hover:text-app-text">
        Blog
      </Link>
      <span className="text-app-border-strong">/</span>
      <span className="text-app-text">{post.title}</span>
    </nav>
  );
}

function PrevNextNav({
  prev,
  next,
}: {
  prev: BlogPostMeta | null;
  next: BlogPostMeta | null;
}) {
  if (!prev && !next) return null;
  return (
    <div className="mt-8 grid gap-4 sm:grid-cols-2">
      {prev ? (
        <Link
          href={`/blog/${prev.slug}`}
          className="group flex min-w-0 items-center gap-3 rounded-lg border border-app-border bg-app-surface p-4 transition-colors hover:border-app-accent/40"
        >
          <ArrowLeft className="h-4 w-4 shrink-0 text-app-muted transition-colors group-hover:text-app-accent" />
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wider text-app-muted">
              Previous
            </p>
            <p className="truncate text-sm font-medium text-app-text">
              {prev.title}
            </p>
          </div>
        </Link>
      ) : (
        <div />
      )}
      {next ? (
        <Link
          href={`/blog/${next.slug}`}
          className="group flex min-w-0 items-center justify-end gap-3 rounded-lg border border-app-border bg-app-surface p-4 text-right transition-colors hover:border-app-accent/40"
        >
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wider text-app-muted">
              Next
            </p>
            <p className="truncate text-sm font-medium text-app-text">
              {next.title}
            </p>
          </div>
          <ArrowRight className="h-4 w-4 shrink-0 text-app-muted transition-colors group-hover:text-app-accent" />
        </Link>
      ) : (
        <div />
      )}
    </div>
  );
}

export function BlogPostLayout({
  post,
  prev,
  next,
}: {
  post: BlogPost;
  prev: BlogPostMeta | null;
  next: BlogPostMeta | null;
}) {
  const formattedDate = new Date(post.date + "T00:00:00").toLocaleDateString(
    "en-US",
    { month: "long", day: "numeric", year: "numeric" },
  );

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_14rem]">
        <article className="min-w-0 space-y-6 xl:mx-auto xl:max-w-3xl">
          <Breadcrumbs post={post} />

          <header>
            <div className="flex flex-wrap items-center gap-2">
              {post.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full border border-app-accent/20 bg-app-accent-dim px-2.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-app-accent"
                >
                  {tag}
                </span>
              ))}
            </div>
            <h1 className="mt-4 text-3xl font-bold tracking-tight text-app-text sm:text-4xl">
              {post.title}
            </h1>
            <p className="mt-3 text-base leading-relaxed text-app-muted sm:text-lg">
              {post.description}
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-app-muted">
              <span className="inline-flex items-center gap-1">
                <User className="h-3 w-3" />
                {post.author}
              </span>
              <span className="inline-flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                <time dateTime={post.date}>{formattedDate}</time>
              </span>
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {post.readingTime} min read
              </span>
            </div>
          </header>

          {post.image && (
            <div className="overflow-hidden rounded-xl border border-app-border">
              <Image
                src={post.image}
                alt={post.title}
                width={1200}
                height={630}
                priority
                className="w-full object-cover"
              />
            </div>
          )}

          {/* Mobile TOC */}
          <DocsToc toc={post.toc} variant="mobile" />

          <section id="content">
            <DocsMarkdownContent markdown={post.content} />
          </section>

          <footer className="flex items-center justify-between rounded-lg border border-app-border/50 bg-app-bg-subtle/40 px-4 py-3">
            <p className="text-xs text-app-muted">
              Published {formattedDate}
            </p>
            <div className="flex items-center gap-2">
              {post.tags.map((tag) => (
                <span
                  key={tag}
                  className="text-[10px] font-medium text-app-muted"
                >
                  #{tag}
                </span>
              ))}
            </div>
          </footer>

          <PrevNextNav prev={prev} next={next} />
        </article>

        {/* Desktop TOC sidebar */}
        <aside className="hidden xl:block">
          <DocsToc toc={post.toc} variant="desktop" />
        </aside>
      </div>
    </div>
  );
}
