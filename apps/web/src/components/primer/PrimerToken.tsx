"use client";

import { useRef } from "react";
import { motion, useInView } from "framer-motion";
import { Section, SectionLabel, SectionHeading, SectionBody } from "./Section";
import {
  ShieldCheck,
  UserCheck,
  Globe,
  Compass,
  Landmark,
  Database,
} from "lucide-react";

const controlPoints = [
  {
    Icon: ShieldCheck,
    title: "Basket Support",
    desc: "Which baskets receive protocol support",
    gradient: "from-teal-500/20 to-cyan-500/10",
  },
  {
    Icon: UserCheck,
    title: "Manager Admission",
    desc: "Which managers are admitted or prioritised",
    gradient: "from-cyan-500/20 to-sky-500/10",
  },
  {
    Icon: Globe,
    title: "Chain Expansion",
    desc: "Which chains receive liquidity expansion",
    gradient: "from-sky-500/20 to-indigo-500/10",
  },
  {
    Icon: Compass,
    title: "Incentive Direction",
    desc: "How incentive budgets are directed",
    gradient: "from-indigo-500/20 to-purple-500/10",
  },
  {
    Icon: Landmark,
    title: "Protocol-Owned Liquidity",
    desc: "When protocol-owned liquidity is increased",
    gradient: "from-emerald-500/20 to-teal-500/10",
  },
  {
    Icon: Database,
    title: "Asset / Oracle Admission",
    desc: "Which assets are allowed given reliable price feeds",
    gradient: "from-teal-500/20 to-emerald-500/10",
  },
];

const allocSegments = [
  { pct: 40, label: "Liquidity", gradFrom: "var(--accent)", gradTo: "#2dd4bf" },
  { pct: 35, label: "Ecosystem", gradFrom: "#059669", gradTo: "#34d399" },
  { pct: 15, label: "Team", gradFrom: "#0891b2", gradTo: "#22d3ee" },
  { pct: 10, label: "Private", gradFrom: "#0284c7", gradTo: "#38bdf8" },
];

export function PrimerToken() {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-80px" });

  return (
    <Section
      id="token"
      className="primer-section-glow primer-section-glow-br border-b border-app-border bg-app-surface py-24 sm:py-32"
    >
      <SectionLabel>$FLOW Token</SectionLabel>
      <SectionHeading>Governs concrete control points</SectionHeading>
      <SectionBody>
        The token is not required for initial usage. It becomes the coordination
        layer after the system is working. Seed liquidity first, emit later.
      </SectionBody>

      <div ref={ref} className="relative z-10 mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {controlPoints.map((cp, i) => (
          <motion.div
            key={cp.title}
            initial={{ opacity: 0, y: 16 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{
              delay: i * 0.08,
              duration: 0.4,
              ease: [0.22, 1, 0.36, 1],
            }}
            className="primer-glow-card rounded-lg border border-app-border bg-app-bg p-5"
          >
            <div className={`flex h-10 w-10 items-center justify-center rounded-md bg-gradient-to-br ${cp.gradient} text-app-accent`}>
              <cp.Icon className="h-5 w-5" />
            </div>
            <h3 className="mt-4 font-semibold text-app-text">{cp.title}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-app-muted">
              {cp.desc}
            </p>
          </motion.div>
        ))}
      </div>

      {/* Allocation bar */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={isInView ? { opacity: 1, y: 0 } : {}}
        transition={{ delay: 0.5, duration: 0.5 }}
        className="mt-12 rounded-xl border border-app-border bg-app-bg p-6"
      >
        <p className="mb-4 font-mono text-xs font-semibold uppercase tracking-wider text-app-muted">
          Token Allocation
        </p>
        <div className="flex h-7 gap-0.5 overflow-hidden rounded-full">
          {allocSegments.map((seg) => (
            <motion.div
              key={seg.label}
              className="relative"
              style={{
                background: `linear-gradient(135deg, ${seg.gradFrom}, ${seg.gradTo})`,
              }}
              initial={{ width: 0 }}
              animate={isInView ? { width: `${seg.pct}%` } : {}}
              transition={{ delay: 0.6, duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
              title={`${seg.label}: ${seg.pct}%`}
            >
              <div
                className="absolute inset-0"
                style={{
                  background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.15), transparent)",
                  animation: "primer-shimmer 3s ease-in-out infinite",
                }}
              />
            </motion.div>
          ))}
        </div>
        <div className="mt-2 flex">
          {allocSegments.map((seg) => (
            <div key={seg.label} style={{ width: `${seg.pct}%` }} className="text-xs text-app-muted">
              <span className="flex items-center gap-1.5">
                <span
                  className="h-2.5 w-2.5 rounded-sm"
                  style={{ background: `linear-gradient(135deg, ${seg.gradFrom}, ${seg.gradTo})` }}
                />
                {seg.label} {seg.pct}%
              </span>
            </div>
          ))}
        </div>
      </motion.div>
    </Section>
  );
}
