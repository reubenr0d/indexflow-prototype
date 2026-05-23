"use client";

import { useCallback, useRef, lazy, Suspense } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowRight,
  ArrowRightLeft,
  Bot,
  Code,
  Layers3,
  LineChart,
  Send,
  User,
  Wallet,
} from "lucide-react";
import { XLogo } from "@/components/icons/x-logo";

const LazyHeroIllustration = lazy(() => import("./HeroIllustration"));
const LazyHeroStats = lazy(() => import("./HeroStats"));

export type MouseOffset = { x: number; y: number };

const TELEGRAM_URL = "https://t.me/+gNSBM_gBQ1NkNTY1";
const X_URL = "https://x.com/indexflowDAO";
const GITHUB_URL = "https://github.com/reubenr0d/indexflow-prototype";

const HERO_BENEFITS = [
  { icon: Layers3, label: "Diversified exposure" },
  { icon: LineChart, label: "Transparent NAV pricing" },
  { icon: ArrowRightLeft, label: "Clear redemption path" },
];

const SOCIAL_LINKS: Array<{
  Icon: React.ComponentType<{ className?: string }>;
  href: string;
  label: string;
}> = [
  { Icon: Code, href: GITHUB_URL, label: "GitHub" },
  { Icon: XLogo, href: X_URL, label: "X (Twitter)" },
  { Icon: Send, href: TELEGRAM_URL, label: "Telegram" },
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
      className="relative flex flex-col overflow-hidden border-b border-app-border"
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

      <div className="relative">
        <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="text-left"
          >
            <h1 className="primer-gradient-text text-4xl font-bold leading-[1.15] tracking-tight sm:text-5xl lg:text-6xl">
              Create baskets.
              <br />
              Manage exposure.
              <br />
              Build a track record.
            </h1>

            <div className="mt-5 max-w-3xl">
              <p className="text-base leading-relaxed text-app-muted sm:text-lg">
                Launch testnet baskets with live stock prices.
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

            {/* Cohesive CTA stack — primary buttons row, then human sub-link, then social icons */}
            <div className="mt-6 flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-3">
                <a
                  href={GITHUB_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-testid="hero-cta-build-agent"
                  className="inline-flex h-12 items-center gap-2 rounded-lg bg-app-accent px-6 text-sm font-semibold text-app-accent-fg shadow-[0_0_30px_-8px_color-mix(in_srgb,var(--accent)_55%,transparent)] transition-opacity hover:opacity-90 sm:text-base"
                >
                  <Bot className="h-5 w-5" />
                  Build an AI vault manager
                  <ArrowRight className="h-4 w-4" />
                </a>
                <Link
                  href="/baskets"
                  data-testid="hero-cta-invest"
                  className="inline-flex h-12 items-center gap-2 rounded-lg border border-app-border bg-app-surface/60 px-6 text-sm font-semibold text-app-text backdrop-blur-sm transition-colors hover:border-app-accent hover:text-app-accent sm:text-base"
                >
                  <Wallet className="h-5 w-5" />
                  Invest in baskets
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>

              <Link
                href="/admin/baskets"
                data-testid="hero-cta-create-as-human"
                className="inline-flex items-center gap-1.5 self-start text-xs text-app-muted underline decoration-app-border decoration-1 underline-offset-4 transition-colors hover:text-app-accent hover:decoration-app-accent"
              >
                <User className="h-3.5 w-3.5" aria-hidden />
                or create one as a human
                <ArrowRight className="h-3 w-3" aria-hidden />
              </Link>

              <div className="flex items-center gap-2">
                {SOCIAL_LINKS.map(({ Icon, href, label }) => (
                  <a
                    key={label}
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={label}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-app-border bg-app-surface/60 text-app-muted backdrop-blur-sm transition-colors hover:border-app-accent hover:text-app-accent"
                  >
                    <Icon className="h-4 w-4" />
                  </a>
                ))}
              </div>
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
