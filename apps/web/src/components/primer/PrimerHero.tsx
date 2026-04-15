"use client";

import { useCallback, useRef, lazy, Suspense } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowRight,
  ArrowRightLeft,
  Layers3,
  LineChart,
  Send,
} from "lucide-react";

const LazyHeroIllustration = lazy(() => import("./HeroIllustration"));
const LazyHeroStats = lazy(() => import("./HeroStats"));

export type MouseOffset = { x: number; y: number };

const TELEGRAM_URL = "https://t.me/+gNSBM_gBQ1NkNTY1";

const HERO_BENEFITS = [
  { icon: Layers3, label: "Diversified exposure" },
  { icon: LineChart, label: "Transparent NAV pricing" },
  { icon: ArrowRightLeft, label: "Clear redemption path" },
];

export function PrimerHero() {
  const sectionRef = useRef<HTMLElement>(null);
  const mouseRef = useRef<MouseOffset>({ x: 0, y: 0 });

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLElement>) => {
    const el = sectionRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    mouseRef.current = {
      x: (e.clientX - rect.left) / rect.width - 0.5,
      y: (e.clientY - rect.top) / rect.height - 0.5,
    };
  }, []);

  const handleMouseLeave = useCallback(() => {
    mouseRef.current = { x: 0, y: 0 };
  }, []);

  return (
    <section
      ref={sectionRef}
      id="hero"
      className="relative flex min-h-[calc(100vh-3.5rem)] flex-col overflow-hidden border-b border-app-border"
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      <div className="primer-hero-bg absolute inset-0" aria-hidden />
      <div className="primer-hero-orbs absolute inset-0" aria-hidden />
      <Suspense>
        <LazyHeroIllustration mouseRef={mouseRef} />
      </Suspense>
      <div className="primer-hero-grid absolute inset-0 opacity-40" aria-hidden />
      <div className="primer-hero-noise absolute inset-0" aria-hidden />

      <div className="relative flex flex-1 items-center">
        <div className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="text-left"
          >
            <h1 className="primer-gradient-text mt-5 text-4xl font-bold leading-[1.15] tracking-tight sm:text-5xl lg:text-6xl">
              Tokenized baskets.
              <br />
              Real liquidity.
              <br />
              Verifiable pricing.
            </h1>

            <div className="mt-6 max-w-3xl">
              <p className="text-base leading-relaxed text-app-muted sm:text-lg">
                Deposit USDC into curated onchain baskets and hold a single
                token.
              </p>
              <div className="mt-2 flex max-w-2xl flex-wrap items-center gap-x-4 gap-y-1 sm:gap-x-5">
                {HERO_BENEFITS.map(({ icon: Icon, label }) => (
                  <div key={label} className="flex items-center gap-1">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center text-app-accent/80">
                      <Icon className="h-3.5 w-3.5" />
                    </span>
                    <span className="text-xs font-medium tracking-[0.03em] text-app-muted">
                      {label}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-8 flex flex-wrap items-center gap-4">
              <Link
                href="/baskets"
                className="inline-flex items-center gap-2 rounded-lg bg-app-accent px-6 py-3 text-sm font-semibold text-app-accent-fg transition-opacity hover:opacity-90"
              >
                Launch App
                <ArrowRight className="h-4 w-4" />
              </Link>
              <a
                href={TELEGRAM_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-lg border border-app-border px-6 py-3 text-sm font-semibold text-app-text transition-colors hover:border-app-accent hover:text-app-accent"
              >
                <Send className="h-4 w-4" />
                Join Telegram
              </a>
            </div>

            <Suspense>
              <LazyHeroStats />
            </Suspense>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

