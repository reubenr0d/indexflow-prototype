"use client";

import { cn } from "@/lib/utils";

export interface MetricCell {
  label: string;
  value: string;
  pnl?: boolean;
  sign?: number;
}

interface MetricsStripProps {
  metrics: MetricCell[];
  className?: string;
}

export function MetricsStrip({ metrics, className }: MetricsStripProps) {
  return (
    <div
      className={cn(
        "flex gap-px rounded-lg border border-app-border bg-app-border",
        "overflow-x-auto snap-x snap-mandatory scrollbar-none",
        "lg:flex-wrap lg:overflow-visible",
        className,
      )}
    >
      {metrics.map((m) => {
        const colorClass =
          m.pnl && m.sign !== undefined
            ? m.sign > 0
              ? "text-app-success"
              : m.sign < 0
                ? "text-app-danger"
                : "text-app-text"
            : "text-app-text";

        return (
          <div
            key={m.label}
            className={cn(
              "flex min-w-[7.5rem] shrink-0 snap-start flex-col bg-app-surface px-4 py-3",
              "first:rounded-tl-lg last:rounded-br-lg lg:flex-1 lg:shrink lg:snap-align-none",
            )}
          >
            <span className="text-[10px] font-semibold uppercase tracking-wider text-app-muted">
              {m.label}
            </span>
            <span className={cn("mt-1 font-mono text-sm font-semibold leading-tight", colorClass)}>
              {m.value}
            </span>
          </div>
        );
      })}
    </div>
  );
}
