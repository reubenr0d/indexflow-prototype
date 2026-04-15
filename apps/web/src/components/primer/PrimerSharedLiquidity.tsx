"use client";

import { useRef } from "react";
import { motion, useInView } from "framer-motion";
import { Section, SectionLabel, SectionHeading, SectionBody } from "./Section";

const baskets = [
  { label: "Basket A", subtitle: "ISOLATED PnL", y: 30 },
  { label: "Basket B", subtitle: "ISOLATED PnL", y: 110 },
  { label: "Basket C", subtitle: "ISOLATED PnL", y: 190 },
];

const features = [
  { label: "NAV Pricing", y: 80 },
  { label: "Redemption Liquidity", y: 140 },
  { label: "Execution Infra", y: 200 },
];

const chainNodes = [
  { label: "Chain A", subtitle: "PERP POOL", y: 30 },
  { label: "Chain B", subtitle: "PERP POOL", y: 110 },
  { label: "Chain C", subtitle: "PERP POOL", y: 190 },
];

const FEATURE_BOX_X = 305;
const FEATURE_BOX_W = 185;
const FEATURE_BOX_Y = 48;
const FEATURE_BOX_H = 184;
const CHAIN_X = 590;
const CHAIN_W = 150;

function BasketThemeIcon({ index, x, y }: { index: number; x: number; y: number }) {
  switch (index) {
    case 0:
      return (
        <g transform={`translate(${x},${y})`} opacity="0.55">
          <path
            d="M1,13 L5,5 L7.5,8 L10,2 L14,13 Z"
            fill="none" stroke="var(--accent)" strokeWidth="1.3" strokeLinejoin="round"
          />
          <path d="M4,13 L7,9 L10,13" fill="none" stroke="var(--accent)" strokeWidth="1" opacity="0.5" />
        </g>
      );
    case 1:
      return (
        <g transform={`translate(${x},${y})`} opacity="0.55">
          <circle cx="7" cy="7" r="6" fill="none" stroke="var(--accent)" strokeWidth="1.3" />
          <path
            d="M5.5,5 L8,5 Q9.5,5 9.5,6.5 Q9.5,7.5 8,7.5 L5.5,7.5 M5.5,7.5 L8.5,7.5 Q10,7.5 10,9 Q10,10 8.5,10 L5.5,10 M7,3.5 L7,4.5 M7,10 L7,11"
            fill="none" stroke="var(--accent)" strokeWidth="1" strokeLinecap="round"
          />
        </g>
      );
    case 2:
      return (
        <g transform={`translate(${x},${y})`} opacity="0.55">
          <path d="M7,2 L13,5.5 L7,9 L1,5.5 Z" fill="var(--accent)" opacity="0.2" />
          <path d="M7,2 L13,5.5 L7,9 L1,5.5 Z" fill="none" stroke="var(--accent)" strokeWidth="1.2" />
          <path d="M1,7.5 L7,11 L13,7.5" fill="none" stroke="var(--accent)" strokeWidth="1.2" />
          <path d="M1,10 L7,13.5 L13,10" fill="none" stroke="var(--accent)" strokeWidth="1.2" />
        </g>
      );
    default:
      return null;
  }
}

function OutputIcon({ index, x, y }: { index: number; x: number; y: number }) {
  switch (index) {
    case 0:
      return (
        <g transform={`translate(${x},${y})`} opacity="0.55">
          <polyline
            points="1,11 5,7 8,10 13,3"
            fill="none" stroke="var(--accent)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"
          />
          <polyline
            points="9,3 13,3 13,7"
            fill="none" stroke="var(--accent)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"
          />
        </g>
      );
    case 1:
      return (
        <g transform={`translate(${x},${y})`} opacity="0.55">
          <circle cx="7" cy="7" r="6" fill="none" stroke="var(--accent)" strokeWidth="1.3" />
          <path
            d="M5.5,5 L8,5 Q9.5,5 9.5,6.5 Q9.5,7.5 8,7.5 L5.5,7.5 M5.5,7.5 L8.5,7.5 Q10,7.5 10,9 Q10,10 8.5,10 L5.5,10 M7,3.5 L7,4.5 M7,10 L7,11"
            fill="none" stroke="var(--accent)" strokeWidth="1" strokeLinecap="round"
          />
        </g>
      );
    case 2:
      return (
        <g transform={`translate(${x},${y})`} opacity="0.55">
          <path
            d="M8,0 L3,7 L6.5,7 L5,14 L11,5.5 L7.5,5.5 Z"
            fill="var(--accent)"
          />
        </g>
      );
    default:
      return null;
  }
}

