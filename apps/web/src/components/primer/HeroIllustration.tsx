"use client";

import { useEffect, useRef, type RefObject } from "react";
import { motion } from "framer-motion";
import type { MouseOffset } from "./PrimerHero";

const CX = 780;
const CY = 340;
const WARM = "#f59e0b";

const RINGS = [
  { r: 90, opacity: 0.22, width: 1.5, color: "var(--accent)", dash: "", dur: 50, ccw: false },
  { r: 160, opacity: 0.16, width: 1, color: "var(--accent)", dash: "8 6", dur: 65, ccw: true },
  { r: 230, opacity: 0.10, width: 0.8, color: "#38bdf8", dash: "14 8", dur: 80, ccw: false },
  { r: 300, opacity: 0.07, width: 0.6, color: "var(--accent)", dash: "18 10", dur: 95, ccw: true },
];

const DASHED_ARCS = [
  { r: 125, start: -40, sweep: 110, color: "var(--accent)", opacity: 0.18 },
  { r: 195, start: 100, sweep: 130, color: "#38bdf8", opacity: 0.16 },
  { r: 260, start: 210, sweep: 120, color: "var(--accent)", opacity: 0.14 },
  { r: 70, start: 160, sweep: 90, color: WARM, opacity: 0.10 },
  { r: 330, start: -10, sweep: 100, color: "#38bdf8", opacity: 0.10 },
  { r: 270, start: 50, sweep: 90, color: WARM, opacity: 0.08 },
];

interface OrbitIcon {
  id: string;
  ring: number;
  angleDeg: number;
  size: number;
  opacity: number;
  color: string;
  glowColor: string;
  paths: string[];
}

