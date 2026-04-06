"use client";

import { cn } from "@/lib/utils";
import { type ReactNode } from "react";

export type StatusChipTone = "neutral" | "accent" | "success" | "warning" | "danger";

const toneClasses: Record<StatusChipTone, string> = {
  neutral: "border-app-border bg-app-bg text-app-muted",
  accent: "border-app-accent/30 bg-app-accent-dim text-app-accent",
  success: "border-app-success/30 bg-app-success/10 text-app-success",
  warning: "border-app-warning/30 bg-app-warning/10 text-app-warning",
  danger: "border-app-danger/30 bg-app-danger/10 text-app-danger",
};

interface StatusChipProps {
  children: ReactNode;
  tone?: StatusChipTone;
  icon?: ReactNode;
  className?: string;
  title?: string;
}

export function StatusChip({
  children,
  tone = "neutral",
  icon,
  className,
  title,
}: StatusChipProps) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide",
        toneClasses[tone],
        className
      )}
    >
      {icon && <span className="inline-flex h-3.5 w-3.5 items-center justify-center">{icon}</span>}
      <span className="whitespace-nowrap">{children}</span>
    </span>
  );
}
