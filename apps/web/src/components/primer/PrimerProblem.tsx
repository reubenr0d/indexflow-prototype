"use client";

import { useRef } from "react";
import { motion, useInView } from "framer-motion";
import { Section, SectionLabel, SectionHeading, SectionBody } from "./Section";

const problems = [
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
  {
    title: "Fragmented Capital",
    body: "Dispersed deployments dilute impact. Capital spreads thin with no measurable outcome.",
    visual: FragmentedSVG,
  },
];

export function PrimerProblem() {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });

  return (
    <Section id="problem" className="primer-section-glow primer-section-glow-br border-b border-app-border bg-app-surface py-24 sm:py-32">
      <SectionLabel>Why IndexFlow</SectionLabel>
      <SectionHeading>On-chain structured products are broken</SectionHeading>
      <SectionBody>
        Strong primitives exist, but the product stack is fragmented. Three gaps
        remain for chains and institutions seeking durable, measurable growth.
      </SectionBody>

      <div ref={ref} className="relative z-10 mt-14 grid gap-6 md:grid-cols-3">
        {problems.map((p, i) => (
          <motion.div
            key={p.title}
            initial={{ opacity: 0, y: 24 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.5, delay: i * 0.12, ease: [0.22, 1, 0.36, 1] }}
            className="primer-glow-card flex flex-col rounded-xl border border-app-border bg-app-bg p-6"
          >
            <div className="mb-5 flex h-40 items-center justify-center">
              <p.visual />
            </div>
            <h3 className="text-lg font-semibold text-app-text">{p.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-app-muted">{p.body}</p>
          </motion.div>
        ))}
      </div>
    </Section>
  );
}

function ShortLivedSVG() {
  return (
    <svg viewBox="0 0 200 120" className="h-32 w-auto" aria-hidden>
      <defs>
        <linearGradient id="spike-area-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.35" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="spike-line-grad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.4" />
          <stop offset="40%" stopColor="var(--accent)" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.3" />
        </linearGradient>
      </defs>
      <line x1="20" y1="100" x2="180" y2="100" stroke="var(--border)" strokeWidth="1" />
      {/* Area fill under the curve */}
      <polygon
        points="30,90 60,85 80,30 100,25 120,70 140,88 160,92 170,95 170,100 30,100"
        fill="url(#spike-area-grad)"
      />
      <polyline
        points="30,90 60,85 80,30 100,25 120,70 140,88 160,92 170,95"
        fill="none"
        stroke="url(#spike-line-grad)"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      {/* Pulsing peak dot */}
      <circle cx="100" cy="25" r="6" fill="var(--accent)" opacity="0.15">
        <animate attributeName="r" values="4;8;4" dur="2s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.25;0.08;0.25" dur="2s" repeatCount="indefinite" />
      </circle>
      <circle cx="100" cy="25" r="3.5" fill="var(--accent)" />
      {/* Animated drop arrow */}
      <line
        x1="130" y1="50" x2="155" y2="85"
        stroke="var(--danger)" strokeWidth="1.5"
        strokeDasharray="4 3"
        style={{ animation: "primer-dash-flow 1s linear infinite" }}
      />
      <polygon points="155,85 148,78 158,80" fill="var(--danger)" />
      <text x="100" y="14" textAnchor="middle" fontSize="9" fill="var(--accent)" fontFamily="var(--font-mono-app)" fontWeight="600">
        SPIKE
      </text>
    </svg>
  );
}

function NoAttributionSVG() {
  return (
    <svg viewBox="0 0 200 120" className="h-32 w-auto" aria-hidden>
      <defs>
        <linearGradient id="no-attr-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="var(--border-strong)" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.3" />
        </linearGradient>
      </defs>
      {/* Rotating dashed circles */}
      <circle cx="60" cy="50" r="28" fill="var(--accent)" opacity="0.04" />
      <circle cx="60" cy="50" r="28" fill="none" stroke="url(#no-attr-grad)" strokeWidth="1.5" strokeDasharray="5 3"
        style={{ animation: "primer-slow-spin 12s linear infinite" }} transform-origin="60 50" />
      <circle cx="140" cy="60" r="24" fill="var(--accent)" opacity="0.04" />
      <circle cx="140" cy="60" r="24" fill="none" stroke="url(#no-attr-grad)" strokeWidth="1.5" strokeDasharray="5 3"
        style={{ animation: "primer-slow-spin 10s linear infinite reverse" }} transform-origin="140 60" />
      {/* Broken link line */}
      <line x1="85" y1="48" x2="95" y2="51" stroke="var(--border-strong)" strokeWidth="2" />
      <line x1="105" y1="54" x2="115" y2="57" stroke="var(--border-strong)" strokeWidth="2" />
      <text x="100" y="56" textAnchor="middle" fontSize="10" fill="var(--danger)" fontWeight="700" opacity="0.7">
        {"///"}
      </text>
      {/* Icons inside circles */}
      <text x="60" y="54" textAnchor="middle" fontSize="18" fill="var(--text-muted)" fontWeight="700" opacity="0.6">$</text>
      <text x="140" y="64" textAnchor="middle" fontSize="16" fill="var(--text-muted)" fontWeight="700" opacity="0.6">?</text>
      {/* Labels */}
      <text x="60" y="90" textAnchor="middle" fontSize="8" fill="var(--text-muted)" fontFamily="var(--font-mono-app)">
        FUNDING
      </text>
      <text x="140" y="95" textAnchor="middle" fontSize="8" fill="var(--text-muted)" fontFamily="var(--font-mono-app)">
        OUTCOMES
      </text>
    </svg>
  );
}

