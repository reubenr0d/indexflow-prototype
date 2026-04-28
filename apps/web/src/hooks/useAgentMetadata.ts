import { useQuery } from "@tanstack/react-query";
import type { Address } from "viem";

export type AgentAction = {
  tool: string;
  justification: string;
  timestamp: string;
  txHash?: string | null;
};

export type AgentMetadata = {
  isAiManaged: boolean;
  agentName: string;
  agentDescription: string;
  thesis: string | null;
  lastRunAt: string;
  recentActions: AgentAction[];
};

export function useAgentMetadata(vault: Address) {
  return useQuery<AgentMetadata | null>({
    queryKey: ["agent-metadata", vault],
    queryFn: async () => {
      // Server-side route reads from 0G KV (agentio shared stream) via the
      // KvClient so this stays a single, cached round-trip per vault.
      const res = await fetch(`/api/agent-metadata/${vault.toLowerCase()}`);
      if (!res.ok) return null;
      const text = await res.text();
      if (!text || text === "null") return null;
      try {
        return JSON.parse(text) as AgentMetadata;
      } catch {
        return null;
      }
    },
    staleTime: 60_000,
    retry: false,
  });
}
