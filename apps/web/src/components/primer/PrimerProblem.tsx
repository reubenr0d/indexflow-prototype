"use client";

import { useRef } from "react";
import { motion, useInView } from "framer-motion";
import { Section, SectionLabel, SectionHeading, SectionBody } from "./Section";
import {
  ShortLivedSVG,
  NoAttributionSVG,
  IlliquidSVG,
  OpaqueNAVSVG,
  FragmentedSVG,
} from "./primer-svgs";

const chainProblems = [
  {
    title: "Short-Lived TVL Spikes",
    body: "Liquidity incentives attract mercenary capital that exits as soon as rewards dry up.",
    visual: ShortLivedSVG,
  },
  {
    title: "No Attribution Layer",
    body: "Grant programmes lack causal links between funding and sustained on-chain activity.",
    visual: NoAttributionSVG,
  },
];

const investorProblems = [
  {
    title: "Illiquid Redemptions",
    body: "Basket products lock capital with no clear exit path. Holders wait for manual unwinds or discount-priced OTC deals.",
    visual: IlliquidSVG,
  },
  {
    title: "Opaque NAV",
    body: "Portfolio value can\u2019t be independently verified on-chain. Investors trust off-chain reports instead of transparent pricing.",
    visual: OpaqueNAVSVG,
  },
];

export default function PrimerProblem() {
  const chainRef = useRef<HTMLDivElement>(null);
  const chainInView = useInView(chainRef, { once: true, margin: "-100px" });

  const investorRef = useRef<HTMLDivElement>(null);
  const investorInView = useInView(investorRef, { once: true, margin: "-100px" });

  const fragRef = useRef<HTMLDivElement>(null);
  const fragInView = useInView(fragRef, { once: true, margin: "-80px" });

  return (
    <Section
      id="problem"
      className="primer-section-glow primer-section-glow-br border-b border-app-border bg-app-surface py-24 sm:py-32"
    >
      <SectionLabel>Why IndexFlow</SectionLabel>
      <SectionHeading>
        On-chain structured products are broken
      </SectionHeading>
      <SectionBody>
        Strong primitives exist, but the product stack is fragmented.
        Chains can&rsquo;t prove what incentive capital generated; investors
        can&rsquo;t verify what their shares are worth.
      </SectionBody>

      <div className="relative z-10 mt-14 grid gap-8 md:grid-cols-2">
        {/* For Chains — left column */}
        <div ref={chainRef} className="flex flex-col gap-5">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-app-accent">
            For Chains
          </p>
          {chainProblems.map((p, i) => (
            <motion.div
              key={p.title}
              initial={{ opacity: 0, y: 24 }}
              animate={chainInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.5, delay: i * 0.12, ease: [0.22, 1, 0.36, 1] }}
              className="primer-glow-card flex flex-1 flex-col rounded-xl border border-app-border bg-app-bg p-6"
            >
              <div className="mb-5 flex h-36 items-center justify-center">
                <p.visual />
              </div>
              <h3 className="text-lg font-semibold text-app-text">{p.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-app-muted">{p.body}</p>
            </motion.div>
          ))}
        </div>

        {/* For Investors — right column */}
        <div ref={investorRef} className="flex flex-col gap-5">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-app-accent">
            For Investors
          </p>
          {investorProblems.map((p, i) => (
            <motion.div
              key={p.title}
              initial={{ opacity: 0, y: 24 }}
              animate={investorInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.5, delay: i * 0.12, ease: [0.22, 1, 0.36, 1] }}
              className="primer-glow-card flex flex-1 flex-col rounded-xl border border-app-border bg-app-bg p-6"
            >
              <div className="mb-5 flex h-36 items-center justify-center">
                <p.visual />
              </div>
              <h3 className="text-lg font-semibold text-app-text">{p.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-app-muted">{p.body}</p>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Fragmented Capital — spans both columns */}
      <motion.div
        ref={fragRef}
        initial={{ opacity: 0, y: 24 }}
        animate={fragInView ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="primer-glow-card relative z-10 mt-8 flex flex-col items-center rounded-xl border border-app-border bg-app-bg p-6 md:flex-row md:gap-8"
      >
        <div className="flex shrink-0 items-center justify-center md:w-56">
          <FragmentedSVG />
        </div>
        <div className="mt-4 md:mt-0">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-app-accent">
            Shared Problem
          </p>
          <h3 className="mt-2 text-lg font-semibold text-app-text">
            Fragmented Capital
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-app-muted">
            Dispersed deployments dilute impact for chains and fragment liquidity
            for investors. Capital spreads thin with no measurable outcome on
            either side.
          </p>
        </div>
      </motion.div>
    </Section>
  );
}

