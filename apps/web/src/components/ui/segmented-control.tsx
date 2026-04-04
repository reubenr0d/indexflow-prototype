"use client";

import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

interface SegmentedControlProps<T extends string> {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  className,
}: SegmentedControlProps<T>) {
  return (
    <div
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
          className={cn(
            "relative rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
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
          <span className="relative z-10">{opt.label}</span>
        </button>
      ))}
    </div>
  );
}
