"use client";

import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface MetricCell {
  label: string;
  value: string;
  pnl?: boolean;
  sign?: number;
  icon?: LucideIcon;
  testId?: string;
}

interface MetricsGridProps {
  metrics: MetricCell[];
  className?: string;
}

export function MetricsGrid({ metrics, className }: MetricsGridProps) {
  return (
    <div
      className={cn(
        "grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-app-border bg-app-border",
        "sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6",
        className,
      )}
    >
      {metrics.map((m) => {
        const Icon = m.icon;
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
            className="flex flex-col overflow-hidden bg-app-surface px-4 py-3"
            data-testid={m.testId}
          >
            <div className="flex items-center gap-1.5">
              {Icon && (
                <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded bg-app-bg-subtle text-app-muted">
                  <Icon className="h-3 w-3" />
                </span>
              )}
              <span className="truncate text-[10px] font-semibold uppercase tracking-wider text-app-muted">
                {m.label}
              </span>
            </div>
            <span
              className={cn("mt-1 truncate font-mono text-sm font-semibold leading-tight", colorClass)}
              title={m.value}
              data-testid={m.testId ? `${m.testId}-value` : undefined}
            >
              {m.value}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export const MetricsStrip = MetricsGrid;
