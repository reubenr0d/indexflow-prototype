"use client";

import { useRef } from "react";
import { motion, useInView } from "framer-motion";
import { Section, SectionLabel, SectionHeading } from "./Section";
import { Briefcase, Globe } from "lucide-react";

const audiences = [
  {
    Icon: Briefcase,
    title: "Managers & Issuers",
    body: "Build structured vaults with custom return schedules, custom oracles, domain-specific logic, and ring-fenced reserves. IndexFlow gives professional operators an institutional-grade surface for onchain products.",
    items: [
      "Fintech & asset managers",
      "Institutional issuers",
      "RWA operators",
    ],
  },
  {
    Icon: Globe,
    title: "Chain Partners",
    body: "Deploy ring-fenced liquidity with full attribution. Every unit of support is traceable to TVL, volume, and fee generation. No cross-chain dilution of results.",
    items: [
      "Grant committees",
      "Ecosystem funds",
      "Infrastructure pilots",
    ],
  },
];

export default function PrimerWho() {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-80px" });

  return (
    <Section
      id="who"
      className="border-b border-app-border bg-app-bg-subtle py-24 sm:py-32"
    >
      <SectionLabel>Built For</SectionLabel>
      <SectionHeading>Two audiences, one system</SectionHeading>

      <div ref={ref} className="mt-14 grid gap-6 md:grid-cols-2">
        {audiences.map((a, i) => (
          <motion.div
            key={a.title}
            initial={{ opacity: 0, y: 20 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.5, delay: i * 0.15, ease: [0.22, 1, 0.36, 1] }}
            className="group primer-glow-card primer-glass flex flex-col rounded-xl border border-app-border p-7"
          >
            <div className="relative">
              <div
                className="absolute -inset-3 rounded-2xl opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                style={{ background: "radial-gradient(circle, color-mix(in srgb, var(--accent) 10%, transparent), transparent 70%)" }}
              />
              <div className="relative flex h-12 w-12 items-center justify-center rounded-lg bg-app-accent-dim text-app-accent">
                <div
                  className="absolute inset-0 rounded-lg opacity-40"
                  style={{ boxShadow: "0 0 20px color-mix(in srgb, var(--accent) 30%, transparent)" }}
                />
                <a.Icon className="relative h-6 w-6" />
              </div>
            </div>
            <h3 className="mt-5 text-xl font-semibold text-app-text">
              {a.title}
            </h3>
            <p className="mt-3 flex-1 text-sm leading-relaxed text-app-muted">
              {a.body}
            </p>
            <ul className="mt-5 space-y-2 border-t border-app-border pt-5">
              {a.items.map((item, j) => (
                <motion.li
                  key={item}
                  initial={{ opacity: 0, x: -8 }}
                  animate={isInView ? { opacity: 1, x: 0 } : {}}
                  transition={{
                    delay: i * 0.15 + 0.3 + j * 0.08,
                    duration: 0.35,
                    ease: [0.22, 1, 0.36, 1],
                  }}
                  className="flex items-center gap-2 text-sm text-app-muted"
                >
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-app-accent" />
                  {item}
                </motion.li>
              ))}
            </ul>
          </motion.div>
        ))}
      </div>
    </Section>
  );
}
