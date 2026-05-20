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
 * Returns a cached GraphQLClient for the given deployment target's indexer URL,
 * or null if no indexer is configured (Envio serves every chain from one URL).
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
