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
      const res = await fetch(`/agent-metadata/${vault.toLowerCase()}.json`);
      if (!res.ok) return null;
      return res.json();
    },
    staleTime: 60_000,
    retry: false,
  });
}
