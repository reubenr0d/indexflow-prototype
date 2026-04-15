// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import {PoolReserveRegistry} from "../src/coordination/PoolReserveRegistry.sol";
import {CCIPReserveMessenger} from "../src/coordination/CCIPReserveMessenger.sol";
import {IntentRouter} from "../src/coordination/IntentRouter.sol";
import {CrossChainIntentBridge} from "../src/coordination/CrossChainIntentBridge.sol";
import {OracleConfigBroadcaster} from "../src/coordination/OracleConfigBroadcaster.sol";
import {OracleConfigReceiver} from "../src/coordination/OracleConfigReceiver.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

/// @notice Deploy the cross-chain coordination layer and wire it to the existing stack.
/// @dev Run with: forge script script/DeployCoordination.s.sol --rpc-url $RPC --broadcast
///
/// Required env vars:
///   GMX_VAULT          - existing GMX vault address
///   USDC               - USDC token address
///   CCIP_ROUTER        - Chainlink CCIP router address
///   BASKET_FACTORY     - existing BasketFactory address
///   ORACLE_ADAPTER     - existing OracleAdapter address
///   CHAIN_SELECTOR     - CCIP chain selector for this chain
///   FEE_TOKEN          - LINK token (or 0x0 for native) for CCIP fees
///   TREASURY           - protocol treasury for intent fees
///   IS_CANONICAL       - "true" if this is the canonical oracle config chain
///
/// Optional:
///   KEEPER             - approved keeper address for IntentRouter
///   REMOTE_SELECTOR    - remote chain selector to register
///   REMOTE_MESSENGER   - remote CCIPReserveMessenger address
///   CANONICAL_SELECTOR - (remote only) canonical chain selector
///   CANONICAL_BROADCASTER - (remote only) broadcaster address on canonical chain
contract DeployCoordination is Script {
    struct Deployed {
        address poolReserveRegistry;
        address ccipReserveMessenger;
        address intentRouterProxy;
        address intentRouterImpl;
        address crossChainIntentBridge;
        address oracleConfigBroadcaster;
        address oracleConfigReceiver;
    }

    function run() external returns (Deployed memory d) {
        address deployer = msg.sender;
        address gmxVault = vm.envAddress("GMX_VAULT");
        address usdc = vm.envAddress("USDC");
        address ccipRouter = vm.envAddress("CCIP_ROUTER");
        address basketFactory = vm.envAddress("BASKET_FACTORY");
        address oracleAdapter = vm.envAddress("ORACLE_ADAPTER");
        uint64 chainSelector = uint64(vm.envUint("CHAIN_SELECTOR"));
        address feeToken = vm.envAddress("FEE_TOKEN");
        address treasury = vm.envAddress("TREASURY");
        bool isCanonical = vm.envBool("IS_CANONICAL");

        vm.startBroadcast();

        // 1. PoolReserveRegistry
        PoolReserveRegistry registry = new PoolReserveRegistry(
            gmxVault,
            usdc,
            chainSelector,
            1800,   // twapWindow: 30 min
            300,    // minSnapshotInterval: 5 min
            3600,   // maxStaleness: 1 hour
            3600,   // maxObservationAge: 1 hour
            2000,   // maxDeltaPerUpdate: 20%
            deployer
        );
        d.poolReserveRegistry = address(registry);
        registry.setOracleAdapter(oracleAdapter);

        // 2. CCIPReserveMessenger
        CCIPReserveMessenger messenger = new CCIPReserveMessenger(
            ccipRouter,
            address(registry),
            500,    // broadcastThresholdBps: 5%
            600,    // minBroadcastInterval: 10 min
            3600,   // maxBroadcastInterval: 1 hour
            feeToken,
            deployer
        );
        d.ccipReserveMessenger = address(messenger);
        registry.setMessenger(address(messenger));

        // 3. IntentRouter (UUPS proxy)
        IntentRouter impl = new IntentRouter();
        d.intentRouterImpl = address(impl);

        bytes memory initData = abi.encodeCall(
            IntentRouter.initialize,
            (
                usdc,
                address(registry),
                basketFactory,
                chainSelector,
                7200,       // maxEscrowDuration: 2 hours
                100e6,      // minIntentAmount: 100 USDC
                10_000e6,   // minSplitAmount: 10k USDC
                treasury,
                deployer
            )
        );
        ERC1967Proxy proxy = new ERC1967Proxy(address(impl), initData);
        d.intentRouterProxy = address(proxy);

        // 4. CrossChainIntentBridge
        CrossChainIntentBridge bridge = new CrossChainIntentBridge(
            ccipRouter,
            d.intentRouterProxy,
            usdc,
            basketFactory,
            deployer
        );
        d.crossChainIntentBridge = address(bridge);
        IntentRouter(d.intentRouterProxy).setBridge(address(bridge));

        // 5. Keeper
        address keeper = vm.envOr("KEEPER", deployer);
        IntentRouter(d.intentRouterProxy).addApprovedKeeper(keeper);

        // 6. Oracle config sync
        if (isCanonical) {
            OracleConfigBroadcaster broadcaster = new OracleConfigBroadcaster(
                oracleAdapter, ccipRouter, feeToken, deployer
            );
            d.oracleConfigBroadcaster = address(broadcaster);
        } else {
            uint64 canonicalSelector = uint64(vm.envUint("CANONICAL_SELECTOR"));
            address canonicalBroadcaster = vm.envAddress("CANONICAL_BROADCASTER");
            OracleConfigReceiver receiver = new OracleConfigReceiver(
                ccipRouter, oracleAdapter, canonicalSelector, canonicalBroadcaster, deployer
            );
            d.oracleConfigReceiver = address(receiver);
        }

        // 7. Wire remote peers (optional)
        uint64 remoteSelector = uint64(vm.envOr("REMOTE_SELECTOR", uint256(0)));
        if (remoteSelector > 0) {
            address remoteMessenger = vm.envAddress("REMOTE_MESSENGER");
            registry.addRemoteChain(remoteSelector);
            messenger.addPeer(remoteSelector, remoteMessenger);
        }

        vm.stopBroadcast();

        _logDeployment(d);
    }

    function _logDeployment(Deployed memory d) internal pure {
        console.log("=== Coordination Layer Deployed ===");
        console.log("PoolReserveRegistry:", d.poolReserveRegistry);
        console.log("CCIPReserveMessenger:", d.ccipReserveMessenger);
        console.log("IntentRouter (proxy):", d.intentRouterProxy);
        console.log("IntentRouter (impl):", d.intentRouterImpl);
        console.log("CrossChainIntentBridge:", d.crossChainIntentBridge);
        if (d.oracleConfigBroadcaster != address(0)) {
            console.log("OracleConfigBroadcaster:", d.oracleConfigBroadcaster);
        }
        if (d.oracleConfigReceiver != address(0)) {
            console.log("OracleConfigReceiver:", d.oracleConfigReceiver);
        }
    }
}
