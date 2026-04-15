"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DocsHeading } from "@/lib/docs-types";

function useActiveHeading(ids: string[]) {
  const [activeId, setActiveId] = useState<string>("");
  const observer = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    observer.current?.disconnect();

    const headingEls = ids
      .map((id) => document.getElementById(id))
      .filter(Boolean) as HTMLElement[];

    if (headingEls.length === 0) return;

    observer.current = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting);
        if (visible.length > 0) {
          setActiveId(visible[0].target.id);
        }
      },
      { rootMargin: "-80px 0px -60% 0px", threshold: 0 }
    );

    headingEls.forEach((el) => observer.current?.observe(el));

    return () => observer.current?.disconnect();
  }, [ids]);

  return activeId;
}

function TocList({ toc, activeId }: { toc: DocsHeading[]; activeId: string }) {
  const handleClick = useCallback((e: React.MouseEvent<HTMLAnchorElement>, id: string) => {
    e.preventDefault();
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      window.history.replaceState(null, "", `#${id}`);
    }
  }, []);

  return (
    <nav className="space-y-1">
      {toc.map((item) => (
        <a
          key={`${item.id}-${item.depth}`}
          href={`#${item.id}`}
          onClick={(e) => handleClick(e, item.id)}
          className={cn(
            "block text-[13px] leading-snug transition-colors",
            item.depth >= 3 && "text-[12px]",
            activeId === item.id
              ? "font-medium text-app-accent"
              : "text-app-muted hover:text-app-text"
          )}
          style={{ paddingLeft: `${Math.max(item.depth - 2, 0) * 12}px` }}
        >
          {item.text}
        </a>
      ))}
    </nav>
  );
}

export function DocsToc({
  toc,
  variant,
}: {
  toc: DocsHeading[];
  variant: "desktop" | "mobile";
}) {
  const [open, setOpen] = useState(false);
  const filtered = toc.filter((h) => h.depth >= 2 && h.depth <= 4);
  const ids = filtered.map((h) => h.id);
  const activeId = useActiveHeading(ids);

  if (filtered.length === 0) return null;

  if (variant === "desktop") {
    return (
      <div className="sticky top-20 max-h-[calc(100vh-6rem)] overflow-y-auto rounded-lg border border-app-border bg-app-surface p-4">
        <p className="mb-3 text-xs font-bold uppercase tracking-wider text-app-muted/60">
          On this page
        </p>
        <TocList toc={filtered} activeId={activeId} />
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-app-border bg-app-surface xl:hidden">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-app-text"
      >
        On this page
        <ChevronDown className={cn("h-4 w-4 text-app-muted transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="border-t border-app-border px-4 py-3">
          <TocList toc={filtered} activeId={activeId} />
        </div>
      )}
    </div>
  );
}
