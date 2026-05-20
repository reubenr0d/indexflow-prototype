import type { DeploymentTarget } from "@/lib/deployment";

/**
 * Envio HyperIndex is the single indexer for all deployment targets.
 * Configure via `NEXT_PUBLIC_ENVIO_URL` (Hasura GraphQL endpoint).
 */
export const ENVIO_UNIFIED_URL = process.env.NEXT_PUBLIC_ENVIO_URL?.trim() ?? "";

/**
 * Returns the unified Envio GraphQL URL for any target, or `null` if unset.
 * Kept under the historical `getConfiguredSubgraphUrlForTarget` name to
 * minimize blast radius across hooks and providers; the target argument is
 * accepted but ignored because Envio serves every chain from one endpoint.
 */
export function getConfiguredSubgraphUrlForTarget(_target: DeploymentTarget): string | null {
  return ENVIO_UNIFIED_URL.length > 0 ? ENVIO_UNIFIED_URL : null;
}
