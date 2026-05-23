"use client";

import Link from "next/link";
import { useRef } from "react";
import { motion, useInView } from "framer-motion";
import { ArrowRight, Bot, Code, Send, Wallet } from "lucide-react";
import { XLogo } from "@/components/icons/x-logo";

const TELEGRAM_URL = "https://t.me/+gNSBM_gBQ1NkNTY1";
const X_URL = "https://x.com/indexflowDAO";
const GITHUB_URL = "https://github.com/reubenr0d/indexflow-prototype";
const ADMIN_BASKETS_URL = "/admin/baskets";
const BASKETS_URL = "/baskets";

const SOCIAL_LINKS: Array<{
  Icon: React.ComponentType<{ className?: string }>;
  href: string;
  label: string;
}> = [
  { Icon: Code, href: GITHUB_URL, label: "GitHub" },
  { Icon: XLogo, href: X_URL, label: "X (Twitter)" },
  { Icon: Send, href: TELEGRAM_URL, label: "Telegram" },
];

export default function PrimerCTA() {
  const ref = useRef<HTMLElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-80px" });

  return (
    <section
      id="cta"
      ref={ref}
      className="primer-section-glow primer-section-glow-tl relative py-24 sm:py-32"
    >
      <div
        className="absolute inset-x-0 top-0 h-px"
        style={{
          background:
            "linear-gradient(90deg, transparent, var(--accent), transparent)",
        }}
        aria-hidden
      />
      <div className="relative z-10 mx-auto max-w-5xl px-4 text-center sm:px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        >
          <p className="font-mono text-xs font-semibold uppercase tracking-[0.24em] text-app-accent">
            Build with IndexFlow
          </p>
          <h2 className="primer-gradient-text mt-4 inline-block text-3xl font-bold sm:text-4xl">
            Spin up your own AI vault manager
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-app-muted">
            Fork the framework and ship an autonomous agent on testnet, or
            curate a basket as a human. Investors can deposit test USDC into
            existing baskets to try the flow end-to-end.
          </p>

          <div className="mt-6 inline-flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 font-mono text-[10.5px] font-semibold uppercase tracking-[0.18em] text-amber-700 dark:text-amber-300">
            <span className="relative flex h-2 w-2" aria-hidden>
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-500/70" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-500" />
            </span>
            Testnet · prototype · no real funds
          </div>
        </motion.div>

        <div className="mx-auto mt-12 grid max-w-3xl gap-5 sm:grid-cols-2">
          {/* Card 1 — Build an AI vault manager */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{
              delay: 0.15,
              duration: 0.45,
              ease: [0.22, 1, 0.36, 1],
            }}
          >
            <div className="group relative flex h-full flex-col items-center rounded-xl border border-app-accent bg-app-accent/5 p-6 text-center transition-all duration-300 hover:bg-app-accent/10 hover:shadow-[0_0_30px_-6px_color-mix(in_srgb,var(--accent)_40%,transparent)]">
              <a
                href={GITHUB_URL}
                target="_blank"
                rel="noopener noreferrer"
                data-testid="cta-build-agent"
                aria-label="Build an AI vault manager — view on GitHub"
                className="absolute inset-0 rounded-xl"
              />
              <div className="pointer-events-none flex h-11 w-11 items-center justify-center rounded-lg bg-app-accent text-app-accent-fg">
                <Bot className="h-5 w-5" />
              </div>
              <h3 className="pointer-events-none mt-4 font-semibold text-app-text">
                Build an AI vault manager
              </h3>
              <p className="pointer-events-none mt-2 text-sm text-app-muted">
                Fork the framework and deploy an autonomous agent that manages
                a basket on testnet.
              </p>
              <span className="pointer-events-none mt-4 inline-flex items-center gap-1 text-xs font-medium text-app-accent">
                View on GitHub <ArrowRight className="h-3.5 w-3.5" />
              </span>
              <Link
                href={ADMIN_BASKETS_URL}
                data-testid="cta-create-as-human"
                className="relative z-10 mt-3 text-xs text-app-muted transition-colors hover:text-app-accent"
              >
                or create one as a human →
              </Link>
            </div>
          </motion.div>

          {/* Card 2 — Invest in baskets */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{
              delay: 0.25,
              duration: 0.45,
              ease: [0.22, 1, 0.36, 1],
            }}
          >
            <Link
              href={BASKETS_URL}
              data-testid="cta-invest"
              className="group relative flex h-full flex-col items-center rounded-xl border border-sky-500/40 bg-sky-500/5 p-6 text-center transition-all duration-300 hover:bg-sky-500/10 hover:shadow-[0_0_30px_-6px_rgba(56,189,248,0.4)]"
            >
              <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-sky-500 text-white">
                <Wallet className="h-5 w-5" />
              </div>
              <h3 className="mt-4 font-semibold text-app-text">
                Invest in baskets
              </h3>
              <p className="mt-2 text-sm text-app-muted">
                Deposit test USDC on testnet into curated baskets and hold a
                single tokenised share. Testnet only — not real funds.
              </p>
              <span className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-sky-600 dark:text-sky-400">
                Browse baskets <ArrowRight className="h-3.5 w-3.5" />
              </span>
            </Link>
          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{
            delay: 0.4,
            duration: 0.45,
            ease: [0.22, 1, 0.36, 1],
          }}
          className="mt-12 flex flex-col items-center gap-3"
        >
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-app-muted">
            Follow IndexFlow
          </p>
          <div className="flex items-center gap-2">
            {SOCIAL_LINKS.map(({ Icon, href, label }) => (
              <a
                key={label}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={label}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-app-border bg-app-surface text-app-muted transition-colors hover:border-app-accent hover:text-app-accent"
              >
                <Icon className="h-4 w-4" />
              </a>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
}
