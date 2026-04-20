"use client";

import { type DeploymentTarget } from "@/lib/deployment";
import { getSubgraphClientForTarget } from "@/lib/subgraph/client";
import { useMultiChainQuery, type MultiChainQueryResult } from "./useMultiChainQuery";

export type MultiChainSubgraphQueryOpts<TRaw, TResult> = {
  queryKeyPrefix: string[];
  document: string;
  variables?: Record<string, unknown>;
  transform?: (raw: TRaw, target: DeploymentTarget) => TRaw;
  aggregate: (results: Map<DeploymentTarget, TRaw>) => TResult;
  enabled?: boolean;
  staleTime?: number;
  runInSingleMode?: boolean;
};

/**
 * Fan-out a GraphQL query across all configured chain subgraphs in parallel,
 * then merge/aggregate the results.
 */
export function useMultiChainSubgraphQuery<TRaw, TResult>(
  opts: MultiChainSubgraphQueryOpts<TRaw, TResult>,
): MultiChainQueryResult<TRaw, TResult> {
  return useMultiChainQuery<TRaw, TResult>({
    queryKeyPrefix: ["subgraph", ...opts.queryKeyPrefix],
    queryFn: async (target: DeploymentTarget) => {
      const client = getSubgraphClientForTarget(target);
      if (!client) return null;
      const raw = await client.request<TRaw>(opts.document, opts.variables);
      return opts.transform ? opts.transform(raw, target) : raw;
    },
    aggregate: opts.aggregate,
    enabled: opts.enabled,
    staleTime: opts.staleTime,
    runInSingleMode: opts.runInSingleMode,
  });
}
