"use client";

import { useRef } from "react";
import { motion, useInView } from "framer-motion";
import { Section, SectionLabel, SectionHeading, SectionBody } from "./Section";

const baskets = [
  { label: "Basket A", subtitle: "ISOLATED PnL", y: 30 },
  { label: "Basket B", subtitle: "ISOLATED PnL", y: 110 },
  { label: "Basket C", subtitle: "ISOLATED PnL", y: 190 },
];

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
          <path
            d="M8,0 L3,7 L6.5,7 L5,14 L11,5.5 L7.5,5.5 Z"
            fill="var(--accent)"
          />
        </g>
      );
    case 1:
      return (
        <g transform={`translate(${x},${y})`} opacity="0.55">
          <circle cx="6" cy="6" r="4.5" fill="none" stroke="var(--accent)" strokeWidth="1.4" />
          <line x1="9.5" y1="9.5" x2="13" y2="13" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round" />
        </g>
      );
    case 2:
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
    default:
      return null;
  }
}

export function PrimerSharedLiquidity() {
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

      <div ref={ref} className="mt-16 flex justify-center">
        <svg viewBox="0 0 730 280" className="w-full max-w-2xl" aria-hidden>
          <defs>
            <linearGradient id="basket-top-grad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="var(--accent)" />
              <stop offset="100%" stopColor="#38bdf8" />
            </linearGradient>
            <radialGradient id="pool-glow-grad">
              <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.15" />
              <stop offset="60%" stopColor="var(--accent)" stopOpacity="0.04" />
              <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
            </radialGradient>
            <filter id="pool-blur">
              <feGaussianBlur stdDeviation="2" />
            </filter>
          </defs>

          {/* Baskets on left */}
          {baskets.map((b, i) => {
            const lineEndX = 330;
            const lineEndY = 140;
            const lineStartX = 200;
            const lineStartY = b.y + 30;

            return (
              <motion.g
                key={b.label}
                initial={{ opacity: 0, x: -20 }}
                animate={isInView ? { opacity: 1, x: 0 } : {}}
                transition={{ delay: i * 0.12, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              >
                {/* Gradient top border */}
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

                {/* Flow line with animated dot */}
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

          {/* Central shared pool with glow */}
          <motion.g
            initial={{ opacity: 0, scale: 0.8 }}
            animate={isInView ? { opacity: 1, scale: 1 } : {}}
            transition={{ delay: 0.35, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          >
            {/* Pulsing glow ring */}
            <circle cx="420" cy="140" r="90" fill="url(#pool-glow-grad)">
              <animate attributeName="r" values="88;96;88" dur="3s" repeatCount="indefinite" />
            </circle>
            <circle cx="420" cy="140" r="80" fill="var(--accent)" opacity="0.06" />
            <circle
              cx="420" cy="140" r="80"
              fill="none"
              stroke="var(--accent)"
              strokeWidth="2"
            />
            <text x="420" y="132" textAnchor="middle" fontSize="14" fontWeight="700" fill="var(--text)">
              Shared Perp
            </text>
            <text x="420" y="152" textAnchor="middle" fontSize="14" fontWeight="700" fill="var(--text)">
              Pool
            </text>
          </motion.g>

          {/* Right side — outputs with animated chevrons */}
          <motion.g
            initial={{ opacity: 0, x: 20 }}
            animate={isInView ? { opacity: 1, x: 0 } : {}}
            transition={{ delay: 0.55, duration: 0.5 }}
          >
            {[
              { label: "Execution", y: 80 },
              { label: "Price Discovery", y: 140 },
              { label: "Capital Efficiency", y: 200 },
            ].map((item, i) => (
              <g key={item.label}>
                <line
                  x1="500" y1={110 + i * 30}
                  x2="575" y2={item.y}
                  stroke="var(--accent)" strokeWidth="1.5" opacity="0.3"
                  strokeDasharray="4 3"
                />
                <g opacity="0.6">
                  <polygon
                    points={`${575},${item.y} ${570},${item.y - 4} ${570},${item.y + 4}`}
                    fill="var(--accent)"
                  >
                    <animate attributeName="opacity" values="0.4;1;0.4" dur="2s" begin={`${i * 0.3}s`} repeatCount="indefinite" />
                  </polygon>
                </g>
                <OutputIcon index={i} x={584} y={item.y - 7} />
                <text x="602" y={item.y + 4} fontSize="11" fill="var(--text-muted)" fontFamily="var(--font-mono-app)">
                  {item.label}
                </text>
              </g>
            ))}
          </motion.g>
        </svg>
      </div>
    </Section>
  );
}
