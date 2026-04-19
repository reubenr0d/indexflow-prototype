"use client";

import { useRef } from "react";
import { motion, useInView } from "framer-motion";
import { Section, SectionLabel, SectionHeading, SectionBody } from "./Section";

export default function PrimerNAV() {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-80px" });

  return (
    <Section
      id="nav-insight"
      className="primer-section-glow primer-section-glow-br border-b border-app-border bg-app-surface py-24 sm:py-32"
    >
      <SectionLabel>Core Constraint</SectionLabel>
      <SectionHeading>NAV does not mean redeemable liquidity</SectionHeading>
      <SectionBody>
        Portfolio value and exit liquidity are different state variables.
        IndexFlow defines that difference as the gap between 
        full NAV and redeemable liquidity, and treats it as the primary architectural
        constraint.
      </SectionBody>

      <div ref={ref} className="relative z-10 mt-16 flex flex-col items-center">
        {/* Mobile stacked layout */}
        <div className="flex w-full max-w-sm flex-col gap-3 sm:hidden">
          <motion.div
            initial={{ opacity: 0, scaleX: 0 }}
            animate={isInView ? { opacity: 1, scaleX: 1 } : {}}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            style={{ transformOrigin: "left" }}
            className="rounded-lg border-2 border-app-accent/40 bg-app-accent/5 px-4 py-3"
          >
            <p className="text-center text-sm font-semibold text-app-accent">Full NAV</p>
            <div className="mt-1 flex justify-between font-mono text-[10px] text-app-muted">
              <span>IDLE USDC</span>
              <span>ALLOCATED + PnL</span>
            </div>
          </motion.div>

          <div className="flex justify-center text-app-muted/40">
            <svg width="20" height="24" viewBox="0 0 20 24" fill="none" aria-hidden>
              <path d="M10 0v20m0 0l-5-5m5 5l5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>

          <div className="flex gap-3">
            <motion.div
              initial={{ opacity: 0, scaleX: 0 }}
              animate={isInView ? { opacity: 1, scaleX: 1 } : {}}
              transition={{ delay: 0.2, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              style={{ transformOrigin: "left" }}
              className="flex-[36] rounded-lg border-2 border-emerald-500/40 bg-emerald-500/5 px-3 py-3"
            >
              <p className="text-center text-xs font-semibold text-emerald-500">Redeemable</p>
              <p className="mt-0.5 text-center font-mono text-[10px] text-app-muted">~36%</p>
            </motion.div>
            <motion.div
              initial={{ opacity: 0 }}
              animate={isInView ? { opacity: 1 } : {}}
              transition={{ delay: 0.4, duration: 0.4 }}
              className="flex flex-[64] items-center justify-center rounded-lg border border-dashed border-red-500/20 bg-red-500/[0.03] px-3 py-3"
            >
              <p className="text-center font-mono text-[10px] text-red-400/70">NOT INSTANTLY REDEEMABLE</p>
            </motion.div>
          </div>

          <p className="mt-2 text-center text-xs text-app-muted">
            Reserve depth is a product-quality parameter, not a treasury setting.
          </p>
          <p className="text-center font-mono text-[9px] uppercase tracking-[0.2em] text-app-muted/50">
            Illustrative — not live data
          </p>
        </div>

        {/* Desktop SVG diagram */}
        <svg viewBox="0 0 600 280" className="hidden w-full max-w-2xl sm:block" aria-hidden>
          <defs>
            <linearGradient id="nav-bar-grad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="var(--accent)" />
              <stop offset="100%" stopColor="#38bdf8" />
            </linearGradient>
            <linearGradient id="redeem-bar-grad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="var(--success)" />
              <stop offset="100%" stopColor="#34d399" />
            </linearGradient>
            <pattern id="gap-hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <line x1="0" y1="0" x2="0" y2="8" stroke="var(--danger)" strokeWidth="1" opacity="0.08" />
            </pattern>
            <linearGradient id="nav-scan-grad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="var(--accent)" stopOpacity="0" />
              <stop offset="50%" stopColor="var(--accent)" stopOpacity="0.15" />
              <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
            </linearGradient>
            <clipPath id="nav-bar-clip">
              <rect x="50" y="40" width="500" height="50" rx="8" />
            </clipPath>
          </defs>

          {/* Full NAV bar */}
          <motion.g
            initial={{ opacity: 0, scaleX: 0 }}
            animate={isInView ? { opacity: 1, scaleX: 1 } : {}}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            style={{ transformOrigin: "50px 60px" }}
          >
            <rect x="50" y="40" width="500" height="50" rx="8" fill="url(#nav-bar-grad)" opacity="0.15" />
            <rect x="50" y="40" width="500" height="50" rx="8" fill="none" stroke="url(#nav-bar-grad)" strokeWidth="2" />
            <text x="300" y="72" textAnchor="middle" fontSize="14" fill="var(--accent)" fontWeight="600">
              Full NAV
            </text>
            <g clipPath="url(#nav-bar-clip)">
              <rect x="50" y="40" width="80" height="50" fill="url(#nav-scan-grad)" opacity="0">
                <animate attributeName="x" values="0;600" dur="3s" begin="1.2s" repeatCount="indefinite" />
                <animate attributeName="opacity" values="0;0.35;0" dur="3s" begin="1.2s" repeatCount="indefinite" />
              </rect>
            </g>
          </motion.g>

          {/* NAV breakdown labels */}
          <motion.g
            initial={{ opacity: 0 }}
            animate={isInView ? { opacity: 1 } : {}}
            transition={{ delay: 0.4, duration: 0.4 }}
          >
            <rect x="50" y="40" width="180" height="50" rx="8" fill="var(--accent)" opacity="0.08" />
            <line x1="230" y1="40" x2="230" y2="90" stroke="var(--accent)" strokeWidth="1" strokeDasharray="4 3" opacity="0.5" />
            <text x="140" y="30" textAnchor="middle" fontSize="10" fill="var(--text-muted)" fontFamily="var(--font-mono-app)">
              IDLE USDC
            </text>
            <text x="340" y="30" textAnchor="middle" fontSize="10" fill="var(--text-muted)" fontFamily="var(--font-mono-app)">
              ALLOCATED + PnL
            </text>
          </motion.g>

          {/* Animated connector between NAV and Redeemable */}
          <motion.g
            initial={{ opacity: 0 }}
            animate={isInView ? { opacity: 1 } : {}}
            transition={{ delay: 0.6, duration: 0.4 }}
          >
            <line x1="140" y1="92" x2="140" y2="128" stroke="var(--border-strong)" strokeWidth="1.5" strokeDasharray="4 3" style={{ animationName: "primer-dash-flow", animationDuration: "1.2s", animationTimingFunction: "linear", animationIterationCount: "infinite" }} />
          </motion.g>

          {/* Redeemable bar */}
          <motion.g
            initial={{ opacity: 0, scaleX: 0 }}
            animate={isInView ? { opacity: 1, scaleX: 1 } : {}}
            transition={{ duration: 0.6, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
            style={{ transformOrigin: "50px 160px" }}
          >
            <rect x="50" y="130" width="180" height="50" rx="8" fill="url(#redeem-bar-grad)" opacity="0.15" />
            <rect x="50" y="130" width="180" height="50" rx="8" fill="none" stroke="url(#redeem-bar-grad)" strokeWidth="2" />
            <text x="140" y="162" textAnchor="middle" fontSize="14" fill="var(--success)" fontWeight="600">
              Redeemable
            </text>
            <rect x="50" y="130" width="180" height="50" rx="8" fill="none" stroke="var(--success)" strokeWidth="2" opacity="0">
              <animate attributeName="opacity" values="0;0.35;0" dur="2.5s" begin="1.2s" repeatCount="indefinite" />
              <animate attributeName="strokeWidth" values="2;4;2" dur="2.5s" begin="1.2s" repeatCount="indefinite" />
            </rect>
          </motion.g>

          {/* Gap indicator with hatch pattern */}
          <motion.g
            initial={{ opacity: 0 }}
            animate={isInView ? { opacity: 1 } : {}}
            transition={{ delay: 0.7, duration: 0.5 }}
          >
            <rect x="238" y="128" width="309" height="54" rx="6" fill="none" stroke="var(--danger)" strokeWidth="1" opacity="0.08">
              <animate attributeName="opacity" values="0.08;0.2;0.08" dur="3s" begin="1.5s" repeatCount="indefinite" />
              <animate attributeName="strokeWidth" values="1;2;1" dur="3s" begin="1.5s" repeatCount="indefinite" />
            </rect>
            <rect x="240" y="130" width="305" height="50" rx="4" fill="url(#gap-hatch)" />
            <line x1="240" y1="140" x2="545" y2="140" stroke="var(--border-strong)" strokeWidth="1" strokeDasharray="5 4" style={{ animationName: "primer-dash-flow", animationDuration: "1.5s", animationTimingFunction: "linear", animationIterationCount: "infinite" }} />
            <line x1="240" y1="170" x2="545" y2="170" stroke="var(--border-strong)" strokeWidth="1" strokeDasharray="5 4" style={{ animationName: "primer-dash-flow", animationDuration: "1.5s", animationTimingFunction: "linear", animationIterationCount: "infinite", animationDirection: "reverse" }} />
            <text x="395" y="160" textAnchor="middle" fontSize="11" fill="var(--danger)" fontFamily="var(--font-mono-app)" opacity="0.7">
              NOT INSTANTLY REDEEMABLE
              <animate attributeName="opacity" values="0.5;0.9;0.5" dur="3s" begin="1.5s" repeatCount="indefinite" />
            </text>
          </motion.g>

          {/* Labels on right with pulsing dots */}
          <motion.g
            initial={{ opacity: 0 }}
            animate={isInView ? { opacity: 1 } : {}}
            transition={{ delay: 0.5, duration: 0.4 }}
          >
            <circle cx="556" cy="66" r="3" fill="var(--accent)">
              <animate attributeName="opacity" values="1;0.3;1" dur="2s" repeatCount="indefinite" />
            </circle>
            <text x="564" y="70" fontSize="11" fill="var(--text-muted)" fontFamily="var(--font-mono-app)">
              100%
              <animate attributeName="opacity" values="1;0.5;1" dur="2.5s" begin="1.2s" repeatCount="indefinite" />
            </text>
            <circle cx="236" cy="188" r="3" fill="var(--success)">
              <animate attributeName="opacity" values="1;0.3;1" dur="2s" repeatCount="indefinite" />
            </circle>
            <text x="244" y="192" fontSize="11" fill="var(--text-muted)" fontFamily="var(--font-mono-app)">
              ~36%
              <animate attributeName="opacity" values="1;0.5;1" dur="2.5s" begin="1.8s" repeatCount="indefinite" />
            </text>
          </motion.g>

          <text x="300" y="240" textAnchor="middle" fontSize="12" fill="var(--text-muted)">
            Reserve depth is a product-quality parameter, not a treasury setting.
          </text>
          <text x="300" y="265" textAnchor="middle" fontSize="9" fill="var(--text-muted)" fontFamily="var(--font-mono-app)" opacity="0.5">
            ILLUSTRATIVE — NOT LIVE DATA
          </text>
        </svg>
      </div>
    </Section>
  );
}
