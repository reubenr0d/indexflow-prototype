"use client";

import { cn } from "@/lib/utils";
import { getTooltipCopy, type TooltipKey } from "@/lib/tooltip-copy";
import { CircleHelp } from "lucide-react";
import {
  type FocusEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";

interface InfoTooltipProps {
  content: string;
  ariaLabel: string;
  className?: string;
}

export function InfoTooltip({ content, ariaLabel, className }: InfoTooltipProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLSpanElement | null>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (!rootRef.current?.contains(target)) {
        setOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const handleBlur = (event: FocusEvent<HTMLSpanElement>) => {
    const next = event.relatedTarget as Node | null;
    if (!next || !rootRef.current?.contains(next)) {
      setOpen(false);
    }
  };

  const handleClick = (event: ReactMouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setOpen((prev) => !prev);
  };

  return (
    <span
      ref={rootRef}
      className={cn("relative inline-flex items-center", className)}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocusCapture={() => setOpen(true)}
      onBlurCapture={handleBlur}
    >
      <button
        type="button"
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-describedby={open ? id : undefined}
        className="inline-flex h-4 w-4 items-center justify-center rounded-sm text-app-muted transition-colors hover:text-app-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/40"
        onClick={handleClick}
      >
        <CircleHelp className="h-3.5 w-3.5" />
      </button>
      {open && (
        <span
          id={id}
          role="tooltip"
          className="absolute left-0 top-[calc(100%+0.45rem)] z-30 w-64 rounded-md border border-app-border bg-app-surface p-2 text-[11px] leading-relaxed text-app-text shadow-[var(--shadow)]"
        >
          {content}
        </span>
      )}
    </span>
  );
}

interface InfoLabelProps {
  label: ReactNode;
  tooltipKey?: TooltipKey;
  tooltip?: string;
  triggerLabel?: string;
  className?: string;
}

export function InfoLabel({
  label,
  tooltipKey,
  tooltip,
  triggerLabel,
  className,
}: InfoLabelProps) {
  const content = tooltip ?? (tooltipKey ? getTooltipCopy(tooltipKey) : undefined);
  if (!content) {
    return <span className={className}>{label}</span>;
  }

  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <span>{label}</span>
      <InfoTooltip
        content={content}
        ariaLabel={triggerLabel ?? `Show info for ${typeof label === "string" ? label : "this field"}`}
      />
    </span>
  );
}
