export function toAssetPricePath(assetId: `0x${string}`): string {
  return `/prices/${encodeURIComponent(assetId)}`;
}