const ORBIT_ICONS: OrbitIcon[] = [
  {
    id: "gold", ring: 0, angleDeg: 30, size: 20, opacity: 0.35, color: WARM, glowColor: WARM,
    paths: ["M3 20h18", "M5 20V10l7-6 7 6v10", "M4 13h16", "M4 16h16"],
  },
  {
    id: "crypto", ring: 0, angleDeg: 150, size: 20, opacity: 0.34, color: "var(--accent)", glowColor: "var(--accent)",
    paths: ["M9.5 2v2", "M14.5 2v2", "M9.5 20v2", "M14.5 20v2", "M7 6h8.5a3.5 3.5 0 0 1 0 7H7v0", "M7 13h9.5a3.5 3.5 0 0 1 0 7H7v0"],
  },
  {
    id: "cash", ring: 0, angleDeg: 270, size: 20, opacity: 0.30, color: "#38bdf8", glowColor: "#38bdf8",
    paths: ["M2 6h20v12H2z", "M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z", "M2 10h2", "M20 10h2", "M2 14h2", "M20 14h2"],
  },
  {
    id: "stocks", ring: 1, angleDeg: 0, size: 20, opacity: 0.30, color: "#38bdf8", glowColor: "#38bdf8",
    paths: ["M3 20l5-5 4 4 8-12", "M17 7h4v4"],
  },
  {
    id: "cars", ring: 1, angleDeg: 90, size: 20, opacity: 0.28, color: "var(--accent)", glowColor: "var(--accent)",
    paths: ["M5 17h14", "M3 17l2-7h14l2 7", "M7 10l1-3h8l1 3", "M6.5 17a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Z", "M17.5 17a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Z"],
  },
  {
    id: "tbills", ring: 1, angleDeg: 180, size: 20, opacity: 0.29, color: "var(--accent)", glowColor: "var(--accent)",
    paths: ["M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z", "M14 2v6h6", "M9 15l2 2 4-4"],
  },
  {
    id: "realestate", ring: 1, angleDeg: 270, size: 20, opacity: 0.30, color: "#38bdf8", glowColor: "#38bdf8",
    paths: ["M3 21h18", "M5 21V7l7-4 7 4v14", "M9 21v-6h6v6"],
  },
  // Ring 3 (r=230) — 5 icons
  {
    id: "commodities", ring: 2, angleDeg: 0, size: 18, opacity: 0.27, color: "#38bdf8", glowColor: "#38bdf8",
    paths: ["M12 2C6.48 2 2 6 2 12c0 3 1.5 6 4 8l1-2c-2-1.5-3-4-3-6 0-4.42 3.58-8 8-8s8 3.58 8 8c0 2-1 4.5-3 6l1 2c2.5-2 4-5 4-8 0-6-4.48-10-10-10Z", "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z"],
  },
  {
    id: "art", ring: 2, angleDeg: 72, size: 18, opacity: 0.27, color: "var(--accent)", glowColor: "var(--accent)",
    paths: ["M2 4h20v16H2z", "M2 16l5-5 3 3 4-4 8 8", "M15 9a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z"],
  },
  {
    id: "wine", ring: 2, angleDeg: 144, size: 18, opacity: 0.27, color: "#38bdf8", glowColor: "#38bdf8",
    paths: ["M8 2h8", "M12 2v4", "M7 6c0 4 2 6 5 8v4", "M17 6c0 4-2 6-5 8v4", "M8 22h8", "M12 18v4"],
  },
  {
    id: "watches", ring: 2, angleDeg: 216, size: 18, opacity: 0.26, color: "var(--accent)", glowColor: "var(--accent)",
    paths: ["M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Z", "M12 6v6l4 2", "M9 1h6", "M9 23h6"],
  },
  {
    id: "weed", ring: 2, angleDeg: 288, size: 18, opacity: 0.28, color: "#22c55e", glowColor: "#22c55e",
    paths: [
      "M12 22V8",
      "M12 8c-2-4-7-5-9-3 3 0 6 2 7 5",
      "M12 8c2-4 7-5 9-3-3 0-6 2-7 5",
      "M12 14c-3-3-8-2-9 0 3-1 6 0 8 2",
      "M12 14c3-3 8-2 9 0-3-1-6 0-8 2",
      "M12 18c-2-2-5-2-6 0 2 0 4 1 5 3",
      "M12 18c2-2 5-2 6 0-2 0-4 1-5 3",
    ],
  },
  // Ring 4 (r=300) — 4 icons
  {
    id: "etfs", ring: 3, angleDeg: 20, size: 16, opacity: 0.24, color: "#38bdf8", glowColor: "#38bdf8",
    paths: ["M3 3v18h18", "M7 17l4-8 4 4 4-6"],
  },
  {
    id: "sneakers", ring: 3, angleDeg: 110, size: 16, opacity: 0.23, color: "var(--accent)", glowColor: "var(--accent)",
    paths: ["M2 18h14l4-4c1-1 2-3 2-4v-1H12l-2 2H8l-2-2H2v9Z", "M6 12l-1-3c0-1 1-2 2-2h6c1 0 2 1 2 2v3"],
  },
  {
    id: "diamonds", ring: 3, angleDeg: 200, size: 16, opacity: 0.25, color: WARM, glowColor: WARM,
    paths: ["M6 3h12l4 5-10 13L2 8Z", "M2 8h20", "M12 3v18", "M6 3l6 5 6-5"],
  },
  {
    id: "carbon", ring: 3, angleDeg: 290, size: 16, opacity: 0.23, color: "#22c55e", glowColor: "#22c55e",
    paths: ["M2 22c4-4 8-3 10-1 2-4 6-5 10-1", "M2 22c0-10 5-14 10-14s10 4 10 14", "M12 8v4", "M10 10h4"],
  },
];

const SPARKLES = [
  { angleDeg: 75, ring: 0, dur: 6, begin: 1, color: "var(--accent)" },
  { angleDeg: 200, ring: 1, dur: 8, begin: 3.5, color: "#38bdf8" },
  { angleDeg: 320, ring: 2, dur: 10, begin: 0.5, color: "var(--accent)" },
  { angleDeg: 120, ring: 2, dur: 7, begin: 5, color: WARM },
  { angleDeg: 60, ring: 3, dur: 9, begin: 2, color: "#22c55e" },
  { angleDeg: 250, ring: 3, dur: 8, begin: 6, color: "#38bdf8" },
];

const PARALLAX = [{ max: 5 }, { max: 12 }, { max: 20 }];

const r4 = (v: number) => Math.round(v * 1e4) / 1e4;

function arc(radius: number, startDeg: number, sweepDeg: number): string {
  const s = (startDeg * Math.PI) / 180;
  const e = ((startDeg + sweepDeg) * Math.PI) / 180;
  return `M${r4(CX + radius * Math.cos(s))},${r4(CY + radius * Math.sin(s))} A${radius},${radius} 0 ${sweepDeg > 180 ? 1 : 0} 1 ${r4(CX + radius * Math.cos(e))},${r4(CY + radius * Math.sin(e))}`;
}

