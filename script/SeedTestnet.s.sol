// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";

interface IMockUSDC {
    function mint(address to, uint256 amount) external;
    function approve(address spender, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

interface IBasketFactory {
    function createBasket(string calldata _name, uint256 depositFeeBps, uint256 redeemFeeBps)
        external
        returns (address);
    function getAllBaskets() external view returns (address[] memory);
}

interface IBasketVault {
    function setAssets(bytes32[] calldata assetIds) external;
    function setMinReserveBps(uint256 bps) external;
    function setKeeper(address _keeper) external;
    function deposit(uint256 usdcAmount) external returns (uint256);
    function redeem(uint256 sharesToBurn) external returns (uint256);
    function allocateToPerp(uint256 amount) external;
    function shareToken() external view returns (address);
    function getAssetCount() external view returns (uint256);
}

interface IOracleAdapterSeed {
    function seedHistoricalPrices(bytes32 assetId, uint256[] calldata prices_, uint256[] calldata timestamps_)
        external;
    function getAssetCount() external view returns (uint256);
    function assetList(uint256 index) external view returns (bytes32);
    function assetSymbols(bytes32 assetId) external view returns (string memory);
    function isAssetActive(bytes32 assetId) external view returns (bool);
}

interface IAssetWiring {
    function wireAsset(string calldata symbol, uint256 seedPriceRaw8) external;
}

interface IPriceSync {
    function syncAll() external;
}

interface IVaultAccounting {
    function openPosition(address vault, bytes32 asset, bool isLong, uint256 size, uint256 collateral) external;
}

/// @notice Seeds a testnet deployment with vaults, historical prices, deposits, and activity.
/// @dev Reads deployed contract addresses from {CHAIN}-deployment.json and historical price
///      data from cache/historical-prices.json.
///
///  Required env:
///    CHAIN - chain name matching a key in config/chains.json
///  Optional env:
///    PRIVATE_KEY      - deployer private key (defaults to Anvil key 0 for "local")
///    DEPLOYMENT_CONFIG - override path to deployment JSON
contract SeedTestnet is Script {
    // ─── Vault definitions ────────────────────────────────────────

    struct VaultDef {
        string name;
        uint256 depositFeeBps;
        uint256 redeemFeeBps;
        uint256 minReserveBps;
        uint256 depositAmount;
        uint256 redeemShares;
        uint256 perpAllocation;
    }

    // Additional assets to wire beyond the already-deployed BHP.AX
    string[] internal _extraSymbols;
    VaultDef[] internal _vaultDefs;

    function run() external {
        // ── Config ────────────────────────────────────────────────
        string memory chainName = vm.envString("CHAIN");

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

        string memory configPath = _resolveConfigPath(chainName);
        string memory deployJson = vm.readFile(configPath);
        console2.log("Deployment config:", configPath);

        address usdc = vm.parseJsonAddress(deployJson, ".usdc");
        address basketFactory = vm.parseJsonAddress(deployJson, ".basketFactory");
        address oracleAdapter = vm.parseJsonAddress(deployJson, ".oracleAdapter");
        address assetWiring = vm.parseJsonAddress(deployJson, ".assetWiring");
        address priceSync = vm.parseJsonAddress(deployJson, ".priceSync");
        address vaultAccounting = vm.parseJsonAddress(deployJson, ".vaultAccounting");

        // ── Load historical price data ────────────────────────────
        string memory histPath = string.concat(vm.projectRoot(), "/cache/historical-prices.json");
        string memory histJson = vm.readFile(histPath);
        console2.log("Historical data:", histPath);

        // ── Prepare extra assets and vault definitions ────────────
        // Oracle symbols and their sanitized JSON keys (dots replaced with underscores
        // because vm.parseJson treats dots as path separators).
        _extraSymbols.push("XAU");
        _extraSymbols.push("XAG");
        _extraSymbols.push("GLEN.L");

        // Vault 1: Commodities Basket (XAU + XAG)
        _vaultDefs.push(
            VaultDef({
                name: "Commodities Basket",
                depositFeeBps: 50,
                redeemFeeBps: 50,
                minReserveBps: 1000,
                depositAmount: 100_000e6,
                redeemShares: 5_000e6,
                perpAllocation: 20_000e6
            })
        );

        // Vault 2: Australian Equities (BHP.AX)
        _vaultDefs.push(
            VaultDef({
                name: "Australian Equities",
                depositFeeBps: 25,
                redeemFeeBps: 25,
                minReserveBps: 500,
                depositAmount: 75_000e6,
                redeemShares: 2_000e6,
                perpAllocation: 15_000e6
            })
        );

        // Vault 3: Global Resources (BHP.AX + XAU + GLEN.L)
        _vaultDefs.push(
            VaultDef({
                name: "Global Resources",
                depositFeeBps: 75,
                redeemFeeBps: 75,
                minReserveBps: 1500,
                depositAmount: 50_000e6,
                redeemShares: 1_000e6,
                perpAllocation: 10_000e6
            })
        );

        // Vault 4: Precious Metals (XAU + XAG)
        _vaultDefs.push(
            VaultDef({
                name: "Precious Metals",
                depositFeeBps: 100,
                redeemFeeBps: 100,
                minReserveBps: 2000,
                depositAmount: 25_000e6,
                redeemShares: 500e6,
                perpAllocation: 0
            })
        );

        vm.startBroadcast(deployerPrivateKey);

        // ── Phase 1: Wire additional assets ───────────────────────
        console2.log("\n=== Phase 1: Wire extra assets ===");
        for (uint256 i = 0; i < _extraSymbols.length; i++) {
            bytes32 assetId = keccak256(bytes(_extraSymbols[i]));
            if (IOracleAdapterSeed(oracleAdapter).isAssetActive(assetId)) {
                console2.log("  Already active, skipping:", _extraSymbols[i]);
                continue;
            }

            // Read seed price from historical data (last entry)
            string memory jsonKey = _sanitizeJsonKey(_extraSymbols[i]);
            string memory pricesKey = string.concat(".", jsonKey, ".prices");
            uint256[] memory histPrices = vm.parseJsonUintArray(histJson, pricesKey);
            require(histPrices.length > 0, string.concat("No historical prices for ", _extraSymbols[i]));
            uint256 seedPrice = histPrices[histPrices.length - 1];

            console2.log("  Wiring asset:", _extraSymbols[i]);
            console2.log("  Seed price (raw8):", seedPrice);
            IAssetWiring(assetWiring).wireAsset(_extraSymbols[i], seedPrice);
        }

        // ── Phase 2: Submit backdated oracle history ──────────────
        console2.log("\n=== Phase 2: Backdate oracle prices ===");
        string[4] memory allSymbols = ["BHP.AX", "XAU", "XAG", "GLEN.L"];

        for (uint256 s = 0; s < allSymbols.length; s++) {
            string memory sym = allSymbols[s];
            bytes32 assetId = keccak256(bytes(sym));

            string memory jsonKey = _sanitizeJsonKey(sym);
            string memory pKey = string.concat(".", jsonKey, ".prices");
            string memory tKey = string.concat(".", jsonKey, ".timestamps");

            uint256[] memory prices = vm.parseJsonUintArray(histJson, pKey);
            uint256[] memory timestamps = vm.parseJsonUintArray(histJson, tKey);

            require(prices.length > 0, string.concat("Missing prices for ", sym));
            require(prices.length == timestamps.length, string.concat("Length mismatch for ", sym));

            console2.log("  Seeding history for:", sym);
            console2.log("  Data points:", prices.length);

            IOracleAdapterSeed(oracleAdapter).seedHistoricalPrices(assetId, prices, timestamps);
        }

        IPriceSync(priceSync).syncAll();
        console2.log("  PriceSync.syncAll() done");

        // ── Phase 3: Mint USDC and create vaults ──────────────────
        console2.log("\n=== Phase 3: Create vaults ===");

        uint256 totalUsdcNeeded;
        for (uint256 i = 0; i < _vaultDefs.length; i++) {
            totalUsdcNeeded += _vaultDefs[i].depositAmount;
        }
        IMockUSDC(usdc).mint(deployer, totalUsdcNeeded);
        console2.log("  Minted USDC:", totalUsdcNeeded / 1e6, "(units)");

        bytes32 bhpAx = keccak256("BHP.AX");
        bytes32 xau = keccak256("XAU");
        bytes32 xag = keccak256("XAG");
        bytes32 glenL = keccak256("GLEN.L");

        // Asset compositions per vault
        bytes32[][] memory compositions = new bytes32[][](4);

        compositions[0] = new bytes32[](2);
        compositions[0][0] = xau;
        compositions[0][1] = xag;

        compositions[1] = new bytes32[](1);
        compositions[1][0] = bhpAx;

        compositions[2] = new bytes32[](3);
        compositions[2][0] = bhpAx;
        compositions[2][1] = xau;
        compositions[2][2] = glenL;

        compositions[3] = new bytes32[](2);
        compositions[3][0] = xau;
        compositions[3][1] = xag;

        address[] memory vaults = new address[](4);

        for (uint256 i = 0; i < _vaultDefs.length; i++) {
            VaultDef memory def = _vaultDefs[i];

            address vault =
                IBasketFactory(basketFactory).createBasket(def.name, def.depositFeeBps, def.redeemFeeBps);
            vaults[i] = vault;
            console2.log("  Created vault:", def.name);
            console2.log("  Address:", vault);

            IBasketVault(vault).setAssets(compositions[i]);
            IBasketVault(vault).setMinReserveBps(def.minReserveBps);
            IBasketVault(vault).setKeeper(deployer);
        }

        // ── Phase 4: Simulate activity ────────────────────────────
        console2.log("\n=== Phase 4: Simulate activity ===");

        for (uint256 i = 0; i < _vaultDefs.length; i++) {
            VaultDef memory def = _vaultDefs[i];
            address vault = vaults[i];

            // Deposit
            IMockUSDC(usdc).approve(vault, def.depositAmount);
            uint256 shares = IBasketVault(vault).deposit(def.depositAmount);
            console2.log("  Deposited into vault", i);
            console2.log("  USDC:", def.depositAmount / 1e6);
            console2.log("  Shares received:", shares);

            // Partial redeem (redeem burns from msg.sender directly)
            if (def.redeemShares > 0 && shares > def.redeemShares) {
                uint256 usdcBack = IBasketVault(vault).redeem(def.redeemShares);
                console2.log("  Redeemed shares:", def.redeemShares);
                console2.log("  USDC returned:", usdcBack);
            }

            // Perp allocation
            if (def.perpAllocation > 0) {
                IBasketVault(vault).allocateToPerp(def.perpAllocation);
                console2.log("  Allocated to perp:", def.perpAllocation / 1e6);
            }
        }

        // Open a perp position on the first vault (Commodities Basket, long XAU)
        console2.log("\n=== Opening perp position ===");
        uint256 posSize = 50_000 * 1e30;
        uint256 posCollateral = 10_000e6;
        IVaultAccounting(vaultAccounting).openPosition(vaults[0], xau, true, posSize, posCollateral);
        console2.log("  Opened long XAU position on vault 0");
        console2.log("  Size (USD*1e30):", posSize);
        console2.log("  Collateral (USDC):", posCollateral);

        vm.stopBroadcast();

        console2.log("\n=== Seed Complete ===");
        console2.log("Chain:", chainName);
        console2.log("Vaults created:", _vaultDefs.length);
    }

    function _resolveConfigPath(string memory chainName) internal view returns (string memory) {
        if (vm.envExists("DEPLOYMENT_CONFIG")) {
            return vm.envString("DEPLOYMENT_CONFIG");
        }
        return string.concat(vm.projectRoot(), "/apps/web/src/config/", chainName, "-deployment.json");
    }

    /// @dev Replace dots with underscores so the symbol can be used as a JSON key
    /// (vm.parseJson treats dots as path separators).
    function _sanitizeJsonKey(string memory sym) internal pure returns (string memory) {
        bytes memory b = bytes(sym);
        bytes memory out = new bytes(b.length);
        for (uint256 i = 0; i < b.length; i++) {
            out[i] = b[i] == 0x2e ? bytes1(0x5f) : b[i]; // '.' → '_'
        }
        return string(out);
    }
}
