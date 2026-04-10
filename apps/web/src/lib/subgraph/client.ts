import { GraphQLClient } from "graphql-request";

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
