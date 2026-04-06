"use client";

import { cn } from "@/lib/utils";
import { type ComponentType } from "react";

export interface FilterChipOption<T extends string> {
  value: T;
  label: string;
  icon?: ComponentType<{ className?: string }>;
}

interface FilterChipGroupProps<T extends string> {
  options: Array<FilterChipOption<T>>;
  selected: Set<T>;
  onToggle: (value: T) => void;
  className?: string;
  ariaLabel?: string;
}

export function FilterChipGroup<T extends string>({
  options,
  selected,
  onToggle,
  className,
  ariaLabel,
}: FilterChipGroupProps<T>) {
  return (
    <div
      role="toolbar"
      aria-label={ariaLabel}
      className={cn("flex flex-wrap items-center gap-2", className)}
    >
      {options.map((option) => {
        const active = selected.has(option.value);
        const Icon = option.icon;

        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => onToggle(option.value)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/40",
              active
                ? "border-app-accent bg-app-accent-dim text-app-text"
                : "border-app-border bg-app-surface text-app-muted hover:border-app-border-strong hover:text-app-text"
            )}
          >
            {Icon ? <Icon className="h-3.5 w-3.5" /> : null}
            <span>{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
