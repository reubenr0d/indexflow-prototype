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
/// @dev Usage: CHAIN=sepolia forge script script/DeployCoordination.s.sol --rpc-url sepolia --broadcast -vvv
///
/// When CHAIN env var is set, reads chain constants from config/chains.json and existing
/// contract addresses from apps/web/src/config/{CHAIN}-deployment.json. Writes coordination
/// addresses back to the deployment JSON.
///
/// When CHAIN is not set, falls back to legacy env vars for backward compatibility:
///   GMX_VAULT, USDC, CCIP_ROUTER, BASKET_FACTORY, ORACLE_ADAPTER, CHAIN_SELECTOR, FEE_TOKEN
///
/// Always required:
///   TREASURY           - protocol treasury for intent fees
///
/// Optional:
///   KEEPER             - approved keeper address for IntentRouter
///   QUORUM_THRESHOLD   - N-of-M votes required for oracle config consensus (default: 1)
///   PROPOSAL_TTL       - seconds before a config vote expires (default: 86400)
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

        address gmxVault;
        address usdc;
        address ccipRouter;
        address basketFactory;
        address oracleAdapter;
        uint64 chainSelector;
        address feeToken;
        string memory chainName;
        string memory deployJsonPath;

        if (vm.envExists("CHAIN")) {
            chainName = vm.envString("CHAIN");

            string memory chainsJson = vm.readFile(string.concat(vm.projectRoot(), "/config/chains.json"));
            string memory key = string.concat(".", chainName);

            ccipRouter = vm.parseJsonAddress(chainsJson, string.concat(key, ".ccipRouter"));
            chainSelector = uint64(vm.parseJsonUint(chainsJson, string.concat(key, ".ccipChainSelector")));
            feeToken = vm.parseJsonAddress(chainsJson, string.concat(key, ".linkToken"));

            deployJsonPath = string.concat(
                vm.projectRoot(), "/apps/web/src/config/", chainName, "-deployment.json"
            );
            string memory deployJson = vm.readFile(deployJsonPath);
            gmxVault = vm.parseJsonAddress(deployJson, ".gmxVault");
            usdc = vm.parseJsonAddress(deployJson, ".usdc");
            basketFactory = vm.parseJsonAddress(deployJson, ".basketFactory");
            oracleAdapter = vm.parseJsonAddress(deployJson, ".oracleAdapter");
        } else {
            gmxVault = vm.envAddress("GMX_VAULT");
            usdc = vm.envAddress("USDC");
            ccipRouter = vm.envAddress("CCIP_ROUTER");
            basketFactory = vm.envAddress("BASKET_FACTORY");
            oracleAdapter = vm.envAddress("ORACLE_ADAPTER");
            chainSelector = uint64(vm.envUint("CHAIN_SELECTOR"));
            feeToken = vm.envAddress("FEE_TOKEN");
        }

        address treasury = vm.envAddress("TREASURY");
        uint8 quorumThreshold = uint8(vm.envOr("QUORUM_THRESHOLD", uint256(1)));
        uint32 proposalTtl = uint32(vm.envOr("PROPOSAL_TTL", uint256(86_400)));

        require(ccipRouter != address(0), "DeployCoordination: CCIP router required");

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

        vm.stopBroadcast();

        if (bytes(chainName).length > 0) {
            _writeCoordinationJson(deployJsonPath, d);
        }

        _logDeployment(d);
    }

    function _writeCoordinationJson(string memory path, Deployed memory d) internal {
        string memory existing = vm.readFile(path);

        string memory coordBlock = string.concat(
            ',\n  "poolReserveRegistry": "', vm.toString(d.poolReserveRegistry),
            '",\n  "ccipReserveMessenger": "', vm.toString(d.ccipReserveMessenger),
            '",\n  "intentRouter": "', vm.toString(d.intentRouterProxy),
            '",\n  "intentRouterImpl": "', vm.toString(d.intentRouterImpl),
            '",\n  "crossChainIntentBridge": "', vm.toString(d.crossChainIntentBridge),
            '",\n  "oracleConfigQuorum": "', vm.toString(d.oracleConfigQuorum), '"'
        );

        string memory updated = vm.replace(existing, '\n}\n', string.concat(coordBlock, '\n}\n'));
        vm.writeFile(path, updated);
        console.log("Coordination addresses appended to", path);
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
