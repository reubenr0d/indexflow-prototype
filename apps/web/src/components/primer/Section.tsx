"use client";

import { useRef } from "react";
import { motion, useInView } from "framer-motion";
import { cn } from "@/lib/utils";

interface SectionProps {
  id: string;
  children: React.ReactNode;
  className?: string;
  /** Full-height hero-style section */
  fullHeight?: boolean;
}

export function Section({ id, children, className, fullHeight }: SectionProps) {
  const ref = useRef<HTMLElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-80px" });

  return (
    <section
      id={id}
      ref={ref}
      className={cn(
        "relative overflow-hidden px-4 sm:px-6",
        fullHeight && "flex min-h-[calc(100vh-3.5rem)] items-center",
        className
      )}
    >
      <motion.div
        initial={{ opacity: 0, y: 32 }}
        animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 32 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="mx-auto w-full max-w-5xl"
      >
        {children}
      </motion.div>
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
