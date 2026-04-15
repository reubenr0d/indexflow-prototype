"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export interface Chapter {
  id: string;
  label: string;
}

interface ChapterNavProps {
  chapters: Chapter[];
}

export function ChapterNav({ chapters }: ChapterNavProps) {
  const [active, setActive] = useState(chapters[0]?.id ?? "");

  useEffect(() => {
    const observers: IntersectionObserver[] = [];
    const entries = new Map<string, boolean>();

    for (const ch of chapters) {
      const el = document.getElementById(ch.id);
      if (!el) continue;

      const observer = new IntersectionObserver(
        ([entry]) => {
          entries.set(ch.id, entry.isIntersecting);
          const first = chapters.find((c) => entries.get(c.id));
          if (first) setActive(first.id);
        },
        { rootMargin: "-30% 0px -60% 0px", threshold: 0 }
      );

      observer.observe(el);
      observers.push(observer);
    }

    return () => observers.forEach((o) => o.disconnect());
  }, [chapters]);

  return (
    <nav className="fixed left-6 top-1/2 z-30 hidden -translate-y-1/2 xl:flex xl:flex-col xl:gap-3">
      {chapters.map((ch) => (
        <a
          key={ch.id}
          href={`#${ch.id}`}
          className={cn(
            "group flex items-center gap-3 transition-colors",
            active === ch.id ? "text-app-accent" : "text-app-muted/50 hover:text-app-muted"
          )}
        >
          <span
            className={cn(
              "block h-2 w-2 rounded-full border transition-all",
              active === ch.id
                ? "border-app-accent bg-app-accent scale-125"
                : "border-app-muted/40 bg-transparent group-hover:border-app-muted"
            )}
          />
          <span
            className={cn(
              "text-[11px] font-medium tracking-wide opacity-0 transition-opacity group-hover:opacity-100",
              active === ch.id && "opacity-100"
            )}
          >
            {ch.label}
          </span>
        </a>
      ))}
    </nav>
  );
}
