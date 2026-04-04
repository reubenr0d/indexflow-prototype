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
        "inline-flex items-center rounded-full bg-neutral-100 p-1 dark:bg-neutral-800",
        className
      )}
    >
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={cn(
            "relative rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
            value === opt.value
              ? "text-neutral-900 dark:text-white"
              : "text-neutral-500 hover:text-neutral-700 dark:text-neutral-400"
          )}
        >
          {value === opt.value && (
            <motion.div
              layoutId="segment"
              className="absolute inset-0 rounded-full bg-white shadow-sm dark:bg-neutral-700"
              transition={{ type: "spring", bounce: 0.15, duration: 0.4 }}
            />
          )}
          <span className="relative z-10">{opt.label}</span>
        </button>
      ))}
    </div>
  );
}
