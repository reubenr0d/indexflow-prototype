import type { CSSProperties } from "react";

export function ShortLivedSVG() {
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
      <circle cx="100" cy="25" r="6" fill="var(--accent)" opacity="0.15">
        <animate attributeName="r" values="4;8;4" dur="2s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.25;0.08;0.25" dur="2s" repeatCount="indefinite" />
      </circle>
      <circle cx="100" cy="25" r="3.5" fill="var(--accent)" />
      <line
        x1="130" y1="50" x2="155" y2="85"
        stroke="var(--danger)" strokeWidth="1.5"
        strokeDasharray="4 3"
        style={{ animationName: "primer-dash-flow", animationDuration: "1s", animationTimingFunction: "linear", animationIterationCount: "infinite" }}
      />
      <polygon points="155,85 147,81 154,76" fill="var(--danger)" />
      <text x="100" y="14" textAnchor="middle" fontSize="9" fill="var(--accent)" fontFamily="var(--font-mono-app)" fontWeight="600">
        SPIKE
      </text>
    </svg>
  );
}

export function NoAttributionSVG() {
  return (
    <svg viewBox="0 0 200 120" className="h-32 w-auto" aria-hidden>
      <defs>
        <linearGradient id="no-attr-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="var(--border-strong)" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.3" />
        </linearGradient>
      </defs>
      <circle cx="60" cy="50" r="28" fill="var(--accent)" opacity="0.04" />
      <circle cx="60" cy="50" r="28" fill="none" stroke="url(#no-attr-grad)" strokeWidth="1.5" strokeDasharray="5 3"
        style={{ animationName: "primer-slow-spin", animationDuration: "12s", animationTimingFunction: "linear", animationIterationCount: "infinite", transformOrigin: "60px 50px" }} />
      <circle cx="140" cy="60" r="24" fill="var(--accent)" opacity="0.04" />
      <circle cx="140" cy="60" r="24" fill="none" stroke="url(#no-attr-grad)" strokeWidth="1.5" strokeDasharray="5 3"
        style={{ animationName: "primer-slow-spin", animationDuration: "10s", animationTimingFunction: "linear", animationIterationCount: "infinite", animationDirection: "reverse", transformOrigin: "140px 60px" }} />
      <line x1="85" y1="48" x2="95" y2="51" stroke="var(--border-strong)" strokeWidth="2" />
      <line x1="105" y1="54" x2="115" y2="57" stroke="var(--border-strong)" strokeWidth="2" />
      <text x="100" y="56" textAnchor="middle" fontSize="10" fill="var(--danger)" fontWeight="700" opacity="0.7">
        {"///"}
      </text>
      <text x="60" y="54" textAnchor="middle" fontSize="18" fill="var(--text-muted)" fontWeight="700" opacity="0.6">$</text>
      <text x="140" y="64" textAnchor="middle" fontSize="16" fill="var(--text-muted)" fontWeight="700" opacity="0.6">?</text>
      <text x="60" y="90" textAnchor="middle" fontSize="8" fill="var(--text-muted)" fontFamily="var(--font-mono-app)">FUNDING</text>
      <text x="140" y="95" textAnchor="middle" fontSize="8" fill="var(--text-muted)" fontFamily="var(--font-mono-app)">OUTCOMES</text>
    </svg>
  );
}

export function IlliquidSVG() {
  return (
    <svg viewBox="0 0 200 120" className="h-32 w-auto" aria-hidden>
      <defs>
        <linearGradient id="illiq-bar-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.25" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.05" />
        </linearGradient>
      </defs>
      <rect x="50" y="18" width="100" height="72" rx="8" fill="url(#illiq-bar-grad)" stroke="var(--border-strong)" strokeWidth="1.5" />
      {[0, 1, 2].map((i) => (
        <rect key={i} x={68 + i * 22} y={48 - i * 6} width="14" height={32 + i * 6} rx="2" fill="var(--accent)" opacity={0.15 + i * 0.08}>
          <animate attributeName="opacity" values={`${0.12 + i * 0.06};${0.25 + i * 0.06};${0.12 + i * 0.06}`} dur={`${2.5 + i * 0.3}s`} repeatCount="indefinite" />
        </rect>
      ))}
      <rect x="90" y="55" width="20" height="16" rx="3" fill="var(--danger)" opacity="0.7" />
      <path d="M94,55 L94,49 A6,6 0 0 1 106,49 L106,55" fill="none" stroke="var(--danger)" strokeWidth="2" strokeLinecap="round" opacity="0.7" />
      <circle cx="100" cy="63" r="2" fill="var(--surface)" />
      <rect x="88" y="53" width="24" height="20" rx="4" fill="none" stroke="var(--danger)" strokeWidth="1" opacity="0">
        <animate attributeName="opacity" values="0;0.4;0" dur="2.5s" repeatCount="indefinite" />
        <animate attributeName="strokeWidth" values="1;2.5;1" dur="2.5s" repeatCount="indefinite" />
      </rect>
      <text x="100" y="108" textAnchor="middle" fontSize="8" fill="var(--text-muted)" fontFamily="var(--font-mono-app)">NO EXIT PATH</text>
    </svg>
  );
}

