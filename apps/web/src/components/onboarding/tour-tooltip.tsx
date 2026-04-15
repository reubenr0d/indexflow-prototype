"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTour } from "./tour-provider";
import { X } from "lucide-react";

interface Position {
  top: number;
  left: number;
}

function getTooltipPosition(
  targetRect: DOMRect,
  tooltipRect: DOMRect,
  placement: "top" | "bottom" | "left" | "right"
): Position {
  const gap = 12;

  switch (placement) {
    case "top":
      return {
        top: targetRect.top + window.scrollY - tooltipRect.height - gap,
        left: targetRect.left + window.scrollX + targetRect.width / 2 - tooltipRect.width / 2,
      };
    case "bottom":
      return {
        top: targetRect.bottom + window.scrollY + gap,
        left: targetRect.left + window.scrollX + targetRect.width / 2 - tooltipRect.width / 2,
      };
    case "left":
      return {
        top: targetRect.top + window.scrollY + targetRect.height / 2 - tooltipRect.height / 2,
        left: targetRect.left + window.scrollX - tooltipRect.width - gap,
      };
    case "right":
      return {
        top: targetRect.top + window.scrollY + targetRect.height / 2 - tooltipRect.height / 2,
        left: targetRect.right + window.scrollX + gap,
      };
  }
}

function clampPosition(pos: Position, tooltipRect: DOMRect): Position {
  const pad = 8;
  return {
    top: Math.max(pad + window.scrollY, Math.min(pos.top, window.scrollY + window.innerHeight - tooltipRect.height - pad)),
    left: Math.max(pad, Math.min(pos.left, window.innerWidth - tooltipRect.width - pad)),
  };
}

export function TourTooltip() {
  const { isActive, currentStep, steps, next, prev, skip, totalSteps } = useTour();
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<Position>({ top: 0, left: 0 });
  const [visible, setVisible] = useState(false);

  const step = steps[currentStep];

  useEffect(() => {
    if (!isActive || !step) {
      setVisible(false);
      return;
    }

    const target = document.querySelector(`[data-tour="${step.target}"]`);
    if (!target) {
      setVisible(false);
      return;
    }

    target.scrollIntoView({ behavior: "smooth", block: "center" });

    const timer = setTimeout(() => {
      const targetRect = target.getBoundingClientRect();
      const tooltip = tooltipRef.current;
      if (!tooltip) return;

      const tooltipRect = tooltip.getBoundingClientRect();
      const placement = step.placement ?? "bottom";
      const raw = getTooltipPosition(targetRect, tooltipRect, placement);
      setPosition(clampPosition(raw, tooltipRect));
      setVisible(true);
    }, 350);

    return () => clearTimeout(timer);
  }, [isActive, step, currentStep]);

  if (!isActive || !step) return null;

  const target = typeof document !== "undefined" ? document.querySelector(`[data-tour="${step.target}"]`) : null;

  return createPortal(
    <>
      {/* Backdrop with spotlight cutout */}
      <div className="fixed inset-0 z-[60] bg-black/50" onClick={skip} />
      {target && (
        <div
          className="pointer-events-none fixed z-[61] rounded-lg ring-2 ring-app-accent ring-offset-2 ring-offset-transparent"
          style={{
            top: target.getBoundingClientRect().top - 4,
            left: target.getBoundingClientRect().left - 4,
            width: target.getBoundingClientRect().width + 8,
            height: target.getBoundingClientRect().height + 8,
          }}
        />
      )}
      {/* Tooltip card */}
      <div
        ref={tooltipRef}
        className="absolute z-[62] w-80 rounded-xl border border-app-border bg-app-surface p-4 shadow-lg"
        style={{
          top: position.top,
          left: position.left,
          opacity: visible ? 1 : 0,
          transition: "opacity 200ms",
        }}
      >
        <div className="mb-1 flex items-center justify-between">
          <span className="text-xs font-semibold text-app-accent">
            Step {currentStep + 1} of {totalSteps}
          </span>
          <button
            type="button"
            onClick={skip}
            className="text-app-muted transition-colors hover:text-app-text"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        <h3 className="text-sm font-semibold text-app-text">{step.title}</h3>
        <p className="mt-1 text-xs leading-relaxed text-app-muted">{step.content}</p>
        <div className="mt-3 flex items-center justify-between">
          <button
            type="button"
            onClick={skip}
            className="text-xs font-medium text-app-muted hover:text-app-text"
          >
            Skip tour
          </button>
          <div className="flex gap-2">
            {currentStep > 0 && (
              <button
                type="button"
                onClick={prev}
                className="rounded-md border border-app-border px-3 py-1.5 text-xs font-semibold text-app-text transition-colors hover:bg-app-surface"
              >
                Back
              </button>
            )}
            <button
              type="button"
              onClick={next}
              className="rounded-md bg-app-accent px-3 py-1.5 text-xs font-semibold text-app-accent-fg transition-opacity hover:opacity-90"
            >
              {currentStep === totalSteps - 1 ? "Done" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </>,
    document.body
  );
}
