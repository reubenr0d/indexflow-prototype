"use client";

import { useRef } from "react";
import { motion, useInView } from "framer-motion";
import { Section, SectionLabel, SectionHeading, SectionBody } from "./Section";

const iconData = {
  reserves: {
    paths: [
      "M21 5c0 1.66-4 3-9 3S3 6.66 3 5s4-3 9-3 9 1.34 9 3Z",
      "M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5",
      "M3 12c0 1.66 4 3 9 3s9-1.34 9-3",
    ],
    animation: "primer-icon-float 3s ease-in-out infinite",
  },
  confidence: {
    paths: [
      "M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z",
      "m9 12 2 2 4-4",
    ],
    animation: "primer-icon-pulse 2.5s ease-in-out infinite",
  },
  deposits: {
    paths: [
      "M12 17V3",
      "m6 11 6 6 6-6",
      "M19 21H5",
    ],
    animation: "primer-icon-bounce 2s ease-in-out infinite",
  },
  trading: {
    paths: [
      "M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2",
    ],
    animation: "primer-icon-pulse 3s ease-in-out infinite",
  },
} as const;

type IconKey = keyof typeof iconData;

const nodes: { label: string; angle: number; icon: IconKey }[] = [
  { label: "Deeper\nReserves", angle: -90, icon: "reserves" },
  { label: "More\nConfidence", angle: 0, icon: "confidence" },
  { label: "More\nDeposits", angle: 90, icon: "deposits" },
  { label: "More\nTrading & Fees", angle: 180, icon: "trading" },
];

const ICON_SIZE = 22;
const NODE_R = 52;
const GLOW_R = 62;

