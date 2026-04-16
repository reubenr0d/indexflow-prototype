import { GraphQLClient } from "graphql-request";
import { getSubgraphUrlForTarget, type DeploymentTarget } from "@/lib/deployment";

export function getSubgraphUrl(): string | null {
  const value = process.env.NEXT_PUBLIC_SUBGRAPH_URL;
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function getSubgraphClient(url?: string | null): GraphQLClient | null {
  const resolved = url ?? getSubgraphUrl();
  if (!resolved) return null;
  return new GraphQLClient(resolved, {
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
