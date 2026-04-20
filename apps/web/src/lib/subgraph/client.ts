import { GraphQLClient } from "graphql-request";
import { getSubgraphUrlForTarget, type DeploymentTarget } from "@/lib/deployment";

export function getSubgraphClient(url?: string | null): GraphQLClient | null {
  if (!url) return null;
  return new GraphQLClient(url, {
    fetch,
  });
}

const clientCache = new Map<string, GraphQLClient>();

/**
 * Returns a cached GraphQLClient for the given deployment target's subgraph URL,
 * or null if no subgraph is configured for that target.
 */
export function getSubgraphClientForTarget(target: DeploymentTarget): GraphQLClient | null {
  const url = getSubgraphUrlForTarget(target);
  if (!url) return null;
  let client = clientCache.get(url);
  if (!client) {
    client = new GraphQLClient(url, { fetch });
    clientCache.set(url, client);
  }
  return client;
}