export function PrimerFlywheel() {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-80px" });

  const R = 155;
  const cx = 250;
  const cy = 200;

  return (
    <Section id="flywheel" className="primer-section-glow primer-section-glow-tl py-24 sm:py-32">
      <SectionLabel>The Flywheel</SectionLabel>
      <SectionHeading>
        Liquidity compounds ecosystem growth
      </SectionHeading>
      <SectionBody>
        Every additional unit of reserve depth compounds into higher ecosystem
        activity. <br />
        The cycle reinforces itself.
      </SectionBody>

      <div ref={ref} className="relative z-10 mt-16 flex justify-center">
        <svg viewBox="-10 -10 520 420" className="w-full max-w-lg" aria-hidden>
          <defs>
            <linearGradient id="fly-ring-grad" gradientTransform="rotate(90)">
              <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.6" />
              <stop offset="50%" stopColor="#38bdf8" stopOpacity="0.3" />
              <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.1" />
            </linearGradient>
            <radialGradient id="fly-node-grad">
              <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.12" />
              <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.02" />
            </radialGradient>
            <filter id="fly-glow">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <marker
              id="fly-arrowhead"
              viewBox="0 0 10 8"
              refX="9"
              refY="4"
              markerWidth="8"
              markerHeight="6"
              orient="auto"
            >
              <path d="M0 0.5 L9 4 L0 7.5 Z" fill="var(--accent)" opacity="0.7" />
            </marker>
          </defs>

          {/* Pulsing outer ring */}
          <circle cx={cx} cy={cy} r={R + 8} fill="none" stroke="var(--accent)" strokeWidth="1" opacity="0.1">
            <animate attributeName="r" values={`${R + 6};${R + 12};${R + 6}`} dur="3s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.12;0.04;0.12" dur="3s" repeatCount="indefinite" />
          </circle>

          {/* Gradient ring */}
          <motion.circle
            cx={cx}
            cy={cy}
            r={R}
            fill="none"
            stroke="url(#fly-ring-grad)"
            strokeWidth="2.5"
            initial={{ pathLength: 0 }}
            animate={isInView ? { pathLength: 1 } : {}}
            transition={{ duration: 1.2, ease: "easeOut" }}
          />

          {/* Directional arrows between nodes */}
          <g>
            {nodes.map((_, i) => {
              const a1Deg = nodes[i].angle + 30;
              const a2Deg = nodes[(i + 1) % 4].angle - 30;
              const a2Norm = a2Deg < a1Deg ? a2Deg + 360 : a2Deg;
              const midDeg = (a1Deg + a2Norm) / 2;

              const a1 = (a1Deg * Math.PI) / 180;
              const a2 = (a2Deg * Math.PI) / 180;
              const aMid = (midDeg * Math.PI) / 180;

              const sx = cx + R * Math.cos(a1);
              const sy = cy + R * Math.sin(a1);
              const ex = cx + R * Math.cos(a2);
              const ey = cy + R * Math.sin(a2);
              const mx = cx + (R + 28) * Math.cos(aMid);
              const my = cy + (R + 28) * Math.sin(aMid);

              const pathD = `M${sx},${sy} Q${mx},${my} ${ex},${ey}`;

              return (
                <g key={i}>
                  <path
                    d={pathD}
                    fill="none"
                    stroke="var(--accent)"
                    strokeWidth="1.5"
                    strokeDasharray="6 4"
                    opacity="0.4"
                    markerEnd="url(#fly-arrowhead)"
                    style={{ animation: "primer-dash-flow 1.5s linear infinite" }}
                  />
                  {/* Traveling dot */}
                  <circle r="3" fill="var(--accent)" opacity="0" filter="url(#fly-glow)">
                    <animateMotion
                      path={pathD}
                      dur="2.5s"
                      repeatCount="indefinite"
                      begin={`${i * 0.625}s`}
                    />
                    <animate
                      attributeName="opacity"
                      values="0;0.9;0.9;0"
                      keyTimes="0;0.1;0.85;1"
                      dur="2.5s"
                      repeatCount="indefinite"
                      begin={`${i * 0.625}s`}
                    />
                  </circle>
                </g>
              );
            })}
          </g>

          {/* Nodes */}
          {nodes.map((node, i) => {
            const a = (node.angle * Math.PI) / 180;
            const nx = cx + R * Math.cos(a);
            const ny = cy + R * Math.sin(a);
            const lines = node.label.split("\n");
            const icon = iconData[node.icon];

            return (
              <motion.g
                key={node.label}
                initial={{ opacity: 0, scale: 0.7 }}
                animate={isInView ? { opacity: 1, scale: 1 } : {}}
                transition={{
                  delay: 0.2 + i * 0.12,
                  duration: 0.45,
                  ease: [0.22, 1, 0.36, 1],
                }}
              >
                {/* Glow behind node */}
                <circle cx={nx} cy={ny} r={GLOW_R} fill="url(#fly-node-grad)" />
                <circle cx={nx} cy={ny} r={NODE_R} fill="var(--surface)" stroke="var(--accent)" strokeWidth="2" />
                <circle cx={nx} cy={ny} r={NODE_R} fill="var(--accent)" opacity="0.06" />

                {/* Animated icon */}
                <svg
                  x={nx - ICON_SIZE / 2}
                  y={ny - ICON_SIZE - 2}
                  width={ICON_SIZE}
                  height={ICON_SIZE}
                  viewBox="0 0 24 24"
                >
                  <g
                    fill="none"
                    stroke="var(--accent)"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    opacity="0.8"
                    style={{ transformOrigin: "center", animation: icon.animation }}
                  >
                    {icon.paths.map((d, pi) => (
                      <path key={pi} d={d} />
                    ))}
                  </g>
                </svg>

                {/* Text label */}
                {lines.map((line, li) => (
                  <text
                    key={li}
                    x={nx}
                    y={ny + 6 + li * 15}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize="12"
                    fontWeight="600"
                    fill="var(--text)"
                  >
                    {line}
                  </text>
                ))}
              </motion.g>
            );
          })}
        </svg>
      </div>
    </Section>
  );
}
