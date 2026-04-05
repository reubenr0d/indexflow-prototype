const BPS_DENOM = 10_000n;

export type PerpExposureAsset = {
  assetId: `0x${string}`;
  longSize: bigint;
  shortSize: bigint;
  netSize: bigint;
};

export type BlendedComposition = {
  spotCapital: bigint;
  perpExposure: bigint;
  blendBase: bigint;
  perpBlendBps: bigint;
  assetBlend: Array<{
    assetId: `0x${string}`;
    longSize: bigint;
    shortSize: bigint;
    netSize: bigint;
    blendBps: bigint;
  }>;
};

export function computeBlendedComposition(
  usdcBalance: bigint,
  perpAllocated: bigint,
  openInterest: bigint,
  exposures: PerpExposureAsset[]
): BlendedComposition {
  const bookValue = usdcBalance + perpAllocated;
  const perpExposure = openInterest > 0n ? openInterest : 0n;
  const spotCapital = bookValue > perpExposure ? bookValue - perpExposure : 0n;
  const blendBase = spotCapital + perpExposure;
  const perpBlendBps = blendBase > 0n ? (perpExposure * BPS_DENOM) / blendBase : 0n;

  const totalAbsNet = exposures.reduce((sum, asset) => {
    const absNet = asset.netSize >= 0n ? asset.netSize : -asset.netSize;
    return sum + absNet;
  }, 0n);

  const assetBlend = exposures.map((asset) => {
    const absNet = asset.netSize >= 0n ? asset.netSize : -asset.netSize;
    const normalizedPerpSlice = totalAbsNet > 0n ? (absNet * perpExposure) / totalAbsNet : 0n;
    return {
      assetId: asset.assetId,
      longSize: asset.longSize,
      shortSize: asset.shortSize,
      netSize: asset.netSize,
      blendBps: blendBase > 0n ? (normalizedPerpSlice * BPS_DENOM) / blendBase : 0n,
    };
  });

  return {
    spotCapital,
    perpExposure,
    blendBase,
    perpBlendBps,
    assetBlend,
  };
}
