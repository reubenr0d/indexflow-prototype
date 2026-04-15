"use client";

import { useRef } from "react";
import { motion, useInView } from "framer-motion";
import { ShieldCheck } from "lucide-react";
import { Section, SectionLabel, SectionHeading } from "./Section";

const steps = [
  { num: "01", label: "Deposit", short: "USDC",
    desc: "USDC enters the basket vault as reserve capital.",
    descLines: ["USDC enters the basket", "vault as reserve capital."] },
  { num: "02", label: "Mint", short: "Shares",
    desc: "Shares are issued at the current NAV-based price.",
    descLines: ["Shares are issued at the", "current NAV-based price."] },
  { num: "03", label: "Manage", short: "Perps",
    desc: "The vault routes capital into perpetual positions.",
    descLines: ["The vault routes capital into", "perpetual positions."],
    role: "Asset Manager" as const },
  { num: "04", label: "Track", short: "PnL",
    desc: "Oracle-priced PnL is reflected in share value.",
    descLines: ["Oracle-priced PnL is", "reflected in share value."] },
  { num: "05", label: "Redeem", short: "USDC",
    desc: "Shares burn for USDC drawn from idle reserves.",
    descLines: ["Shares burn for USDC", "drawn from idle reserves."] },
];

function DesktopStageAnim({ index, cx }: { index: number; cx: number }) {
  const cy = 80;

  switch (index) {
    case 0: {
      const coins = [
        { r: 5, dx: -6, delay: "0s" },
        { r: 4.5, dx: 0, delay: "0.4s" },
        { r: 4, dx: 7, delay: "0.8s" },
      ];
      return (
        <>
          {coins.map((coin, j) => (
            <g key={j}>
              <circle r={coin.r} cx={cx + coin.dx} fill="var(--accent)">
                <animate attributeName="cy" values={`${cy - 34};${cy + 4};${cy + 4}`} dur="2.4s" begin={coin.delay} repeatCount="indefinite" />
                <animate attributeName="opacity" values="0;0.8;0" dur="2.4s" begin={coin.delay} repeatCount="indefinite" />
              </circle>
              <circle cx={cx + coin.dx} cy={cy + 6} r="2" fill="none" stroke="var(--accent)" strokeWidth="1.5">
                <animate attributeName="r" values="2;14;14" dur="2.4s" begin={coin.delay} repeatCount="indefinite" />
                <animate attributeName="opacity" values="0;0.6;0" dur="2.4s" begin={coin.delay} repeatCount="indefinite" />
              </circle>
            </g>
          ))}
        </>
      );
    }
    case 1: {
      return (
        <>
          <circle cx={cx} cy={cy} r="4" fill="var(--accent)">
            <animate attributeName="r" values="3;5;3" dur="2s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.7;0.9;0.7" dur="2s" repeatCount="indefinite" />
          </circle>
          {[0, 0.7, 1.4].map((delay, j) => (
            <circle key={j} cx={cx} cy={cy} fill="none" stroke="var(--accent)" strokeWidth="1.5">
              <animate attributeName="r" values="5;34;34" dur="2.2s" begin={`${delay}s`} repeatCount="indefinite" />
              <animate attributeName="opacity" values="0.6;0;0" dur="2.2s" begin={`${delay}s`} repeatCount="indefinite" />
            </circle>
          ))}
        </>
      );
    }
    case 2: {
      const angles = [0, 72, 144, 216, 288];
      const dist = 32;
      return (
        <>
          {angles.map((angle, j) => {
            const rad = (angle * Math.PI) / 180;
            const ex = Math.round((cx + dist * Math.cos(rad)) * 1e4) / 1e4;
            const ey = Math.round((cy + dist * Math.sin(rad)) * 1e4) / 1e4;
            const midX = Math.round((cx + (dist * 0.5) * Math.cos(rad)) * 1e4) / 1e4;
            const midY = Math.round((cy + (dist * 0.5) * Math.sin(rad)) * 1e4) / 1e4;
            return (
              <g key={j}>
                <line
                  x1={cx} y1={cy}
                  stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round"
                >
                  <animate attributeName="x2" values={`${cx};${midX};${ex};${ex}`} dur="2s" begin={`${j * 0.12}s`} repeatCount="indefinite" />
                  <animate attributeName="y2" values={`${cy};${midY};${ey};${ey}`} dur="2s" begin={`${j * 0.12}s`} repeatCount="indefinite" />
                  <animate attributeName="opacity" values="0.5;0.7;0.2;0" dur="2s" begin={`${j * 0.12}s`} repeatCount="indefinite" />
                </line>
                <circle r="3.5" fill="var(--accent)">
                  <animate attributeName="cx" values={`${cx};${ex};${ex}`} dur="2s" begin={`${j * 0.12}s`} repeatCount="indefinite" />
                  <animate attributeName="cy" values={`${cy};${ey};${ey}`} dur="2s" begin={`${j * 0.12}s`} repeatCount="indefinite" />
                  <animate attributeName="opacity" values="0.7;0.8;0" dur="2s" begin={`${j * 0.12}s`} repeatCount="indefinite" />
                </circle>
              </g>
            );
          })}
        </>
      );
    }
    case 3: {
      const pathD = `M${cx - 22},${cy + 10} l5,-8 l5,14 l6,-18 l5,9 l5,-6 l5,13`;
      return (
        <>
          <path
            d={pathD}
            fill="none"
            stroke="var(--accent)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray="70"
            className="primer-stage-anim"
            style={{ animationName: "primer-sparkline", animationDuration: "3s", animationTimingFunction: "ease-in-out", animationIterationCount: "infinite" }}
          />
          <circle r="3.5" fill="var(--accent)" className="primer-stage-anim"
            style={{ animationName: "primer-tracker-glow", animationDuration: "1.5s", animationTimingFunction: "ease-in-out", animationIterationCount: "infinite" }}
          >
            <animateMotion
              dur="3s"
              repeatCount="indefinite"
              path={`M${-22},${10} l5,-8 l5,14 l6,-18 l5,9 l5,-6 l5,13`}
            />
          </circle>
        </>
      );
    }
    case 4: {
      const coins = [
        { r: 5, dx: 0, spreadX: -8, delay: "0s" },
        { r: 4.5, dx: -4, spreadX: 0, delay: "0.35s" },
        { r: 4, dx: 5, spreadX: 10, delay: "0.7s" },
      ];
      return (
        <>
          {coins.map((coin, j) => (
            <g key={j}>
              <circle r={coin.r} fill="var(--accent)">
                <animate attributeName="cx" values={`${cx + coin.dx};${cx + coin.spreadX};${cx + coin.spreadX}`} dur="2.4s" begin={coin.delay} repeatCount="indefinite" />
                <animate attributeName="cy" values={`${cy + 4};${cy - 34};${cy - 34}`} dur="2.4s" begin={coin.delay} repeatCount="indefinite" />
                <animate attributeName="opacity" values="0;0.8;0" dur="2.4s" begin={coin.delay} repeatCount="indefinite" />
              </circle>
            </g>
          ))}
          <circle cx={cx} cy={cy + 6} r="2" fill="none" stroke="var(--accent)" strokeWidth="1.5">
            <animate attributeName="r" values="2;16;16" dur="2.4s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.5;0;0" dur="2.4s" repeatCount="indefinite" />
          </circle>
        </>
      );
    }
    default:
      return null;
  }
}

