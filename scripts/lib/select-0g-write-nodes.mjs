/**
 * Shared indexer node selection for 0G KV/Log *writes* (Batcher, upload).
 *
 * Matches `apps/mcps/0g-storage/index.js` `getStorageWriteContext()` and the
 * `ZG_STORAGE_EXPECTED_REPLICA` env: request N **full sharding sets**
 * (`Indexer.selectNodes(N)`), then fall back to `1` if the network cannot
 * satisfy replication.
 *
 * This is **not** the same as manually picking one fresh node per shard in
 * `probe-0g-kv-tail.mjs` / `probe-0g-kv-batch.mjs` (those are diagnostic
 * paths for tail-sync and burst tests).
 *
 * @param {import("@0gfoundation/0g-ts-sdk").Indexer} indexer
 * @param {number} [expectedReplica=2]  Same as `ZG_STORAGE_EXPECTED_REPLICA` (min 1)
 * @returns {Promise<{
 *   nodes: import("@0gfoundation/0g-ts-sdk").StorageNode[];
 *   used: number;
 *   requested: number;
 *   usedFallback: boolean;
 * }>}
 */
export async function selectStorageWriteNodes(indexer, expectedReplica = 2) {
  const requested = Math.max(1, parseInt(String(expectedReplica), 10) || 1);
  const order =
    requested === 1
      ? [1]
      : [requested, 1].filter((n, i, a) => a.indexOf(n) === i);
  let lastErr = null;
  for (const n of order) {
    const [nodes, err] = await indexer.selectNodes(n);
    if (!err && nodes?.length) {
      return {
        nodes,
        used: n,
        requested,
        usedFallback: n < requested,
      };
    }
    lastErr = err;
  }
  throw new Error(`indexer.selectNodes failed: ${lastErr?.message || lastErr}`);
}
