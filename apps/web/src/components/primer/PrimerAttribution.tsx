"use client";

import { useRef } from "react";
import { motion, useInView } from "framer-motion";
import { Section, SectionLabel, SectionHeading, SectionBody } from "./Section";

const RADAR_AXES = [
  { key: "tvl", label: "TVL" },
  { key: "vol", label: "Vol" },
  { key: "fees", label: "Fees" },
  { key: "users", label: "Users" },
  { key: "txns", label: "Txns" },
] as const;

type AxisKey = (typeof RADAR_AXES)[number]["key"];

interface ChainData extends Record<AxisKey, number> {
  name: string;
  color: string;
}

const chains: ChainData[] = [
  { name: "Chain A", tvl: 85, vol: 72, fees: 60, users: 78, txns: 65, color: "#2dd4bf" },
  { name: "Chain B", tvl: 60, vol: 55, fees: 45, users: 50, txns: 40, color: "#38bdf8" },
  { name: "Chain C", tvl: 40, vol: 35, fees: 28, users: 30, txns: 22, color: "#818cf8" },
];

const CX = 100;
const CY = 100;
const R = 65;
const GRID_LEVELS = [0.33, 0.66, 1];
const ANGLES = RADAR_AXES.map((_, i) => (360 / RADAR_AXES.length) * i);

function polar(angleDeg: number, radius: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: CX + radius * Math.cos(rad), y: CY + radius * Math.sin(rad) };
}

function RadarChart({
  chain,
  animate,
  delay,
}: {
  chain: ChainData;
  animate: boolean;
  delay: number;
}) {
  const values = RADAR_AXES.map((a) => chain[a.key]);
  const points = values
    .map((v, i) => {
      const { x, y } = polar(ANGLES[i], (v / 100) * R);
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg viewBox="0 0 200 200" className="mx-auto h-40 w-40 sm:h-44 sm:w-44">
      <defs>
        <radialGradient id={`radar-glow-${chain.name.replace(/\s/g, "")}`}>
          <stop offset="0%" stopColor={chain.color} stopOpacity="0.08" />
          <stop offset="100%" stopColor={chain.color} stopOpacity="0" />
        </radialGradient>
      </defs>

      <circle
        cx={CX}
        cy={CY}
        r={R + 4}
        fill={`url(#radar-glow-${chain.name.replace(/\s/g, "")})`}
      />

      {GRID_LEVELS.map((level) => (
        <polygon
          key={level}
          points={ANGLES.map((a) => {
            const { x, y } = polar(a, R * level);
            return `${x},${y}`;
          }).join(" ")}
          fill="none"
          stroke="var(--border)"
          strokeWidth="0.75"
          opacity={0.35}
        />
      ))}

      {ANGLES.map((a, i) => {
        const { x, y } = polar(a, R);
        return (
          <line
            key={i}
            x1={CX}
            y1={CY}
            x2={x}
            y2={y}
            stroke="var(--border)"
            strokeWidth="0.5"
            opacity={0.3}
          />
        );
      })}

      <motion.g
        initial={{ opacity: 0, scale: 0 }}
        animate={animate ? { opacity: 1, scale: 1 } : {}}
        transition={{
          delay: delay + 0.3,
          duration: 0.7,
          ease: [0.22, 1, 0.36, 1],
        }}
        style={{ transformOrigin: `${CX}px ${CY}px` }}
      >
        <polygon
          points={points}
          fill={chain.color}
          fillOpacity={0.18}
          stroke={chain.color}
          strokeWidth={2}
          strokeLinejoin="round"
        />
        {values.map((v, i) => {
          const { x, y } = polar(ANGLES[i], (v / 100) * R);
          return (
            <circle
              key={i}
              cx={x}
              cy={y}
              r={3.5}
              fill={chain.color}
              stroke="var(--surface)"
              strokeWidth={1.5}
            />
          );
        })}
      </motion.g>

      {RADAR_AXES.map((axis, i) => {
        const { x, y } = polar(ANGLES[i], R + 18);
        return (
          <text
            key={axis.key}
            x={x}
            y={y}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize="9"
            fill="var(--text-muted)"
            fontFamily="var(--font-mono-app)"
            fontWeight="500"
          >
            {axis.label}
          </text>
        );
      })}
    </svg>
  );
}

export function PrimerAttribution() {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-80px" });

  return (
    <Section
      id="attribution"
      className="primer-section-glow primer-section-glow-tl py-24 sm:py-32"
    >
      <SectionLabel>Chain-Attributable Growth</SectionLabel>
      <SectionHeading>
        Ring-fenced deployments with independent KPIs
      </SectionHeading>
      <SectionBody>
        Each chain receives its own deployment instance, liquidity boundary,
        and attribution model. No cross-chain dilution.
      </SectionBody>

      <div ref={ref} className="mt-14 grid gap-6 md:grid-cols-3">
        {chains.map((chain, ci) => (
          <motion.div
            key={chain.name}
            initial={{ opacity: 0, y: 20 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{
              delay: ci * 0.12,
              duration: 0.5,
              ease: [0.22, 1, 0.36, 1],
            }}
            className="primer-glow-card rounded-xl border border-app-border bg-app-surface p-6 transition-transform duration-300 hover:-translate-y-1"
          >
            <div className="flex items-center gap-2">
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{
                  background: chain.color,
                  boxShadow: `0 0 8px ${chain.color}40`,
                }}
              />
              <p className="font-mono text-xs font-semibold uppercase tracking-wider text-app-accent">
                {chain.name}
              </p>
            </div>

            <div className="mt-3">
              <RadarChart chain={chain} animate={isInView} delay={ci * 0.12} />
            </div>

            <div className="mt-1 flex flex-wrap justify-center gap-x-3 gap-y-1">
              {RADAR_AXES.map((axis) => (
                <span key={axis.key} className="text-[10px] text-app-muted">
                  <span
                    className="font-mono font-semibold"
                    style={{ color: chain.color }}
                  >
                    {chain[axis.key]}%
                  </span>{" "}
                  {axis.label}
                </span>
              ))}
            </div>
          </motion.div>
        ))}
      </div>
    </Section>
  );
}