function hexPoints(cx: number, cy: number, r: number): string {
  return Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 3) * i - Math.PI / 2;
    return `${r4(cx + r * Math.cos(a))},${r4(cy + r * Math.sin(a))}`;
  }).join(" ");
}

function triPoints(cx: number, cy: number, r: number): string {
  return Array.from({ length: 3 }, (_, i) => {
    const a = (2 * Math.PI / 3) * i - Math.PI / 2;
    return `${r4(cx + r * Math.cos(a))},${r4(cy + r * Math.sin(a))}`;
  }).join(" ");
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function spinStyle(originX: number, originY: number, dur: number, reverse?: boolean): React.CSSProperties {
  return {
    transformOrigin: `${originX}px ${originY}px`,
    animationName: "primer-slow-spin",
    animationDuration: `${dur}s`,
    animationTimingFunction: "linear",
    animationIterationCount: "infinite",
    ...(reverse ? { animationDirection: "reverse" as const } : {}),
  };
}

function constellationLines(ringIdx: number): string[] {
  const icons = ORBIT_ICONS.filter((ic) => ic.ring === ringIdx);
  const r = RINGS[ringIdx].r;
  const lines: string[] = [];
  for (let i = 0; i < icons.length; i++) {
    const a1 = (icons[i].angleDeg * Math.PI) / 180;
    const a2 = (icons[(i + 1) % icons.length].angleDeg * Math.PI) / 180;
    lines.push(
      `M${r4(CX + r * Math.cos(a1))},${r4(CY + r * Math.sin(a1))} L${r4(CX + r * Math.cos(a2))},${r4(CY + r * Math.sin(a2))}`
    );
  }
  return lines;
}

interface Props {
  mouseRef: RefObject<MouseOffset | null>;
}

export default function HeroIllustration({ mouseRef }: Props) {
  const layer0 = useRef<SVGGElement>(null);
  const layer1 = useRef<SVGGElement>(null);
  const layer2 = useRef<SVGGElement>(null);
  const current = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced) return;

    let raf: number;
    const tick = () => {
      const target = mouseRef.current ?? { x: 0, y: 0 };
      current.current.x = lerp(current.current.x, target.x, 0.06);
      current.current.y = lerp(current.current.y, target.y, 0.06);
      const { x, y } = current.current;

      for (const [ref, cfg] of [
        [layer0, PARALLAX[0]],
        [layer1, PARALLAX[1]],
        [layer2, PARALLAX[2]],
      ] as const) {
        const el = (ref as RefObject<SVGGElement | null>).current;
        if (el) el.style.transform = `translate3d(${x * cfg.max}px, ${y * cfg.max}px, 0)`;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [mouseRef]);

  return (
    <div className="primer-stage-anim primer-hero-illustration-mask pointer-events-none absolute inset-0" aria-hidden>
      <svg
        viewBox="0 0 1200 700"
        preserveAspectRatio="xMidYMid slice"
        className="absolute inset-0 h-full w-full"
      >
        <defs>
          {/* Gradient strokes for rings */}
          {RINGS.map((ring, i) => (
            <linearGradient
              key={`rg-${i}`}
              id={`hi-ring-grad-${i}`}
              gradientUnits="userSpaceOnUse"
              x1={CX - ring.r}
              y1={CY}
              x2={CX + ring.r}
              y2={CY}
            >
              <stop offset="0%" stopColor={ring.color} stopOpacity="0.05" />
              <stop offset="30%" stopColor={ring.color} stopOpacity="1" />
              <stop offset="70%" stopColor={ring.color} stopOpacity="1" />
              <stop offset="100%" stopColor={ring.color} stopOpacity="0.08" />
            </linearGradient>
          ))}

          {/* Glass chip background */}
          <radialGradient id="hi-glass">
            <stop offset="0%" stopColor="var(--surface)" stopOpacity="0.5" />
            <stop offset="100%" stopColor="var(--surface)" stopOpacity="0.05" />
          </radialGradient>

          {/* Center glow */}
          <radialGradient id="hi-center-glow">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.14" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
          </radialGradient>

          <filter id="hi-glow">
            <feGaussianBlur stdDeviation="3" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="hi-soft">
            <feGaussianBlur stdDeviation="14" />
          </filter>
          <filter id="hi-icon-glow">
            <feGaussianBlur stdDeviation="6" />
          </filter>
        </defs>

        {/* ====== Layer 0: rings + arcs (slow parallax) ====== */}
        <motion.g
          ref={layer0}
          style={{ willChange: "transform" }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
        >
          {/* Ambient center glow */}
          <circle cx={CX} cy={CY} r="160" fill="var(--accent)" opacity="0.025" filter="url(#hi-soft)" />

          {/* Gradient-stroked rings with variable dash patterns */}
          {RINGS.map((ring, i) => (
            <circle
              key={`ring-${i}`}
              cx={CX}
              cy={CY}
              r={ring.r}
              fill="none"
              stroke={`url(#hi-ring-grad-${i})`}
              strokeWidth={ring.width}
              strokeDasharray={ring.dash || undefined}
              opacity={ring.opacity}
              style={i > 0 ? spinStyle(CX, CY, ring.dur, ring.ccw) : undefined}
            />
          ))}

          {/* Dashed orbital arcs */}
          {DASHED_ARCS.map((a, i) => (
            <path
              key={`arc-${i}`}
              d={arc(a.r, a.start, a.sweep)}
              fill="none"
              stroke={a.color}
              strokeWidth="1"
              strokeDasharray="5 4"
              opacity={a.opacity}
              style={{ animationName: "primer-dash-flow", animationDuration: "2.5s", animationTimingFunction: "linear", animationIterationCount: "infinite" }}
            />
          ))}
        </motion.g>

        {/* ====== Layer 1: center motif + orbiting icons (mid parallax) ====== */}
        <motion.g
          ref={layer1}
          style={{ willChange: "transform" }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, ease: "easeOut", delay: 0.2 }}
        >
          {/* Central hexagon — slowly rotating */}
          <g style={spinStyle(CX, CY, 30)}>
            <circle cx={CX} cy={CY} r="78" fill="url(#hi-center-glow)">
              <animate attributeName="opacity" values="0.8;1;0.8" dur="4s" repeatCount="indefinite" />
            </circle>
            <polygon points={hexPoints(CX, CY, 55)} fill="none" stroke="var(--accent)" strokeWidth="1.5" opacity="0.28" />
          </g>

          {/* Inner hexagon — counter-rotating */}
          <g style={spinStyle(CX, CY, 22, true)}>
            <polygon points={hexPoints(CX, CY, 30)} fill="none" stroke="#38bdf8" strokeWidth="1" opacity="0.18" />
          </g>

          {/* Center triangle — third rotating layer */}
          <g style={spinStyle(CX, CY, 18)}>
            <polygon points={triPoints(CX, CY, 18)} fill="none" stroke={WARM} strokeWidth="0.8" opacity="0.15" />
          </g>

          {/* Constellation lines connecting adjacent icons per ring */}
          {RINGS.map((ring, ri) => {
            const lines = constellationLines(ri);
            return (
              <g
                key={`const-${ri}`}
                style={ri > 0 ? spinStyle(CX, CY, ring.dur, ring.ccw) : undefined}
              >
                {lines.map((d, li) => (
                  <path key={li} d={d} fill="none" stroke={ring.color} strokeWidth="0.5" opacity="0.07" />
                ))}
              </g>
            );
          })}

          {/* Orbiting icons with glass chip enclosures */}
          {ORBIT_ICONS.map((icon, idx) => {
            const ring = RINGS[icon.ring];
            const chipR = icon.size * 0.75;
            const haloR = icon.size * 1.1;

            return (
              <g
                key={icon.id}
                style={spinStyle(CX, CY, ring.dur, ring.ccw)}
              >
                <g transform={`rotate(${icon.angleDeg} ${CX} ${CY})`}>
                  <g
                    style={spinStyle(CX + ring.r, CY, ring.dur, !ring.ccw)}
                  >
                    {/* Icon glow halo */}
                    <circle
                      cx={CX + ring.r}
                      cy={CY}
                      r={haloR}
                      fill={icon.glowColor}
                      opacity="0.06"
                      filter="url(#hi-icon-glow)"
                    />

                    {/* Glass chip background */}
                    <circle
                      cx={CX + ring.r}
                      cy={CY}
                      r={chipR}
                      fill="url(#hi-glass)"
                    />
                    <circle
                      cx={CX + ring.r}
                      cy={CY}
                      r={chipR}
                      fill="none"
                      stroke={icon.color}
                      strokeWidth="0.5"
                      opacity="0.15"
                    />

                    {/* Icon paths */}
                    <g
                      transform={`translate(${CX + ring.r - icon.size / 2}, ${CY - icon.size / 2}) scale(${icon.size / 24})`}
                      fill="none"
                      stroke={icon.color}
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      opacity="0"
                    >
                      {icon.paths.map((d, pi) => (
                        <path key={pi} d={d} />
                      ))}
                      {/* Staggered entrance per icon */}
                      <animate
                        attributeName="opacity"
                        from="0"
                        to={String(icon.opacity)}
                        dur="0.5s"
                        begin={`${0.3 + idx * 0.08}s`}
                        fill="freeze"
                      />
                    </g>
                  </g>
                </g>
              </g>
            );
          })}

          {/* Small accent dots between icons */}
          {[
            { angleDeg: 210, ring: 0, r: 2.5, color: "#38bdf8" },
            { angleDeg: 45, ring: 1, r: 2.5, color: "#38bdf8" },
            { angleDeg: 135, ring: 1, r: 2, color: "var(--accent)" },
            { angleDeg: 315, ring: 1, r: 2, color: WARM },
            { angleDeg: 100, ring: 2, r: 2, color: "var(--accent)" },
            { angleDeg: 220, ring: 2, r: 2, color: "#38bdf8" },
            { angleDeg: 65, ring: 3, r: 2, color: "#22c55e" },
            { angleDeg: 155, ring: 3, r: 1.8, color: "var(--accent)" },
            { angleDeg: 245, ring: 3, r: 2, color: "#38bdf8" },
          ].map((dot, i) => {
            const ringCfg = RINGS[dot.ring];
            return (
              <g
                key={`dot-${i}`}
                style={spinStyle(CX, CY, ringCfg.dur, ringCfg.ccw)}
              >
                <g transform={`rotate(${dot.angleDeg} ${CX} ${CY})`}>
                  <circle cx={CX + ringCfg.r} cy={CY} r={dot.r} fill={dot.color} opacity="0.45" filter="url(#hi-glow)" />
                </g>
              </g>
            );
          })}

          {/* Micro-sparkles along rings */}
          {SPARKLES.map((sp, i) => {
            const r = RINGS[sp.ring].r;
            const a = (sp.angleDeg * Math.PI) / 180;
            return (
              <circle
                key={`sparkle-${i}`}
                cx={r4(CX + r * Math.cos(a))}
                cy={r4(CY + r * Math.sin(a))}
                r="2"
                fill={sp.color}
                opacity="0"
                filter="url(#hi-glow)"
              >
                <animate
                  attributeName="opacity"
                  values="0;0;0.7;0.7;0"
                  keyTimes="0;0.4;0.5;0.6;1"
                  dur={`${sp.dur}s`}
                  begin={`${sp.begin}s`}
                  repeatCount="indefinite"
                />
              </circle>
            );
          })}
        </motion.g>

        {/* ====== Layer 2: halos + central dot (fast parallax) ====== */}
        <motion.g
          ref={layer2}
          style={{ willChange: "transform" }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, ease: "easeOut", delay: 0.4 }}
        >
          {/* Pulsing halos */}
          <circle cx={CX} cy={CY} r="50" fill="none" stroke="var(--accent)" strokeWidth="1" opacity="0">
            <animate attributeName="r" values="50;90;105" dur="4.5s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.25;0.06;0" dur="4.5s" repeatCount="indefinite" />
          </circle>
          <circle cx={CX} cy={CY} r="45" fill="none" stroke="#38bdf8" strokeWidth="0.8" opacity="0">
            <animate attributeName="r" values="45;80;95" dur="4.5s" repeatCount="indefinite" begin="2.25s" />
            <animate attributeName="opacity" values="0.18;0.05;0" dur="4.5s" repeatCount="indefinite" begin="2.25s" />
          </circle>

          {/* Central breathing dot */}
          <circle cx={CX} cy={CY} r="3.5" fill="var(--accent)" opacity="0.45" filter="url(#hi-glow)">
            <animate attributeName="opacity" values="0.3;0.65;0.3" dur="3s" repeatCount="indefinite" />
          </circle>
        </motion.g>
      </svg>
    </div>
  );
}
