"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

interface SegmentedControlProps<T extends string> {
  options: { value: T; label: string; icon?: ReactNode; iconOnly?: boolean }[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
  equalWidth?: boolean;
  ariaLabel?: string;
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  className,
  equalWidth = false,
  ariaLabel,
}: SegmentedControlProps<T>) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn(
        "inline-flex items-center rounded-md border border-app-border bg-app-bg p-0.5 dark:bg-app-bg-subtle",
        className
      )}
    >
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          role="tab"
          aria-selected={value === opt.value}
          aria-label={opt.iconOnly ? opt.label : undefined}
          title={opt.iconOnly ? opt.label : undefined}
          className={cn(
            "relative rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
            equalWidth && "flex-1",
            value === opt.value
              ? "text-app-text"
              : "text-app-muted hover:text-app-text"
          )}
        >
          {value === opt.value && (
            <motion.div
              layoutId="segment"
              className="absolute inset-0 rounded-[5px] bg-app-surface shadow-sm dark:bg-app-surface-hover"
              transition={{ type: "spring", bounce: 0.2, duration: 0.35 }}
            />
          )}
          <span className="relative z-10 inline-flex items-center justify-center gap-1.5">
            {opt.icon ? <span aria-hidden>{opt.icon}</span> : null}
            <span className={opt.iconOnly ? "sr-only" : undefined}>{opt.label}</span>
          </span>
        </button>
      ))}
    </div>
  );
}
