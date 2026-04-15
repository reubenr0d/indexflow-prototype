"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

interface SectionProps {
  id: string;
  children: React.ReactNode;
  className?: string;
  /** Full-height hero-style section */
  fullHeight?: boolean;
}

export function Section({ id, children, className, fullHeight }: SectionProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add("visible");
          observer.disconnect();
        }
      },
      { rootMargin: "-80px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <section
      id={id}
      className={cn(
        "relative overflow-hidden px-4 sm:px-6",
        fullHeight && "flex min-h-[calc(100vh-3.5rem)] items-center",
        className,
      )}
    >
      <div ref={ref} className="section-reveal mx-auto w-full max-w-5xl">
        {children}
      </div>
    </section>
  );
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-mono text-xs font-semibold uppercase tracking-[0.24em] text-app-accent">
      {children}
    </p>
  );
}

export function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mt-4 text-3xl font-bold leading-tight tracking-tight text-app-text sm:text-4xl lg:text-5xl">
      {children}
    </h2>
  );
}

export function SectionBody({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-5 text-base leading-relaxed text-app-muted sm:text-lg">
      {children}
    </p>
  );
}
