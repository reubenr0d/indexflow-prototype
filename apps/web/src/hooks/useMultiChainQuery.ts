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
  runInSingleMode?: boolean;
};

export type MultiChainQueryResult<TData, TResult> = {
  data: TResult | undefined;
  isLoading: boolean;
  isError: boolean;
  perChain: Map<DeploymentTarget, TData>;
  failedTargets: DeploymentTarget[];
};

/**
 * Fan-out a query across all configured deployment targets in parallel,
 * then merge the results using the provided `aggregate` function.
 *
 * By default, only runs when viewMode === "all". Set `runInSingleMode`
 * to fan out even when viewMode === "single".
 */
export function useMultiChainQuery<TData, TResult>(
  opts: MultiChainQueryOpts<TData, TResult>,
): MultiChainQueryResult<TData, TResult> {
  const { viewMode, configuredTargets } = useDeploymentTarget();
  const isAll = viewMode === "all";
  const shouldRun = opts.runInSingleMode ? true : isAll;
  const enabled = (opts.enabled ?? true) && shouldRun;

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
    if (!shouldRun) return map;
    queries.forEach((q, i) => {
      if (q.data != null) {
        map.set(configuredTargets[i], q.data as TData);
      }
    });
    return map;
  }, [configuredTargets, queries, shouldRun]);

  const failedTargets = useMemo(() => {
    if (!shouldRun) return [];
    return configuredTargets.filter((_, i) => queries[i]?.isError);
  }, [configuredTargets, queries, shouldRun]);

  const isLoading = queries.some((q) => q.isLoading);
  const isError = failedTargets.length > 0;

  const data = useMemo(() => {
    if (!shouldRun || isLoading || perChain.size === 0) return undefined;
    return opts.aggregate(perChain);
  }, [isLoading, opts, perChain, shouldRun]);

  return { data, isLoading, isError, perChain, failedTargets };
}
