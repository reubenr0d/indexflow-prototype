"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTour } from "./tour-provider";
import { X } from "lucide-react";

interface Position {
  top: number;
  left: number;
}

interface SpotlightRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

type Placement = "top" | "bottom" | "left" | "right";

const GAP = 12;
const EDGE_PAD = 8;

function getTooltipPosition(
  targetRect: DOMRect,
  tooltipRect: { width: number; height: number },
  placement: Placement
): Position {
  switch (placement) {
    case "top":
      return {
        top: targetRect.top - tooltipRect.height - GAP,
        left: targetRect.left + targetRect.width / 2 - tooltipRect.width / 2,
      };
    case "bottom":
      return {
        top: targetRect.bottom + GAP,
        left: targetRect.left + targetRect.width / 2 - tooltipRect.width / 2,
      };
    case "left":
      return {
        top: targetRect.top + targetRect.height / 2 - tooltipRect.height / 2,
        left: targetRect.left - tooltipRect.width - GAP,
      };
    case "right":
      return {
        top: targetRect.top + targetRect.height / 2 - tooltipRect.height / 2,
        left: targetRect.right + GAP,
      };
  }
}

function fitsInViewport(pos: Position, tooltipRect: { width: number; height: number }): boolean {
  return (
    pos.top >= EDGE_PAD &&
    pos.left >= EDGE_PAD &&
    pos.top + tooltipRect.height <= window.innerHeight - EDGE_PAD &&
    pos.left + tooltipRect.width <= window.innerWidth - EDGE_PAD
  );
}

function clampPosition(pos: Position, tooltipRect: { width: number; height: number }): Position {
  return {
    top: Math.max(
      EDGE_PAD,
      Math.min(pos.top, window.innerHeight - tooltipRect.height - EDGE_PAD)
    ),
    left: Math.max(
      EDGE_PAD,
      Math.min(pos.left, window.innerWidth - tooltipRect.width - EDGE_PAD)
    ),
  };
}

function oppositePlacement(p: Placement): Placement {
  switch (p) {
    case "top":
      return "bottom";
    case "bottom":
      return "top";
    case "left":
      return "right";
    case "right":
      return "left";
  }
}

function centeredFallback(tooltipRect: { width: number; height: number }): Position {
  return {
    top: Math.max(EDGE_PAD, window.innerHeight - tooltipRect.height - EDGE_PAD - 24),
    left: Math.max(EDGE_PAD, window.innerWidth / 2 - tooltipRect.width / 2),
  };
}

export function TourTooltip() {
  const { isActive, currentStep, steps, next, prev, skip, totalSteps } = useTour();
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<Position>({ top: 0, left: 0 });
  const [spotlightRect, setSpotlightRect] = useState<SpotlightRect | null>(null);
  const [visible, setVisible] = useState(false);

  const step = steps[currentStep];

  const recompute = useCallback(() => {
    if (!step) return;
    const target = document.querySelector(`[data-tour="${step.target}"]`);
    const tooltip = tooltipRef.current;
    if (!target || !tooltip) return;

    const targetRect = target.getBoundingClientRect();
    const tooltipBox = {
      width: tooltip.offsetWidth || tooltip.getBoundingClientRect().width,
      height: tooltip.offsetHeight || tooltip.getBoundingClientRect().height,
    };

    const preferred: Placement = step.placement ?? "bottom";
    const candidates: Placement[] = [
      preferred,
      oppositePlacement(preferred),
      "bottom",
      "top",
      "right",
      "left",
    ];

    let chosen: Position | null = null;
    for (const placement of candidates) {
      const candidate = getTooltipPosition(targetRect, tooltipBox, placement);
      if (fitsInViewport(candidate, tooltipBox)) {
        chosen = candidate;
        break;
      }
    }

    const targetOnScreen =
      targetRect.bottom > 0 &&
      targetRect.top < window.innerHeight &&
      targetRect.right > 0 &&
      targetRect.left < window.innerWidth;

    let finalPos: Position;
    if (chosen) {
      finalPos = clampPosition(chosen, tooltipBox);
    } else if (targetOnScreen) {
      finalPos = clampPosition(
        getTooltipPosition(targetRect, tooltipBox, preferred),
        tooltipBox
      );
    } else {
      finalPos = centeredFallback(tooltipBox);
    }

    setPosition(finalPos);
    setSpotlightRect({
      top: targetRect.top - 4,
      left: targetRect.left - 4,
      width: targetRect.width + 8,
      height: targetRect.height + 8,
    });
    setVisible(true);
  }, [step]);

  useEffect(() => {
    if (!isActive || !step) {
      setVisible(false);
      setSpotlightRect(null);
      return;
    }

    const target = document.querySelector(`[data-tour="${step.target}"]`);
    if (!target) {
      setVisible(false);
      setSpotlightRect(null);
      return;
    }

    target.scrollIntoView({ behavior: "smooth", block: "center" });

    let raf = 0;
    const schedule = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(recompute);
    };

    schedule();
    const settle1 = setTimeout(schedule, 50);
    const settle2 = setTimeout(schedule, 200);
    const settle3 = setTimeout(schedule, 400);

    window.addEventListener("scroll", schedule, { passive: true, capture: true });
    window.addEventListener("resize", schedule);

    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(schedule);
      ro.observe(target);
      if (tooltipRef.current) ro.observe(tooltipRef.current);
    }

    return () => {
      clearTimeout(settle1);
      clearTimeout(settle2);
      clearTimeout(settle3);
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", schedule, { capture: true } as EventListenerOptions);
      window.removeEventListener("resize", schedule);
      ro?.disconnect();
    };
  }, [isActive, step, currentStep, recompute]);

  if (!isActive || !step) return null;

  return createPortal(
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-[60] bg-black/50" onClick={skip} />
      {spotlightRect && (
        <div
          className="pointer-events-none fixed z-[61] rounded-lg ring-2 ring-app-accent ring-offset-2 ring-offset-transparent"
          style={{
            top: spotlightRect.top,
            left: spotlightRect.left,
            width: spotlightRect.width,
            height: spotlightRect.height,
          }}
        />
      )}
      {/* Tooltip card */}
      <div
        ref={tooltipRef}
        className="fixed z-[62] w-80 rounded-xl border border-app-border bg-app-surface p-4 shadow-lg"
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
