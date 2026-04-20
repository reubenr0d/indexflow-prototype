// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import {StateRelay} from "../src/coordination/StateRelay.sol";

/// @notice Deploys a new StateRelay and outputs the address.
/// @dev Usage: CHAIN=sepolia forge script script/UpgradeStateRelay.s.sol:UpgradeStateRelay --rpc-url sepolia --broadcast -vvv
contract UpgradeStateRelay is Script {
    function run() external {
        string memory chainName = vm.envString("CHAIN");

        string memory chainsJson = vm.readFile(string.concat(vm.projectRoot(), "/config/chains.json"));
        string memory chainKey = string.concat(".", chainName);

        uint64 ccipChainSelector = uint64(vm.parseJsonUint(chainsJson, string.concat(chainKey, ".ccipChainSelector")));

        uint256 deployerPrivateKey;
        if (keccak256(bytes(chainName)) == keccak256("local")) {
            deployerPrivateKey = uint256(0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80);
        } else {
            deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        }
        address deployer = vm.addr(deployerPrivateKey);

        uint48 maxStaleness = 300;
        address keeper = deployer;

        vm.startBroadcast(deployerPrivateKey);

        StateRelay relay = new StateRelay(ccipChainSelector, maxStaleness, keeper, deployer);

        vm.stopBroadcast();

        console2.log("=== StateRelay Upgraded ===");
        console2.log("Chain:", chainName);
        console2.log("New StateRelay:", address(relay));
        console2.log("");
        console2.log("Update deployment config with new address.");
    }
}