function ChainIcon({ index, x, y }: { index: number; x: number; y: number }) {
  switch (index) {
    case 0:
      return (
        <g transform={`translate(${x},${y})`} opacity="0.55">
          <polygon
            points="7,0 13.5,3.75 13.5,11.25 7,15 0.5,11.25 0.5,3.75"
            fill="var(--accent)" opacity="0.2"
            stroke="var(--accent)" strokeWidth="1.2"
          />
        </g>
      );
    case 1:
      return (
        <g transform={`translate(${x},${y})`} opacity="0.55">
          <polygon
            points="7,0 14,7 7,14 0,7"
            fill="var(--accent)" opacity="0.2"
            stroke="var(--accent)" strokeWidth="1.2"
          />
        </g>
      );
    case 2:
      return (
        <g transform={`translate(${x},${y})`} opacity="0.55">
          <circle cx="7" cy="7" r="6.5"
            fill="var(--accent)" opacity="0.15"
            stroke="var(--accent)" strokeWidth="1.2"
          />
          <circle cx="7" cy="7" r="2.5" fill="var(--accent)" opacity="0.4" />
        </g>
      );
    default:
      return null;
  }
}

export default function PrimerSharedLiquidity() {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-80px" });

  return (
    <Section
      id="shared"
      className="border-b border-app-border bg-app-bg-subtle py-24 sm:py-32"
    >
      <SectionLabel>Many baskets, many chains</SectionLabel>
      <SectionHeading>Shared Liquidity Engine</SectionHeading>
      <SectionBody>
        Execution capacity is shared while reserve discipline remains
        product-aware. Each basket tracks its own PnL against the same pool.
      </SectionBody>

      <div ref={ref} />

      {/* Mobile stacked layout */}
      <div className="mt-16 flex flex-col gap-4 md:hidden">
        {/* Baskets */}
        <div className="space-y-3">
          {baskets.map((b, i) => (
            <motion.div
              key={b.label}
              initial={{ opacity: 0, x: -16 }}
              animate={isInView ? { opacity: 1, x: 0 } : {}}
              transition={{ delay: i * 0.1, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
              className="rounded-lg border border-app-accent/30 bg-app-surface p-4"
            >
              <p className="text-sm font-semibold text-app-text">{b.label}</p>
              <p className="font-mono text-[10px] uppercase tracking-wider text-app-muted">{b.subtitle}</p>
            </motion.div>
          ))}
        </div>

        {/* Arrow down */}
        <div className="flex justify-center text-app-accent/40">
          <svg width="24" height="32" viewBox="0 0 24 32" fill="none" aria-hidden>
            <path d="M12 0v28m0 0l-6-6m6 6l6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>

        {/* Shared features */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={isInView ? { opacity: 1, scale: 1 } : {}}
          transition={{ delay: 0.3, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="rounded-xl border border-app-accent/40 bg-app-surface p-5"
        >
          <p className="mb-3 font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-app-accent">Shared Engine</p>
          <div className="space-y-2">
            {features.map((f) => (
              <div key={f.label} className="flex items-center gap-2 text-sm font-medium text-app-text">
                <span className="h-1.5 w-1.5 rounded-full bg-app-accent" />
                {f.label}
              </div>
            ))}
          </div>
        </motion.div>

        {/* Arrow down */}
        <div className="flex justify-center text-app-accent/40">
          <svg width="24" height="32" viewBox="0 0 24 32" fill="none" aria-hidden>
            <path d="M12 0v28m0 0l-6-6m6 6l6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>

        {/* Chains */}
        <div className="space-y-3">
          {chainNodes.map((c, i) => (
            <motion.div
              key={c.label}
              initial={{ opacity: 0, x: 16 }}
              animate={isInView ? { opacity: 1, x: 0 } : {}}
              transition={{ delay: 0.5 + i * 0.1, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
              className="rounded-lg border border-app-accent/30 border-dashed bg-app-surface p-4"
            >
              <p className="text-sm font-semibold text-app-text">{c.label}</p>
              <p className="font-mono text-[10px] uppercase tracking-wider text-app-muted">{c.subtitle}</p>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Desktop SVG diagram */}
      <div className="mt-16 hidden justify-center md:flex">
        <svg viewBox="0 0 780 280" className="w-full max-w-3xl" aria-hidden>
          <defs>
            <linearGradient id="basket-top-grad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="var(--accent)" />
              <stop offset="100%" stopColor="#38bdf8" />
            </linearGradient>
            <linearGradient id="chain-side-grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--accent)" />
              <stop offset="100%" stopColor="#38bdf8" />
            </linearGradient>
            <filter id="feature-glow">
              <feGaussianBlur stdDeviation="3" />
            </filter>
          </defs>

          {/* Baskets on left */}
          {baskets.map((b, i) => {
            const lineStartX = 200;
            const lineStartY = b.y + 30;
            const lineEndX = FEATURE_BOX_X;
            const lineEndY = 140;

            return (
              <motion.g
                key={b.label}
                initial={{ opacity: 0, x: -20 }}
                animate={isInView ? { opacity: 1, x: 0 } : {}}
                transition={{ delay: i * 0.12, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              >
                <rect x="40" y={b.y} width="160" height="3" rx="1.5" fill="url(#basket-top-grad)" />
                <rect
                  x="40" y={b.y + 3} width="160" height="57" rx="0 0 10 10"
                  fill="var(--surface)"
                  stroke="var(--accent)"
                  strokeWidth="1.5"
                  strokeDasharray="0"
                />
                <rect x="40" y={b.y} width="160" height="60" rx="10" fill="var(--accent)" opacity="0.04" />
                <BasketThemeIcon index={i} x={52} y={b.y + 22} />
                <text
                  x="128" y={b.y + 28}
                  textAnchor="middle" fontSize="13" fontWeight="600" fill="var(--text)"
                >
                  {b.label}
                </text>
                <text
                  x="128" y={b.y + 46}
                  textAnchor="middle" fontSize="10" fill="var(--text-muted)" fontFamily="var(--font-mono-app)"
                >
                  {b.subtitle}
                </text>

                <line
                  x1={lineStartX} y1={lineStartY}
                  x2={lineEndX} y2={lineEndY}
                  stroke="var(--accent)" strokeWidth="1.5" opacity="0.25"
                />
                <circle r="3" fill="var(--accent)" opacity="0.8">
                  <animate
                    attributeName="cx"
                    values={`${lineStartX};${lineEndX}`}
                    dur={`${2 + i * 0.3}s`}
                    repeatCount="indefinite"
                  />
                  <animate
                    attributeName="cy"
                    values={`${lineStartY};${lineEndY}`}
                    dur={`${2 + i * 0.3}s`}
                    repeatCount="indefinite"
                  />
                  <animate attributeName="opacity" values="0;1;1;0" dur={`${2 + i * 0.3}s`} repeatCount="indefinite" />
                </circle>
              </motion.g>
            );
          })}

          {/* Center feature column */}
          <motion.g
            initial={{ opacity: 0, scale: 0.9 }}
            animate={isInView ? { opacity: 1, scale: 1 } : {}}
            transition={{ delay: 0.35, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          >
            <rect
              x={FEATURE_BOX_X - 8} y={FEATURE_BOX_Y - 8}
              width={FEATURE_BOX_W + 16} height={FEATURE_BOX_H + 16} rx="16"
              fill="var(--accent)" opacity="0.04" filter="url(#feature-glow)"
            />
            <rect
              x={FEATURE_BOX_X} y={FEATURE_BOX_Y}
              width={FEATURE_BOX_W} height={FEATURE_BOX_H} rx="12"
              fill="var(--surface)" stroke="var(--accent)" strokeWidth="1.5"
            />
            <rect
              x={FEATURE_BOX_X} y={FEATURE_BOX_Y}
              width={FEATURE_BOX_W} height={FEATURE_BOX_H} rx="12"
              fill="var(--accent)" opacity="0.04"
            />

            <line
              x1={FEATURE_BOX_X + 15} y1={110}
              x2={FEATURE_BOX_X + FEATURE_BOX_W - 15} y2={110}
              stroke="var(--accent)" strokeWidth="0.5" opacity="0.12"
            />
            <line
              x1={FEATURE_BOX_X + 15} y1={170}
              x2={FEATURE_BOX_X + FEATURE_BOX_W - 15} y2={170}
              stroke="var(--accent)" strokeWidth="0.5" opacity="0.12"
            />

            {features.map((f, i) => (
              <g key={f.label}>
                <OutputIcon index={i} x={FEATURE_BOX_X + 14} y={f.y - 7} />
                <text
                  x={FEATURE_BOX_X + 36} y={f.y + 4}
                  fontSize="11" fontWeight="600" fill="var(--text)"
                  fontFamily="var(--font-mono-app)"
                >
                  {f.label}
                </text>
              </g>
            ))}
          </motion.g>

          {/* Right side — chain deployment cards */}
          {chainNodes.map((chain, i) => {
            const lineStartX = FEATURE_BOX_X + FEATURE_BOX_W;
            const lineEndX = CHAIN_X;
            const lineStartY = features[i].y;
            const lineEndY = chain.y + 30;
            const chainCenterX = CHAIN_X + CHAIN_W / 2;

            return (
              <motion.g
                key={chain.label}
                initial={{ opacity: 0, x: 20 }}
                animate={isInView ? { opacity: 1, x: 0 } : {}}
                transition={{ delay: 0.5 + i * 0.12, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              >
                {/* Dashed flow line from feature to chain card */}
                <line
                  x1={lineStartX} y1={lineStartY}
                  x2={lineEndX} y2={lineEndY}
                  stroke="var(--accent)" strokeWidth="1.5" opacity="0.25"
                  strokeDasharray="4 3"
                />
                <circle r="3" fill="var(--accent)">
                  <animate
                    attributeName="cx"
                    values={`${lineStartX};${lineEndX}`}
                    dur={`${2.5 + i * 0.3}s`}
                    repeatCount="indefinite"
                  />
                  <animate
                    attributeName="cy"
                    values={`${lineStartY};${lineEndY}`}
                    dur={`${2.5 + i * 0.3}s`}
                    repeatCount="indefinite"
                  />
                  <animate attributeName="opacity" values="0;0.8;0.8;0" dur={`${2.5 + i * 0.3}s`} repeatCount="indefinite" />
                </circle>

                {/* Chain card — dashed border + left accent bar */}
                <rect
                  x={CHAIN_X} y={chain.y} width={CHAIN_W} height="60" rx="10"
                  fill="var(--surface)"
                  stroke="var(--accent)"
                  strokeWidth="1.5"
                  strokeDasharray="6 3"
                />
                <rect x={CHAIN_X} y={chain.y} width={CHAIN_W} height="60" rx="10" fill="var(--accent)" opacity="0.04" />
                <rect x={CHAIN_X} y={chain.y + 6} width="3" height="48" rx="1.5" fill="url(#chain-side-grad)" />
                <ChainIcon index={i} x={CHAIN_X + 10} y={chain.y + 22} />
                <text
                  x={chainCenterX + 4} y={chain.y + 28}
                  textAnchor="middle" fontSize="13" fontWeight="600" fill="var(--text)"
                >
                  {chain.label}
                </text>
                <text
                  x={chainCenterX + 4} y={chain.y + 46}
                  textAnchor="middle" fontSize="10" fill="var(--text-muted)" fontFamily="var(--font-mono-app)"
                >
                  {chain.subtitle}
                </text>
              </motion.g>
            );
          })}
        </svg>
      </div>
    </Section>
  );
}