function FragmentedSVG() {
  const boxes = [
    { x: 25, y: 20, w: 35, h: 25, drift: "primer-frag-drift-a 9s ease-in-out infinite" },
    { x: 80, y: 15, w: 30, h: 20, drift: "primer-frag-drift-b 11s ease-in-out infinite" },
    { x: 130, y: 30, w: 40, h: 22, drift: "primer-frag-drift-c 10s ease-in-out infinite" },
    { x: 40, y: 65, w: 32, h: 24, drift: "primer-frag-drift-a 12s ease-in-out infinite reverse" },
    { x: 100, y: 70, w: 35, h: 20, drift: "primer-frag-drift-b 8s ease-in-out infinite reverse" },
    { x: 155, y: 75, w: 28, h: 22, drift: "primer-frag-drift-c 13s ease-in-out infinite" },
  ];
  const dots = [
    { cx: 58, cy: 28, bx: "-8px", by: "-6px", delay: "0s" },
    { cx: 108, cy: 22, bx: "7px", by: "-5px", delay: "1.2s" },
    { cx: 135, cy: 80, bx: "6px", by: "5px", delay: "2.4s" },
    { cx: 42, cy: 72, bx: "-6px", by: "4px", delay: "3.6s" },
  ];
  return (
    <svg viewBox="0 0 200 120" className="primer-stage-anim h-32 w-auto" aria-hidden>
      <defs>
        <linearGradient id="frag-box-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.1" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.02" />
        </linearGradient>
      </defs>
      {boxes.map((b, i) => (
        <g key={i} style={{ animation: b.drift }}>
          <rect
            x={b.x} y={b.y} width={b.w} height={b.h} rx="4"
            fill="url(#frag-box-grad)"
            stroke="var(--border-strong)"
            strokeWidth="1.5"
            opacity={0.5 + i * 0.08}
          >
            <animate
              attributeName="opacity"
              values={`${0.4 + i * 0.08};${0.7 + i * 0.04};${0.4 + i * 0.08}`}
              dur={`${2.5 + i * 0.4}s`}
              repeatCount="indefinite"
            />
          </rect>
          <text
            x={b.x + b.w / 2} y={b.y + b.h / 2 + 3}
            textAnchor="middle" fontSize="8"
            fill="var(--text-muted)" fontWeight="600" opacity="0.35"
          >$</text>
        </g>
      ))}
      {/* Weakening connector lines */}
      <line x1="60" y1="35" x2="80" y2="25" stroke="var(--border)" strokeWidth="1" strokeDasharray="3 3"
        style={{ animation: "primer-dash-flow 1.5s linear infinite" }}>
        <animate attributeName="opacity" values="0.3;0.1;0.3" dur="3s" repeatCount="indefinite" />
      </line>
      <line x1="110" y1="25" x2="130" y2="35" stroke="var(--border)" strokeWidth="1" strokeDasharray="3 3"
        style={{ animation: "primer-dash-flow 1.8s linear infinite" }}>
        <animate attributeName="opacity" values="0.3;0.08;0.3" dur="3.5s" repeatCount="indefinite" />
      </line>
      <line x1="72" y1="77" x2="100" y2="78" stroke="var(--border)" strokeWidth="1" strokeDasharray="3 3"
        style={{ animation: "primer-dash-flow 2s linear infinite" }}>
        <animate attributeName="opacity" values="0.25;0.1;0.25" dur="4s" repeatCount="indefinite" />
      </line>
      {/* Scattering capital dots */}
      {dots.map((d, i) => (
        <circle
          key={`dot-${i}`}
          cx={d.cx} cy={d.cy} r="2"
          fill="var(--accent)"
          style={{
            "--burst-x": d.bx,
            "--burst-y": d.by,
            animation: `primer-burst-dot 3s ease-out ${d.delay} infinite`,
          } as React.CSSProperties}
        />
      ))}
      <text x="100" y="112" textAnchor="middle" fontSize="8" fill="var(--text-muted)" fontFamily="var(--font-mono-app)">
        ISOLATED LIQUIDITY
      </text>
    </svg>
  );
}
