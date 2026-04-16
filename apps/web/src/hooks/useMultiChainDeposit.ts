"use client";

import { useState, useCallback } from "react";
import { type ChainWeight } from "./useRoutingWeights";

export interface DepositSplit {
  chainName: string;
  chainSelector: bigint;
  amount: bigint;
  percentage: number;
}

export interface MultiChainDepositState {
  splits: DepositSplit[];
  currentStep: number;
  totalSteps: number;
  isDepositing: boolean;
  completedChains: string[];
  error: string | null;
}

/**
 * Manages the sequential multi-chain deposit flow.
 * Computes splits from routing weights, then walks the user through
 * depositing on each chain in sequence: switch chain → approve → deposit → next.
 */
export function useMultiChainDeposit() {
  const [state, setState] = useState<MultiChainDepositState>({
    splits: [],
    currentStep: 0,
    totalSteps: 0,
    isDepositing: false,
    completedChains: [],
    error: null,
  });

  const computeSplits = useCallback(
    (totalAmount: bigint, weights: ChainWeight[]): DepositSplit[] => {
      const activeWeights = weights.filter((w) => w.weightBps > 0);
      const totalWeight = activeWeights.reduce((s, w) => s + w.weightBps, 0);
      if (totalWeight === 0 || activeWeights.length === 0) return [];

      let remaining = totalAmount;
      const splits: DepositSplit[] = activeWeights.map((w, i) => {
        const isLast = i === activeWeights.length - 1;
        const amount = isLast
          ? remaining
          : (totalAmount * BigInt(w.weightBps)) / BigInt(totalWeight);
        if (!isLast) remaining -= amount;

        return {
          chainName: w.chainName,
          chainSelector: w.chainSelector,
          amount,
          percentage: (w.weightBps / totalWeight) * 100,
        };
      });

      return splits.filter((s) => s.amount > 0n);
    },
    [],
  );

  const startDeposit = useCallback((splits: DepositSplit[]) => {
    setState({
      splits,
      currentStep: 0,
      totalSteps: splits.length,
      isDepositing: true,
      completedChains: [],
      error: null,
    });
  }, []);

  const completeStep = useCallback((chainName: string) => {
    setState((prev) => ({
      ...prev,
      currentStep: prev.currentStep + 1,
      completedChains: [...prev.completedChains, chainName],
      isDepositing: prev.currentStep + 1 < prev.totalSteps,
    }));
  }, []);

  const setError = useCallback((error: string) => {
    setState((prev) => ({ ...prev, error, isDepositing: false }));
  }, []);

  const reset = useCallback(() => {
    setState({
      splits: [],
      currentStep: 0,
      totalSteps: 0,
      isDepositing: false,
      completedChains: [],
      error: null,
    });
  }, []);

  return {
    state,
    computeSplits,
    startDeposit,
    completeStep,
    setError,
    reset,
  };
}
