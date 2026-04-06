"use client";

import { cn } from "@/lib/utils";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { type ReactNode } from "react";
import type { StatusChipTone } from "./status-chip";

export type TrendDirection = "up" | "down" | "flat";

const toneClasses: Record<StatusChipTone, string> = {
  neutral: "border-app-border bg-app-bg text-app-muted",
  accent: "border-app-accent/30 bg-app-accent-dim text-app-accent",
  success: "border-app-success/30 bg-app-success/10 text-app-success",
  warning: "border-app-warning/30 bg-app-warning/10 text-app-warning",
  danger: "border-app-danger/30 bg-app-danger/10 text-app-danger",
};

interface TrendPillProps {
  direction: TrendDirection;
  children: ReactNode;
  tone?: StatusChipTone;
  className?: string;
  title?: string;
}

export function TrendPill({
  direction,
  children,
  tone,
  className,
  title,
}: TrendPillProps) {
  const resolvedTone =
    tone ?? (direction === "down" ? "danger" : direction === "up" ? "success" : "neutral");
  const Icon = direction === "up" ? ArrowUpRight : direction === "down" ? ArrowDownRight : Minus;

  return (
    <span
      title={title}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 font-mono text-xs font-semibold",
        toneClasses[resolvedTone],
        className
      )}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span className="whitespace-nowrap">{children}</span>
    </span>
  );
}
