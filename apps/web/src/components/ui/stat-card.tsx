"use client";

import { Card } from "./card";
import { Skeleton } from "./skeleton";
import { cn } from "@/lib/utils";
import { InfoLabel } from "@/components/ui/info-tooltip";
import { type TooltipKey } from "@/lib/tooltip-copy";
import { type LucideIcon } from "lucide-react";

interface StatCardProps {
  label: string;
  value: string;
  subValue?: string;
  className?: string;
  isLoading?: boolean;
  tooltipKey?: TooltipKey;
  icon?: LucideIcon;
}

export function StatCard({ label, value, subValue, className, isLoading, tooltipKey, icon: Icon }: StatCardProps) {
  if (isLoading) {
    return (
      <Card className={cn("p-5", className)}>
        <Skeleton className="mb-2 h-3 w-20" />
        <Skeleton className="h-8 w-28" />
      </Card>
    );
  }

  return (
    <Card className={cn("p-5", className)}>
      <div className="flex items-center gap-2">
        {Icon && <Icon className="h-3.5 w-3.5 shrink-0 text-app-accent" />}
        <p className="font-mono text-xs font-medium uppercase tracking-wider text-app-muted">
          <InfoLabel label={label} tooltipKey={tooltipKey} />
        </p>
      </div>
      <p className="mt-2 font-mono text-2xl font-semibold tracking-tight text-app-text">{value}</p>
      {subValue && <p className="mt-1 text-xs text-app-muted">{subValue}</p>}
    </Card>
  );
}
