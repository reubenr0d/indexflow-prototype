"use client";

import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";

function isRefreshableQueryKey(queryKey: readonly unknown[]): boolean {
  const head = queryKey[0];
  return head === "subgraph" || head === "readContract" || head === "readContracts";
}

export function usePostTxRefresh() {
  const queryClient = useQueryClient();

  return useCallback(async () => {
    const predicate = (query: { queryKey: readonly unknown[] }) =>
      Array.isArray(query.queryKey) && isRefreshableQueryKey(query.queryKey);

    await queryClient.invalidateQueries({ predicate });
    await queryClient.refetchQueries({ predicate, type: "active" });
  }, [queryClient]);
}
