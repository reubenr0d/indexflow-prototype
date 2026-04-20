/** Minimal ABI fragments for keeper on-chain interactions. */

export const StateRelayABI = [
  "function updateState(uint64[] chains, uint256[] weights, uint256[] amounts, address[] vaults, int256[] pnlAdjustments, uint48 ts)",
  "function lastUpdateTime() view returns (uint48)",
] as const;

export const BasketFactoryABI = [
  "function getAllBaskets() view returns (address[])",
] as const;

export const ERC20ABI = [
  "function balanceOf(address account) view returns (uint256)",
] as const;

export const VaultAccountingABI = [
  "function getVaultPnL(address vault) view returns (int256 unrealised, int256 realised)",
] as const;

export const BasketVaultABI = [
  "function perpAllocated() view returns (uint256)",
] as const;