function MobileStageAnim({ index }: { index: number }) {
  const s = 40;
  const c = s / 2;

  let content: React.ReactNode;

  switch (index) {
    case 0: {
      const coins = [
        { r: 3, dx: -3, delay: "0s" },
        { r: 2.5, dx: 3, delay: "0.5s" },
      ];
      content = (
        <>
          {coins.map((coin, j) => (
            <g key={j}>
              <circle r={coin.r} cx={c + coin.dx} fill="var(--accent)">
                <animate attributeName="cy" values={`${c - 14};${c + 2};${c + 2}`} dur="2.4s" begin={coin.delay} repeatCount="indefinite" />
                <animate attributeName="opacity" values="0;0.8;0" dur="2.4s" begin={coin.delay} repeatCount="indefinite" />
              </circle>
              <circle cx={c + coin.dx} cy={c + 3} r="1.5" fill="none" stroke="var(--accent)" strokeWidth="1">
                <animate attributeName="r" values="1.5;7;7" dur="2.4s" begin={coin.delay} repeatCount="indefinite" />
                <animate attributeName="opacity" values="0;0.5;0" dur="2.4s" begin={coin.delay} repeatCount="indefinite" />
              </circle>
            </g>
          ))}
        </>
      );
      break;
    }
    case 1: {
      content = (
        <>
          <circle cx={c} cy={c} r="2.5" fill="var(--accent)">
            <animate attributeName="r" values="2;3.5;2" dur="2s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.7;0.9;0.7" dur="2s" repeatCount="indefinite" />
          </circle>
          {[0, 0.7, 1.4].map((delay, j) => (
            <circle key={j} cx={c} cy={c} fill="none" stroke="var(--accent)" strokeWidth="1.5">
              <animate attributeName="r" values="3;16;16" dur="2.2s" begin={`${delay}s`} repeatCount="indefinite" />
              <animate attributeName="opacity" values="0.6;0;0" dur="2.2s" begin={`${delay}s`} repeatCount="indefinite" />
            </circle>
          ))}
        </>
      );
      break;
    }
    case 2: {
      const angles = [0, 90, 180, 270];
      const dist = 13;
      content = (
        <>
          {angles.map((angle, j) => {
            const rad = (angle * Math.PI) / 180;
            const ex = Math.round((c + dist * Math.cos(rad)) * 1e4) / 1e4;
            const ey = Math.round((c + dist * Math.sin(rad)) * 1e4) / 1e4;
            return (
              <g key={j}>
                <line
                  x1={c} y1={c}
                  stroke="var(--accent)" strokeWidth="1" strokeLinecap="round"
                >
                  <animate attributeName="x2" values={`${c};${ex};${ex}`} dur="2s" begin={`${j * 0.12}s`} repeatCount="indefinite" />
                  <animate attributeName="y2" values={`${c};${ey};${ey}`} dur="2s" begin={`${j * 0.12}s`} repeatCount="indefinite" />
                  <animate attributeName="opacity" values="0.4;0.6;0" dur="2s" begin={`${j * 0.12}s`} repeatCount="indefinite" />
                </line>
                <circle r="2" fill="var(--accent)">
                  <animate attributeName="cx" values={`${c};${ex};${ex}`} dur="2s" begin={`${j * 0.12}s`} repeatCount="indefinite" />
                  <animate attributeName="cy" values={`${c};${ey};${ey}`} dur="2s" begin={`${j * 0.12}s`} repeatCount="indefinite" />
                  <animate attributeName="opacity" values="0.7;0.8;0" dur="2s" begin={`${j * 0.12}s`} repeatCount="indefinite" />
                </circle>
              </g>
            );
          })}
        </>
      );
      break;
    }
    case 3: {
      const pathD = `M${c - 10},${c + 4} l3,-5 l3,7 l3,-9 l3,4 l3,-3 l3,6`;
      content = (
        <>
          <path
            d={pathD}
            fill="none"
            stroke="var(--accent)"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray="35"
            className="primer-stage-anim"
            style={{ animationName: "primer-sparkline", animationDuration: "3s", animationTimingFunction: "ease-in-out", animationIterationCount: "infinite" }}
          />
          <circle r="2" fill="var(--accent)" className="primer-stage-anim"
            style={{ animationName: "primer-tracker-glow", animationDuration: "1.5s", animationTimingFunction: "ease-in-out", animationIterationCount: "infinite" }}
          >
            <animateMotion
              dur="3s"
              repeatCount="indefinite"
              path={`M${-10},${4} l3,-5 l3,7 l3,-9 l3,4 l3,-3 l3,6`}
            />
          </circle>
        </>
      );
      break;
    }
    case 4: {
      const coins = [
        { r: 3, dx: 0, spreadX: -4, delay: "0s" },
        { r: 2.5, dx: 3, spreadX: 5, delay: "0.4s" },
      ];
      content = (
        <>
          {coins.map((coin, j) => (
            <circle key={j} r={coin.r} fill="var(--accent)">
              <animate attributeName="cx" values={`${c + coin.dx};${c + coin.spreadX};${c + coin.spreadX}`} dur="2.4s" begin={coin.delay} repeatCount="indefinite" />
              <animate attributeName="cy" values={`${c + 2};${c - 14};${c - 14}`} dur="2.4s" begin={coin.delay} repeatCount="indefinite" />
              <animate attributeName="opacity" values="0;0.8;0" dur="2.4s" begin={coin.delay} repeatCount="indefinite" />
            </circle>
          ))}
          <circle cx={c} cy={c + 3} r="1.5" fill="none" stroke="var(--accent)" strokeWidth="1">
            <animate attributeName="r" values="1.5;8;8" dur="2.4s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.4;0;0" dur="2.4s" repeatCount="indefinite" />
          </circle>
        </>
      );
      break;
    }
    default:
      return null;
  }

  return (
    <svg
      width={s}
      height={s}
      viewBox={`0 0 ${s} ${s}`}
      className="pointer-events-none absolute inset-0"
      aria-hidden
    >
      {content}
    </svg>
  );
}

