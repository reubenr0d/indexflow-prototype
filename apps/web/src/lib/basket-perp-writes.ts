import { BasketVaultABI } from "@/abi/BasketVault";
import { VaultAccountingABI } from "@/abi/VaultAccounting";
import { type Address, type Hex, toFunctionSelector } from "viem";

const OPEN_POSITION_SELECTOR = toFunctionSelector(
  "openPosition(bytes32,bool,uint256,uint256)"
);
const CLOSE_POSITION_SELECTOR = toFunctionSelector(
  "closePosition(bytes32,bool,uint256,uint256)"
);

/** True when deployed bytecode includes BasketVault perp wrapper functions. */
export function basketBytecodeHasPerpWrappers(bytecode: Hex | undefined): boolean {
  if (!bytecode || bytecode === "0x") return false;
  const body = bytecode.slice(2).toLowerCase();
  return (
    body.includes(OPEN_POSITION_SELECTOR.slice(2).toLowerCase()) &&
    body.includes(CLOSE_POSITION_SELECTOR.slice(2).toLowerCase())
  );
}

export type OpenPositionWriteConfig = {
  address: Address;
  abi: typeof BasketVaultABI | typeof VaultAccountingABI;
  functionName: "openPosition";
  args: [Hex, boolean, bigint, bigint] | [Address, Hex, boolean, bigint, bigint];
};

export type ClosePositionWriteConfig = {
  address: Address;
  abi: typeof BasketVaultABI | typeof VaultAccountingABI;
  functionName: "closePosition";
  args: [Hex, boolean, bigint, bigint] | [Address, Hex, boolean, bigint, bigint];
};

export function buildOpenPositionWrite(
  vault: Address,
  vaultAccounting: Address,
  useVaultWrapper: boolean,
  asset: Hex,
  isLong: boolean,
  size: bigint,
  collateral: bigint
): OpenPositionWriteConfig {
  if (useVaultWrapper) {
    return {
      address: vault,
      abi: BasketVaultABI,
      functionName: "openPosition",
      args: [asset, isLong, size, collateral],
    };
  }
  return {
    address: vaultAccounting,
    abi: VaultAccountingABI,
    functionName: "openPosition",
    args: [vault, asset, isLong, size, collateral],
  };
}

export function buildClosePositionWrite(
  vault: Address,
  vaultAccounting: Address,
  useVaultWrapper: boolean,
  asset: Hex,
  isLong: boolean,
  sizeDelta: bigint,
  collateralDelta: bigint
): ClosePositionWriteConfig {
  if (useVaultWrapper) {
    return {
      address: vault,
      abi: BasketVaultABI,
      functionName: "closePosition",
      args: [asset, isLong, sizeDelta, collateralDelta],
    };
  }
  return {
    address: vaultAccounting,
    abi: VaultAccountingABI,
    functionName: "closePosition",
    args: [vault, asset, isLong, sizeDelta, collateralDelta],
  };
}
