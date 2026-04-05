const BPS_DENOM = 10_000n;

export type WeightedAsset = {
  assetId: `0x${string}`;
  weightBps: bigint;
};

export type BlendedComposition = {
  spotCapital: bigint;
  perpExposure: bigint;
  blendBase: bigint;
  perpBlendBps: bigint;
  assetBlend: Array<{ assetId: `0x${string}`; blendBps: bigint; baseWeightBps: bigint }>;
};

export function computeBlendedComposition(
  usdcBalance: bigint,
  perpAllocated: bigint,
  openInterest: bigint,
  assets: WeightedAsset[]
): BlendedComposition {
  const bookValue = usdcBalance + perpAllocated;
  const perpExposure = openInterest > 0n ? openInterest : 0n;
  const spotCapital = bookValue > perpExposure ? bookValue - perpExposure : 0n;
  const blendBase = spotCapital + perpExposure;

  const perpBlendBps = blendBase > 0n ? (perpExposure * BPS_DENOM) / blendBase : 0n;

  const assetBlend = assets.map((asset) => ({
    assetId: asset.assetId,
    baseWeightBps: asset.weightBps,
    blendBps: blendBase > 0n ? (asset.weightBps * spotCapital) / blendBase : 0n,
  }));

  return {
    spotCapital,
    perpExposure,
    blendBase,
    perpBlendBps,
    assetBlend,
  };
}
