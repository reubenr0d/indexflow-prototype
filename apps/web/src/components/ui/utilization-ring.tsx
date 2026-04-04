"use client";

import { cn } from "@/lib/utils";

interface UtilizationRingProps {
  percentage: number;
  size?: number;
  strokeWidth?: number;
  className?: string;
  label?: string;
}

export function UtilizationRing({
  percentage,
  size = 120,
  strokeWidth = 10,
  className,
  label,
}: UtilizationRingProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percentage / 100) * circumference;

  const color =
    percentage < 50
      ? "stroke-emerald-500"
      : percentage < 80
        ? "stroke-amber-500"
        : "stroke-red-500";

  return (
    <div className={cn("relative flex flex-col items-center", className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          className="stroke-neutral-100 dark:stroke-neutral-800"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className={cn("transition-all duration-700 ease-out", color)}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-semibold text-neutral-900 dark:text-white">
          {percentage.toFixed(1)}%
        </span>
        {label && <span className="text-xs text-neutral-400">{label}</span>}
      </div>
    </div>
  );
}