export default function PrimerWhat() {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-80px" });

  return (
    <Section id="what" className="primer-section-glow primer-section-glow-tl py-24 sm:py-32">
      <SectionLabel>Under the Hood</SectionLabel>
      <SectionHeading>How capital moves through the vault</SectionHeading>

      <div ref={ref} className="mt-16">
        {/* Desktop: horizontal flow */}
        <div className="hidden md:block">
          <svg viewBox="0 0 900 240" className="w-full" aria-hidden>
            <defs>
              <radialGradient id="step-glow">
                <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.15" />
                <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
              </radialGradient>
              <linearGradient id="step-circle-grad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="var(--accent)" />
                <stop offset="100%" stopColor="#38bdf8" />
              </linearGradient>
              {steps.map((_, i) => (
                <clipPath key={i} id={`step-clip-${i}`}>
                  <circle cx={90 + i * 180} cy={80} r={40} />
                </clipPath>
              ))}
            </defs>
            {steps.map((step, i) => {
              const cx = 90 + i * 180;
              return (
                <motion.g
                  key={step.num}
                  initial={{ opacity: 0, y: 20 }}
                  animate={isInView ? { opacity: 1, y: 0 } : {}}
                  transition={{ duration: 0.4, delay: i * 0.1 }}
                >
                  <circle cx={cx} cy={80} r="56" fill="url(#step-glow)" />
                  <circle
                    cx={cx}
                    cy={80}
                    r="42"
                    fill="none"
                    stroke="url(#step-circle-grad)"
                    strokeWidth="2"
                    opacity={0.6 + i * 0.1}
                  />
                  <circle cx={cx} cy={80} r="42" fill="var(--accent)" opacity="0.06" />
                  <g clipPath={`url(#step-clip-${i})`} className="primer-stage-anim">
                    <DesktopStageAnim index={i} cx={cx} />
                  </g>
                  <text
                    x={cx} y={70}
                    textAnchor="middle" fontSize="10"
                    fill="var(--accent)" fontFamily="var(--font-mono-app)" fontWeight="600"
                  >
                    {step.num}
                  </text>
                  <text
                    x={cx} y={90}
                    textAnchor="middle" fontSize="15"
                    fill="var(--text)" fontWeight="600"
                  >
                    {step.label}
                  </text>
                  <text
                    x={cx} y={145}
                    textAnchor="middle" fontSize="11"
                    fill="var(--text-muted)" fontFamily="var(--font-mono-app)"
                  >
                    {step.short}
                  </text>
                  {"role" in step && step.role && (
                    <g opacity="0.75">
                      <svg
                        x={cx - 32} y={157}
                        width="10" height="10"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="var(--accent)"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
                        <path d="m9 12 2 2 4-4" />
                      </svg>
                      <text
                        x={cx - 18} y={166}
                        fontSize="8"
                        fill="var(--accent)"
                        fontFamily="var(--font-mono-app)"
                        fontWeight="500"
                      >
                        {step.role}
                      </text>
                    </g>
                  )}
                  <text
                    x={cx} y={"role" in step && step.role ? 182 : 165}
                    textAnchor="middle" fontSize="9.5"
                    fill="var(--text-muted)" opacity="0.7"
                  >
                    {step.descLines.map((line, li) => (
                      <tspan key={li} x={cx} dy={li === 0 ? 0 : 13}>{line}</tspan>
                    ))}
                  </text>
                  {i < steps.length - 1 && (
                    <g>
                      <line
                        x1={cx + 46} y1={80}
                        x2={cx + 134} y2={80}
                        stroke="var(--accent)"
                        strokeWidth="1.5"
                        strokeDasharray="6 4"
                        opacity="0.65"
                        style={{ animationName: "primer-dash-flow", animationDuration: "1.2s", animationTimingFunction: "linear", animationIterationCount: "infinite" }}
                      />
                      <polygon
                        points={`${cx + 134},80 ${cx + 126},75 ${cx + 126},85`}
                        fill="var(--accent)"
                        opacity="0.85"
                      />
                      <circle r="3" fill="var(--accent)" className="primer-stage-anim">
                        <animateMotion
                          dur="1.8s"
                          repeatCount="indefinite"
                          path={`M${cx + 46},80 L${cx + 134},80`}
                          begin={`${i * 0.3}s`}
                        />
                        <animate attributeName="opacity" values="0;0.8;0.8;0" dur="1.8s" begin={`${i * 0.3}s`} repeatCount="indefinite" />
                      </circle>
                    </g>
                  )}
                </motion.g>
              );
            })}
          </svg>
        </div>

        {/* Mobile: vertical flow with connecting line */}
        <div className="relative flex flex-col gap-3 md:hidden">
          <div
            className="absolute left-[1.25rem] top-0 h-full w-px"
            style={{
              background: "linear-gradient(180deg, var(--accent), transparent)",
              opacity: 0.2,
            }}
          />
          {steps.map((step, i) => (
            <motion.div
              key={step.num}
              initial={{ opacity: 0, x: -16 }}
              animate={isInView ? { opacity: 1, x: 0 } : {}}
              transition={{ duration: 0.4, delay: i * 0.08 }}
              className="relative flex items-center gap-4 rounded-lg border border-app-border bg-app-surface p-4"
            >
              <span
                className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full font-mono text-xs font-bold text-app-accent"
                style={{
                  background: "linear-gradient(135deg, color-mix(in srgb, var(--accent) 15%, transparent), color-mix(in srgb, var(--accent) 5%, transparent))",
                  border: "1px solid color-mix(in srgb, var(--accent) 30%, transparent)",
                }}
              >
                <MobileStageAnim index={i} />
                <span className="relative z-10">{step.num}</span>
              </span>
              <div>
                <p className="font-semibold text-app-text">{step.label} <span className="font-mono text-xs font-normal text-app-accent">{step.short}</span></p>
                {"role" in step && step.role && (
                  <span className="mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium text-app-accent" style={{ background: "color-mix(in srgb, var(--accent) 12%, transparent)" }}>
                    <ShieldCheck size={10} strokeWidth={2.5} aria-hidden />
                    {step.role}
                  </span>
                )}
                <p className="mt-0.5 text-xs leading-relaxed text-app-muted">{step.desc}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </Section>
  );
}
