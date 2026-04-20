import type { DeploymentTarget } from "@/lib/deployment";
import subgraphsJson from "./subgraphs.json";

type SubgraphConfig = Record<string, string>;

export const SUBGRAPH_URL_BY_TARGET: SubgraphConfig = subgraphsJson as SubgraphConfig;

export function getConfiguredSubgraphUrlForTarget(target: DeploymentTarget): string | null {
  const raw = SUBGRAPH_URL_BY_TARGET[target];
  if (typeof raw !== "string") return null;
  const normalized = raw.trim();
  return normalized.length > 0 ? normalized : null;
}
