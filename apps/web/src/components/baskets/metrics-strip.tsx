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
        "flex gap-px overflow-x-auto rounded-lg border border-app-border bg-app-border",
        "snap-x snap-mandatory scrollbar-none",
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
              "first:rounded-l-lg last:rounded-r-lg",
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