export function OpaqueNAVSVG() {
  return (
    <svg viewBox="0 0 200 120" className="h-32 w-auto" aria-hidden>
      <defs>
        <linearGradient id="opaque-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="var(--border-strong)" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.2" />
        </linearGradient>
      </defs>
      <rect x="40" y="20" width="120" height="50" rx="8" fill="var(--accent)" opacity="0.04" stroke="var(--border-strong)" strokeWidth="1.5" />
      {[0, 1, 2].map((i) => (
        <line key={i} x1={55} y1={35 + i * 12} x2={105 + i * 10} y2={35 + i * 12} stroke="var(--border-strong)" strokeWidth="2" opacity={0.25} strokeLinecap="round" />
      ))}
      <circle cx="100" cy="45" r="22" fill="var(--accent)" opacity="0.06">
        <animate attributeName="r" values="20;25;20" dur="3s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.08;0.03;0.08" dur="3s" repeatCount="indefinite" />
      </circle>
      <text x="100" y="53" textAnchor="middle" fontSize="28" fill="var(--danger)" fontWeight="700" opacity="0.6">?</text>
      <g transform="translate(70, 78)" opacity="0.5">
        <ellipse cx="30" cy="8" rx="18" ry="8" fill="none" stroke="var(--text-muted)" strokeWidth="1.5" />
        <circle cx="30" cy="8" r="4" fill="var(--text-muted)" opacity="0.4" />
        <line x1="14" y1="18" x2="46" y2="-2" stroke="var(--danger)" strokeWidth="2" strokeLinecap="round" opacity="0.7" />
      </g>
      <text x="100" y="108" textAnchor="middle" fontSize="8" fill="var(--text-muted)" fontFamily="var(--font-mono-app)">UNVERIFIABLE</text>
    </svg>
  );
}

export function FragmentedSVG() {
  const boxes = [
    { x: 25, y: 20, w: 35, h: 25, driftName: "primer-frag-drift-a", dur: "9s" },
    { x: 80, y: 15, w: 30, h: 20, driftName: "primer-frag-drift-b", dur: "11s" },
    { x: 130, y: 30, w: 40, h: 22, driftName: "primer-frag-drift-c", dur: "10s" },
    { x: 40, y: 65, w: 32, h: 24, driftName: "primer-frag-drift-a", dur: "12s", reverse: true },
    { x: 100, y: 70, w: 35, h: 20, driftName: "primer-frag-drift-b", dur: "8s", reverse: true },
    { x: 155, y: 75, w: 28, h: 22, driftName: "primer-frag-drift-c", dur: "13s" },
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
        <g key={i} style={{ animationName: b.driftName, animationDuration: b.dur, animationTimingFunction: "ease-in-out", animationIterationCount: "infinite", ...("reverse" in b && b.reverse ? { animationDirection: "reverse" as const } : {}) }}>
          <rect x={b.x} y={b.y} width={b.w} height={b.h} rx="4" fill="url(#frag-box-grad)" stroke="var(--border-strong)" strokeWidth="1.5" opacity={0.5 + i * 0.08}>
            <animate attributeName="opacity" values={`${0.4 + i * 0.08};${0.7 + i * 0.04};${0.4 + i * 0.08}`} dur={`${2.5 + i * 0.4}s`} repeatCount="indefinite" />
          </rect>
          <text x={b.x + b.w / 2} y={b.y + b.h / 2 + 3} textAnchor="middle" fontSize="8" fill="var(--text-muted)" fontWeight="600" opacity="0.35">$</text>
        </g>
      ))}
      <line x1="60" y1="35" x2="80" y2="25" stroke="var(--border)" strokeWidth="1" strokeDasharray="3 3" style={{ animationName: "primer-dash-flow", animationDuration: "1.5s", animationTimingFunction: "linear", animationIterationCount: "infinite" }}>
        <animate attributeName="opacity" values="0.3;0.1;0.3" dur="3s" repeatCount="indefinite" />
      </line>
      <line x1="110" y1="25" x2="130" y2="35" stroke="var(--border)" strokeWidth="1" strokeDasharray="3 3" style={{ animationName: "primer-dash-flow", animationDuration: "1.8s", animationTimingFunction: "linear", animationIterationCount: "infinite" }}>
        <animate attributeName="opacity" values="0.3;0.08;0.3" dur="3.5s" repeatCount="indefinite" />
      </line>
      <line x1="72" y1="77" x2="100" y2="78" stroke="var(--border)" strokeWidth="1" strokeDasharray="3 3" style={{ animationName: "primer-dash-flow", animationDuration: "2s", animationTimingFunction: "linear", animationIterationCount: "infinite" }}>
        <animate attributeName="opacity" values="0.25;0.1;0.25" dur="4s" repeatCount="indefinite" />
      </line>
      {dots.map((d, i) => (
        <circle key={`dot-${i}`} cx={d.cx} cy={d.cy} r="2" fill="var(--accent)"
          style={{ "--burst-x": d.bx, "--burst-y": d.by, animationName: "primer-burst-dot", animationDuration: "3s", animationTimingFunction: "ease-out", animationDelay: d.delay, animationIterationCount: "infinite" } as CSSProperties}
        />
      ))}
      <text x="100" y="112" textAnchor="middle" fontSize="8" fill="var(--text-muted)" fontFamily="var(--font-mono-app)">ISOLATED LIQUIDITY</text>
    </svg>
  );
}
