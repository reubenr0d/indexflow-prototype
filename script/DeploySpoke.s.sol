// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import {BasketFactory} from "../src/vault/BasketFactory.sol";
import {StateRelay} from "../src/coordination/StateRelay.sol";
import {RedemptionReceiver} from "../src/coordination/RedemptionReceiver.sol";
import {MockUSDC} from "../src/vault/MockUSDC.sol";

/// @notice Lightweight spoke deploy script. Deploys MockUSDC + BasketFactory + StateRelay + RedemptionReceiver.
/// Skips the entire GMX/perp/oracle stack (VaultAccounting, OracleAdapter, FundingRateManager,
/// PricingEngine, PerpReader, PriceSync, AssetWiring, IntentRouter, IntentBridge, etc.).
///
/// @dev Usage: CHAIN=fuji forge script script/DeploySpoke.s.sol:DeploySpoke --rpc-url fuji --broadcast -vvv
///
/// Required env:
///   CHAIN - chain name matching a key in config/chains.json with "role": "spoke"
///
/// Optional env:
///   PRIVATE_KEY - deployer private key (defaults to Anvil key 0 for "local")
///   KEEPER      - keeper address for StateRelay (defaults to deployer)
///   MAX_STALENESS - PnL staleness threshold in seconds (default 300)
contract DeploySpoke is Script {
    struct SpokeDeployed {
        address basketFactory;
        address stateRelay;
        address redemptionReceiver;
        address usdc;
    }

    function run() external {
        string memory chainName = vm.envString("CHAIN");

        string memory chainsJson = vm.readFile(string.concat(vm.projectRoot(), "/config/chains.json"));
        string memory chainKey = string.concat(".", chainName);

        bool mockUsdc = vm.parseJsonBool(chainsJson, string.concat(chainKey, ".mockUsdc"));
        uint64 ccipChainSelector =
            uint64(vm.parseJsonUint(chainsJson, string.concat(chainKey, ".ccipChainSelector")));
        address ccipRouter = vm.parseJsonAddress(chainsJson, string.concat(chainKey, ".ccipRouter"));

        uint256 deployerPrivateKey;
        if (keccak256(bytes(chainName)) == keccak256("local")) {
            deployerPrivateKey = uint256(0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80);
            if (vm.envExists("PRIVATE_KEY")) {
                deployerPrivateKey = vm.envUint("PRIVATE_KEY");
            }
        } else {
            deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        }
        address deployer = vm.addr(deployerPrivateKey);

        address keeperAddr = deployer;
        if (vm.envExists("KEEPER")) {
            keeperAddr = vm.envAddress("KEEPER");
        }

        uint48 maxStaleness = 300;
        if (vm.envExists("MAX_STALENESS")) {
            maxStaleness = uint48(vm.envUint("MAX_STALENESS"));
        }

        vm.startBroadcast(deployerPrivateKey);

        SpokeDeployed memory d;

        // 1. USDC
        if (mockUsdc) {
            d.usdc = address(new MockUSDC());
        } else {
            d.usdc = vm.parseJsonAddress(chainsJson, string.concat(chainKey, ".usdc"));
            require(d.usdc != address(0), "DeploySpoke: real USDC address required when mockUsdc=false");
        }

        // 2. StateRelay
        StateRelay relay = new StateRelay(ccipChainSelector, maxStaleness, keeperAddr, deployer);
        d.stateRelay = address(relay);

        // 3. RedemptionReceiver (CCIP receiver for cross-chain redemption fills)
        if (ccipRouter != address(0)) {
            RedemptionReceiver receiver = new RedemptionReceiver(ccipRouter, d.usdc, deployer);
            d.redemptionReceiver = address(receiver);
        }

        // 4. BasketFactory (no oracle on spokes — pass address(0))
        BasketFactory bf = new BasketFactory(d.usdc, address(0), deployer);
        d.basketFactory = address(bf);

        vm.stopBroadcast();

        string memory outPath =
            string.concat(vm.projectRoot(), "/apps/web/src/config/", chainName, "-deployment.json");
        vm.writeFile(outPath, _buildJson(d));
        console2.log("=== Spoke Deployed ===");
        console2.log("Chain:", chainName);
        console2.log("Wrote", outPath);
    }

    function _buildJson(SpokeDeployed memory d) internal view returns (string memory) {
        string memory base = string.concat(
            "{\n",
            '  "basketFactory": "',
            vm.toString(d.basketFactory),
            '",\n',
            '  "stateRelay": "',
            vm.toString(d.stateRelay),
            '",\n'
        );
        string memory receiver = d.redemptionReceiver != address(0)
            ? string.concat('  "redemptionReceiver": "', vm.toString(d.redemptionReceiver), '",\n')
            : "";
        string memory tail = string.concat('  "usdc": "', vm.toString(d.usdc), '"\n', "}\n");
        return string.concat(base, receiver, tail);
    }
}
