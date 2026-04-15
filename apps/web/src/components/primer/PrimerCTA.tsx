"use client";

import Link from "next/link";
import { useRef } from "react";
import { motion, useInView } from "framer-motion";
import { ArrowRight, Code, Send } from "lucide-react";

interface Action {
  Icon: typeof ArrowRight;
  label: string;
  desc: string;
  href: string;
  primary: boolean;
  external?: boolean;
}

const actions: Action[] = [
  {
    Icon: ArrowRight,
    label: "Launch Testnet",
    desc: "Baskets managed by autonomous AI vault agents on Sepolia testnet.",
    href: "/baskets",
    primary: true,
  },
  {
    Icon: Code,
    label: "View on GitHub",
    desc: "Explore the codebase — request access on Telegram.",
    href: "https://github.com/reubenr0d/indexflow-prototype",
    primary: false,
    external: true,
  },
  {
    Icon: Send,
    label: "Join Telegram",
    desc: "Chat with the team, read the whitepaper, and follow protocol updates.",
    href: "https://t.me/+gNSBM_gBQ1NkNTY1",
    primary: false,
    external: true,
  },
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
        style={{ background: "linear-gradient(90deg, transparent, var(--accent), transparent)" }}
        aria-hidden
      />
      <div className="relative z-10 mx-auto max-w-5xl px-4 text-center sm:px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        >
          <p className="font-mono text-xs font-semibold uppercase tracking-[0.24em] text-app-accent">
            Get Started
          </p>
          <h2 className="primer-gradient-text mt-4 inline-block text-3xl font-bold sm:text-4xl">
            Start building on IndexFlow
          </h2>
          <p className="mx-auto mt-4 max-w-lg text-app-muted">
            The protocol is live on Sepolia testnet. Explore the app or read
            the full thesis in our Telegram group.
          </p>
        </motion.div>

        <div className="mx-auto mt-12 grid max-w-3xl gap-5 sm:grid-cols-3">
          {actions.map((a, i) => {
            const cardClass = a.primary
              ? "border-app-accent bg-app-accent/5 hover:bg-app-accent/10 hover:shadow-[0_0_30px_-6px_color-mix(in_srgb,var(--accent)_40%,transparent)]"
              : "border-app-border bg-app-surface hover:border-app-border-strong hover:shadow-[0_0_20px_-4px_color-mix(in_srgb,var(--accent)_20%,transparent)]";
            const iconClass = a.primary
              ? "bg-app-accent text-app-accent-fg"
              : "bg-app-accent-dim text-app-accent";

            const inner = (
              <>
                <div className={`flex h-11 w-11 items-center justify-center rounded-lg ${iconClass}`}>
                  <a.Icon className="h-5 w-5" />
                </div>
                <h3 className="mt-4 font-semibold text-app-text">{a.label}</h3>
                <p className="mt-2 text-sm text-app-muted">{a.desc}</p>
              </>
            );

            return (
              <motion.div
                key={a.label}
                initial={{ opacity: 0, y: 16 }}
                animate={isInView ? { opacity: 1, y: 0 } : {}}
                transition={{
                  delay: 0.15 + i * 0.1,
                  duration: 0.45,
                  ease: [0.22, 1, 0.36, 1],
                }}
              >
                {a.external ? (
                  <a
                    href={a.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`flex h-full flex-col items-center rounded-xl border p-6 transition-all duration-300 ${cardClass}`}
                  >
                    {inner}
                  </a>
                ) : (
                  <Link
                    href={a.href}
                    className={`flex h-full flex-col items-center rounded-xl border p-6 transition-all duration-300 ${cardClass}`}
                  >
                    {inner}
                  </Link>
                )}
              </motion.div>
            );
          })}
        </div>
      </div>

    </section>
  );
}
