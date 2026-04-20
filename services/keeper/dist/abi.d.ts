/** Minimal ABI fragments for keeper on-chain interactions. */
export declare const StateRelayABI: readonly ["function updateState(uint64[] chains, uint256[] weights, uint256[] amounts, address[] vaults, int256[] pnlAdjustments, uint48 ts)", "function lastUpdateTime() view returns (uint48)"];
export declare const BasketFactoryABI: readonly ["function getAllBaskets() view returns (address[])"];
export declare const ERC20ABI: readonly ["function balanceOf(address account) view returns (uint256)"];
export declare const VaultAccountingABI: readonly ["function getVaultPnL(address vault) view returns (int256 unrealised, int256 realised)"];
export declare const BasketVaultABI: readonly ["function perpAllocated() view returns (uint256)"];
//# sourceMappingURL=abi.d.ts.map