/** @see `cast sig "openPosition(bytes32,bool,uint256,uint256)"` */
const OPEN_POSITION_SELECTOR = "0x2f998c2b";
/** @see `cast sig "closePosition(bytes32,bool,uint256,uint256)"` */
const CLOSE_POSITION_SELECTOR = "0x8176f4d4";

export function basketBytecodeHasPerpWrappers(bytecode) {
  if (!bytecode || bytecode === "0x") return false;
  const body = bytecode.replace(/^0x/i, "").toLowerCase();
  return (
    body.includes(OPEN_POSITION_SELECTOR.slice(2).toLowerCase()) &&
    body.includes(CLOSE_POSITION_SELECTOR.slice(2).toLowerCase())
  );
}

/**
 * @param {boolean} useVaultWrapper
 * @returns {{ target: string, sig: string, args: string[] }}
 */
export function buildOpenPositionCast(vault, vaultAccounting, useVaultWrapper, assetId, isLong, size, collateral) {
  if (useVaultWrapper) {
    return {
      target: vault,
      sig: "openPosition(bytes32,bool,uint256,uint256)",
      args: [assetId, String(isLong), size, collateral],
    };
  }
  return {
    target: vaultAccounting,
    sig: "openPosition(address,bytes32,bool,uint256,uint256)",
    args: [vault, assetId, String(isLong), size, collateral],
  };
}

/**
 * @param {boolean} useVaultWrapper
 * @returns {{ target: string, sig: string, args: string[] }}
 */
export function buildClosePositionCast(
  vault,
  vaultAccounting,
  useVaultWrapper,
  assetId,
  isLong,
  sizeDelta,
  collateralDelta,
) {
  if (useVaultWrapper) {
    return {
      target: vault,
      sig: "closePosition(bytes32,bool,uint256,uint256)",
      args: [assetId, String(isLong), sizeDelta, collateralDelta],
    };
  }
  return {
    target: vaultAccounting,
    sig: "closePosition(address,bytes32,bool,uint256,uint256)",
    args: [vault, assetId, String(isLong), sizeDelta, collateralDelta],
  };
}
