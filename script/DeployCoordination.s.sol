// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import {PoolReserveRegistry} from "../src/coordination/PoolReserveRegistry.sol";
import {CCIPReserveMessenger} from "../src/coordination/CCIPReserveMessenger.sol";
import {IntentRouter} from "../src/coordination/IntentRouter.sol";
import {CrossChainIntentBridge} from "../src/coordination/CrossChainIntentBridge.sol";
import {OracleConfigQuorum} from "../src/coordination/OracleConfigQuorum.sol";
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
///   QUORUM_THRESHOLD   - N-of-M votes required for oracle config consensus (default: 1)
///   PROPOSAL_TTL       - seconds before a config vote expires (default: 86400)
///
/// Optional:
///   KEEPER             - approved keeper address for IntentRouter
///   REMOTE_SELECTOR    - remote chain selector to register
///   REMOTE_MESSENGER   - remote CCIPReserveMessenger address
///   REMOTE_QUORUM      - remote OracleConfigQuorum address to register as peer
contract DeployCoordination is Script {
    struct Deployed {
        address poolReserveRegistry;
        address ccipReserveMessenger;
        address intentRouterProxy;
        address intentRouterImpl;
        address crossChainIntentBridge;
        address oracleConfigQuorum;
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
        uint8 quorumThreshold = uint8(vm.envOr("QUORUM_THRESHOLD", uint256(1)));
        uint32 proposalTtl = uint32(vm.envOr("PROPOSAL_TTL", uint256(86_400)));

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

        // 6. Oracle config quorum (symmetric — deployed identically on every chain)
        OracleConfigQuorum quorum = new OracleConfigQuorum(
            ccipRouter, oracleAdapter, chainSelector, quorumThreshold, proposalTtl, feeToken, deployer
        );
        d.oracleConfigQuorum = address(quorum);

        // 7. Wire remote peers (optional)
        uint64 remoteSelector = uint64(vm.envOr("REMOTE_SELECTOR", uint256(0)));
        if (remoteSelector > 0) {
            address remoteMessenger = vm.envAddress("REMOTE_MESSENGER");
            registry.addRemoteChain(remoteSelector);
            messenger.addPeer(remoteSelector, remoteMessenger);

            address remoteQuorum = vm.envOr("REMOTE_QUORUM", address(0));
            if (remoteQuorum != address(0)) {
                quorum.addPeer(remoteSelector, remoteQuorum);
            }
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
        console.log("OracleConfigQuorum:", d.oracleConfigQuorum);
    }
}
