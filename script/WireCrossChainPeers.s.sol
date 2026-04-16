// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import {CrossChainIntentBridge} from "../src/coordination/CrossChainIntentBridge.sol";
import {PoolReserveRegistry} from "../src/coordination/PoolReserveRegistry.sol";
import {CCIPReserveMessenger} from "../src/coordination/CCIPReserveMessenger.sol";
import {OracleConfigQuorum} from "../src/coordination/OracleConfigQuorum.sol";

/// @notice Wire cross-chain peers on the LOCAL chain to recognize a REMOTE chain.
/// @dev Run once per direction — the orchestrator calls this twice (once per chain).
///
/// Usage:
///   LOCAL_CHAIN=sepolia REMOTE_CHAIN=fuji \
///     forge script script/WireCrossChainPeers.s.sol:WireCrossChainPeers \
///     --rpc-url sepolia --broadcast -vvv
///
/// Reads from config/chains.json for chain selectors and USDC addresses, and from
/// apps/web/src/config/{chain}-deployment.json for deployed contract addresses.
///
/// Calls on the LOCAL chain's contracts:
///   - CrossChainIntentBridge.addSupportedChain(remoteSelector, remoteUsdc, remoteBridge)
///   - PoolReserveRegistry.addRemoteChain(remoteSelector)
///   - CCIPReserveMessenger.addPeer(remoteSelector, remoteMessenger)
///   - OracleConfigQuorum.addPeer(remoteSelector, remoteQuorum) — if both sides have it
contract WireCrossChainPeers is Script {
    function run() external {
        string memory localChain = vm.envString("LOCAL_CHAIN");
        string memory remoteChain = vm.envString("REMOTE_CHAIN");

        string memory chainsJson = vm.readFile(string.concat(vm.projectRoot(), "/config/chains.json"));
        string memory remoteKey = string.concat(".", remoteChain);

        uint64 remoteSelector = uint64(vm.parseJsonUint(chainsJson, string.concat(remoteKey, ".ccipChainSelector")));
        require(remoteSelector > 0, "WirePeers: remote chain selector is zero");

        string memory localDeployJson = vm.readFile(
            string.concat(vm.projectRoot(), "/apps/web/src/config/", localChain, "-deployment.json")
        );
        string memory remoteDeployJson = vm.readFile(
            string.concat(vm.projectRoot(), "/apps/web/src/config/", remoteChain, "-deployment.json")
        );

        address localBridge = vm.parseJsonAddress(localDeployJson, ".crossChainIntentBridge");
        address localRegistry = vm.parseJsonAddress(localDeployJson, ".poolReserveRegistry");
        address localMessenger = vm.parseJsonAddress(localDeployJson, ".ccipReserveMessenger");

        address remoteBridge = vm.parseJsonAddress(remoteDeployJson, ".crossChainIntentBridge");
        address remoteMessenger = vm.parseJsonAddress(remoteDeployJson, ".ccipReserveMessenger");
        address remoteUsdc = vm.parseJsonAddress(remoteDeployJson, ".usdc");

        require(localBridge != address(0), "WirePeers: local bridge not deployed");
        require(remoteBridge != address(0), "WirePeers: remote bridge not deployed");

        vm.startBroadcast();

        // 1. Bridge: register remote chain's bridge as supported peer
        CrossChainIntentBridge(payable(localBridge)).addSupportedChain(
            remoteSelector, remoteUsdc, remoteBridge
        );
        console.log("Bridge: added supported chain", remoteSelector);

        // 2. Registry: register remote chain for routing weights
        PoolReserveRegistry(localRegistry).addRemoteChain(remoteSelector);
        console.log("Registry: added remote chain", remoteSelector);

        // 3. Messenger: register remote messenger as CCIP peer
        CCIPReserveMessenger(payable(localMessenger)).addPeer(remoteSelector, remoteMessenger);
        console.log("Messenger: added peer", remoteSelector);

        // 4. Quorum: register remote quorum peer (if both deployed)
        bool localHasQuorum = vm.keyExistsJson(localDeployJson, ".oracleConfigQuorum");
        bool remoteHasQuorum = vm.keyExistsJson(remoteDeployJson, ".oracleConfigQuorum");

        if (localHasQuorum && remoteHasQuorum) {
            address localQuorum = vm.parseJsonAddress(localDeployJson, ".oracleConfigQuorum");
            address remoteQuorum = vm.parseJsonAddress(remoteDeployJson, ".oracleConfigQuorum");
            if (localQuorum != address(0) && remoteQuorum != address(0)) {
                OracleConfigQuorum(payable(localQuorum)).addPeer(remoteSelector, remoteQuorum);
                console.log("Quorum: added peer", remoteSelector);
            }
        }

        vm.stopBroadcast();

        console.log("=== Peer Wiring Complete ===");
        console.log("Local chain:", localChain);
        console.log("Remote chain:", remoteChain);
        console.log("Remote selector:", remoteSelector);
    }
}
