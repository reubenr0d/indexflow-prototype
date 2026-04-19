// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import {BasketFactory} from "../src/vault/BasketFactory.sol";

interface IBasketVaultWire {
    function setStateRelay(address _stateRelay) external;
    function setMinDepositWeightBps(uint256 bps) external;
    function stateRelay() external view returns (address);
}

interface IRedemptionReceiverWire {
    function setTrustedSender(uint64 chainSelector, address sender) external;
}

/// @notice Post-deployment wiring script. Calls setStateRelay() on all vaults
/// and optionally wires RedemptionReceiver trusted senders.
///
/// @dev Usage:
///   CHAIN=sepolia forge script script/WireStateRelay.s.sol:WireStateRelay --rpc-url sepolia --broadcast -vvv
///
///   For spoke chains with RedemptionReceiver, also set:
///   HUB_CHAIN_SELECTOR=16015286601757825753 HUB_SENDER=0x... forge script ...
///
/// Required env:
///   CHAIN - chain name matching a key in config/chains.json
///
/// Optional env:
///   MIN_WEIGHT_BPS        - minimum deposit weight in basis points (default 0 = accept all)
///   HUB_CHAIN_SELECTOR    - CCIP chain selector of the hub (for spoke RedemptionReceiver)
///   HUB_SENDER            - trusted sender address on the hub (for spoke RedemptionReceiver)
contract WireStateRelay is Script {
    function run() external {
        string memory chainName = vm.envString("CHAIN");

        string memory deployJsonPath =
            string.concat(vm.projectRoot(), "/apps/web/src/config/", chainName, "-deployment.json");
        string memory deployJson = vm.readFile(deployJsonPath);

        address basketFactory = vm.parseJsonAddress(deployJson, ".basketFactory");
        address stateRelay = vm.parseJsonAddress(deployJson, ".stateRelay");

        require(stateRelay != address(0), "WireStateRelay: stateRelay not found in deployment JSON");

        uint256 minWeightBps = vm.envOr("MIN_WEIGHT_BPS", uint256(0));

        uint256 deployerPrivateKey;
        if (keccak256(bytes(chainName)) == keccak256("local")) {
            deployerPrivateKey = uint256(0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80);
            if (vm.envExists("PRIVATE_KEY")) {
                deployerPrivateKey = vm.envUint("PRIVATE_KEY");
            }
        } else {
            deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        }

        vm.startBroadcast(deployerPrivateKey);

        // Wire StateRelay to all vaults
        address[] memory vaults = BasketFactory(basketFactory).getAllBaskets();
        console2.log("Found", vaults.length, "vaults to wire");

        for (uint256 i = 0; i < vaults.length; i++) {
            IBasketVaultWire vault = IBasketVaultWire(vaults[i]);
            
            // Check if already wired
            if (vault.stateRelay() == stateRelay) {
                console2.log("  Vault", vaults[i], "already wired");
                continue;
            }

            vault.setStateRelay(stateRelay);
            console2.log("  Wired vault", vaults[i]);

            if (minWeightBps > 0) {
                vault.setMinDepositWeightBps(minWeightBps);
                console2.log("    Set minDepositWeightBps:", minWeightBps);
            }
        }

        // Wire RedemptionReceiver trusted sender (spoke chains only)
        if (vm.envExists("HUB_CHAIN_SELECTOR") && vm.envExists("HUB_SENDER")) {
            address redemptionReceiver;
            try vm.parseJsonAddress(deployJson, ".redemptionReceiver") returns (address addr) {
                redemptionReceiver = addr;
            } catch {
                console2.log("No redemptionReceiver in deployment JSON, skipping trusted sender wiring");
            }

            if (redemptionReceiver != address(0)) {
                uint64 hubChainSelector = uint64(vm.envUint("HUB_CHAIN_SELECTOR"));
                address hubSender = vm.envAddress("HUB_SENDER");

                IRedemptionReceiverWire(redemptionReceiver).setTrustedSender(hubChainSelector, hubSender);
                console2.log("Wired RedemptionReceiver trusted sender:");
                console2.log("  hubChainSelector:", hubChainSelector);
                console2.log("  hubSender:", hubSender);
            }
        }

        vm.stopBroadcast();

        console2.log("=== Wiring Complete ===");
        console2.log("Chain:", chainName);
        console2.log("StateRelay:", stateRelay);
        console2.log("Vaults wired:", vaults.length);
    }
}
