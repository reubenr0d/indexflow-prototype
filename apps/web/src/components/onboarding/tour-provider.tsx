"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

export interface TourStep {
  target: string;
  title: string;
  content: string;
  placement?: "top" | "bottom" | "left" | "right";
}

interface TourContextValue {
  isActive: boolean;
  currentStep: number;
  steps: TourStep[];
  start: (steps: TourStep[]) => void;
  next: () => void;
  prev: () => void;
  skip: () => void;
  totalSteps: number;
}

const DISMISSED_KEY = "indexflow:tour-dismissed";

const TourContext = createContext<TourContextValue | null>(null);

export function TourProvider({ children }: { children: React.ReactNode }) {
  const [steps, setSteps] = useState<TourStep[]>([]);
  const [currentStep, setCurrentStep] = useState(0);
  const [isActive, setIsActive] = useState(false);

  const start = useCallback((newSteps: TourStep[]) => {
    if (typeof window !== "undefined" && localStorage.getItem(DISMISSED_KEY)) return;
    setSteps(newSteps);
    setCurrentStep(0);
    setIsActive(true);
  }, []);

  const skip = useCallback(() => {
    setIsActive(false);
    setSteps([]);
    setCurrentStep(0);
    if (typeof window !== "undefined") {
      localStorage.setItem(DISMISSED_KEY, "1");
    }
  }, []);

  const next = useCallback(() => {
    setCurrentStep((prev) => {
      if (prev >= steps.length - 1) {
        skip();
        return 0;
      }
      return prev + 1;
    });
  }, [steps.length, skip]);

  const prev = useCallback(() => {
    setCurrentStep((p) => Math.max(0, p - 1));
  }, []);

  const value = useMemo<TourContextValue>(
    () => ({
      isActive,
      currentStep,
      steps,
      start,
      next,
      prev,
      skip,
      totalSteps: steps.length,
    }),
    [isActive, currentStep, steps, start, next, prev, skip]
  );

  return <TourContext.Provider value={value}>{children}</TourContext.Provider>;
}

export function useTour() {
  const ctx = useContext(TourContext);
  if (!ctx) throw new Error("useTour must be used within TourProvider");
  return ctx;
}

export function useIsTourTarget(targetId: string): boolean {
  const ctx = useContext(TourContext);
  if (!ctx || !ctx.isActive) return false;
  return ctx.steps[ctx.currentStep]?.target === targetId;
}

export function resetTourDismissal() {
  if (typeof window !== "undefined") {
    localStorage.removeItem(DISMISSED_KEY);
  }
}
