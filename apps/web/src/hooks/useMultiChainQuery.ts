"use client";

import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import { type DeploymentTarget } from "@/lib/deployment";
import { useDeploymentTarget } from "@/providers/DeploymentProvider";

export type MultiChainQueryOpts<TData, TResult> = {
  queryKeyPrefix: string[];
  queryFn: (target: DeploymentTarget) => Promise<TData | null>;
  aggregate: (results: Map<DeploymentTarget, TData>) => TResult;
  enabled?: boolean;
  staleTime?: number;
};

export type MultiChainQueryResult<TData, TResult> = {
  data: TResult | undefined;
  isLoading: boolean;
  isError: boolean;
  perChain: Map<DeploymentTarget, TData>;
};

/**
 * Fan-out a query across all configured deployment targets in parallel,
 * then merge the results using the provided `aggregate` function.
 *
 * Only runs when viewMode === "all". When viewMode === "single", returns
 * empty results so callers can fall back to single-chain hooks.
 */
export function useMultiChainQuery<TData, TResult>(
  opts: MultiChainQueryOpts<TData, TResult>,
): MultiChainQueryResult<TData, TResult> {
  const { viewMode, configuredTargets } = useDeploymentTarget();
  const isAll = viewMode === "all";
  const enabled = (opts.enabled ?? true) && isAll;

  const queries = useQueries({
    queries: configuredTargets.map((target) => ({
      queryKey: [...opts.queryKeyPrefix, target],
      queryFn: () => opts.queryFn(target),
      enabled,
      staleTime: opts.staleTime ?? 15_000,
      retry: 1,
    })),
  });

  const perChain = useMemo(() => {
    const map = new Map<DeploymentTarget, TData>();
    if (!isAll) return map;
    queries.forEach((q, i) => {
      if (q.data != null) {
        map.set(configuredTargets[i], q.data as TData);
      }
    });
    return map;
  }, [configuredTargets, isAll, queries]);

  const isLoading = queries.some((q) => q.isLoading);
  const isError = queries.some((q) => q.isError);

  const data = useMemo(() => {
    if (!isAll || isLoading || perChain.size === 0) return undefined;
    return opts.aggregate(perChain);
  }, [isAll, isLoading, opts, perChain]);

  return { data, isLoading, isError, perChain };
}
