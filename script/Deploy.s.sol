// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import {YahooFinanceSeed} from "./YahooFinanceSeed.sol";
import {IGMXVault} from "../src/perp/interfaces/IGMXVault.sol";
import {VaultAccounting} from "../src/perp/VaultAccounting.sol";
import {OracleAdapter} from "../src/perp/OracleAdapter.sol";
import {IOracleAdapter} from "../src/perp/interfaces/IOracleAdapter.sol";
import {PricingEngine} from "../src/perp/PricingEngine.sol";
import {FundingRateManager} from "../src/perp/FundingRateManager.sol";
import {PerpReader} from "../src/perp/PerpReader.sol";
import {BasketFactory} from "../src/vault/BasketFactory.sol";
import {PriceSync} from "../src/perp/PriceSync.sol";
import {AssetWiring} from "../src/perp/AssetWiring.sol";
import {MockUSDC} from "../src/vault/MockUSDC.sol";
import {MockIndexToken} from "../src/mocks/MockIndexToken.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {StateRelay} from "../src/coordination/StateRelay.sol";

interface ISimplePriceFeed {
    function setPrice(address token, uint256 price) external;
    function setGov(address _gov) external;
    function setKeeper(address _keeper, bool _active) external;
    function prices(address token) external view returns (uint256);
    function getPrice(address token, bool maximise, bool includeAmmPrice, bool useSwapPricing)
        external
        view
        returns (uint256);
}

interface IVaultErrorController {
    function setErrors(address _vault, string[] calldata _errors) external;
}

/// @notice Unified deploy script for any chain. Parameterized by CHAIN env var.
/// @dev Usage: CHAIN=sepolia forge script script/Deploy.s.sol:Deploy --rpc-url sepolia --broadcast -vvv
///
/// Required env:
///   CHAIN - chain name matching a key in config/chains.json (e.g. "local", "sepolia", "fuji")
///
/// Optional env:
///   PRIVATE_KEY  - deployer private key (defaults to Anvil key 0 for "local")
///   SEED_PRICE_RAW - override BHP.AX seed price (8-decimal raw)
contract Deploy is Script {
    uint256 constant INITIAL_USDC_BUFFER = 200_000e6;
    uint256 constant INITIAL_GMX_MINT = 10_000_000e6;
    uint256 constant INITIAL_GMX_POOL_SEED = 1_000_000e6;

    struct Deployed {
        address basketFactory;
        address vaultAccounting;
        address oracleAdapter;
        address perpReader;
        address pricingEngine;
        address fundingRateManager;
        address priceSync;
        address usdc;
        address gmxVault;
        address assetWiring;
        address stateRelay;
    }

    function run() external {
        string memory chainName = vm.envString("CHAIN");

        string memory chainsJson = vm.readFile(string.concat(vm.projectRoot(), "/config/chains.json"));
        string memory chainKey = string.concat(".", chainName);

        string memory rpcAlias = vm.parseJsonString(chainsJson, string.concat(chainKey, ".rpcAlias"));
        bool mockUsdc = vm.parseJsonBool(chainsJson, string.concat(chainKey, ".mockUsdc"));
        uint64 ccipChainSelector = uint64(vm.parseJsonUint(chainsJson, string.concat(chainKey, ".ccipChainSelector")));

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
        vm.startBroadcast(deployerPrivateKey);

        Deployed memory d;

        if (mockUsdc) {
            d.usdc = address(new MockUSDC());
        } else {
            d.usdc = vm.parseJsonAddress(chainsJson, string.concat(chainKey, ".usdc"));
            require(d.usdc != address(0), "Deploy: real USDC address required when mockUsdc=false");
        }

        string memory symbol = "BHP.AX";
        uint256 seedRaw = YahooFinanceSeed.rawUsdPrice8(vm, symbol);
        console2.log("BHP.AX seed raw (8d USD, Yahoo or SEED_PRICE_RAW):", seedRaw);

        address pfAddr = _deployGmx(d, deployer, chainName);

        _deployPerp(d, deployer, pfAddr);

        _deployAssetWiring(d, deployer, pfAddr, symbol, seedRaw);

        _deployBasketFactory(d, deployer);

        _deployStateRelay(d, deployer, ccipChainSelector);

        vm.stopBroadcast();

        string memory outPath = string.concat(
            vm.projectRoot(), "/apps/web/src/config/", chainName, "-deployment.json"
        );
        vm.writeFile(outPath, _buildJson(d));
        console2.log("=== Stack Deployed ===");
        console2.log("Chain:", chainName);
        console2.log("Wrote", outPath);
    }

    function _deployGmx(Deployed memory d, address deployer, string memory chainName) internal returns (address pfAddr) {
        pfAddr = deployCode("SimplePriceFeed.sol:SimplePriceFeed");
        ISimplePriceFeed(pfAddr).setPrice(d.usdc, 1e30);

        address vaultMath = deployCode("VaultMath.sol:VaultMath");
        d.gmxVault = _deployVaultWithLinkedVaultMath(vaultMath, chainName);
        IGMXVault gmxVault = IGMXVault(d.gmxVault);

        address usdgAddr = deployCode("USDG.sol:USDG", abi.encode(d.gmxVault));
        address routerAddr = deployCode("Router.sol:Router", abi.encode(d.gmxVault, usdgAddr, d.usdc));
        address vaultUtilsAddr = deployCode("VaultUtils.sol:VaultUtils", abi.encode(d.gmxVault));

        gmxVault.initialize(routerAddr, usdgAddr, pfAddr, 5e30, 600, 600);
        gmxVault.setVaultUtils(vaultUtilsAddr);

        address errCtrl = deployCode("VaultErrorController.sol:VaultErrorController");
        gmxVault.setErrorController(errCtrl);
        _setVaultErrors(errCtrl, d.gmxVault);

        gmxVault.setFees(0, 0, 0, 0, 0, 0, 5e30, 0, false);
        gmxVault.setTokenConfig(d.usdc, 6, 10000, 0, 0, true, false);

        MockUSDC(d.usdc).mint(deployer, INITIAL_GMX_MINT);
        MockUSDC(d.usdc).transfer(d.gmxVault, INITIAL_GMX_POOL_SEED);
        gmxVault.directPoolDeposit(d.usdc);
        gmxVault.setBufferAmount(d.usdc, INITIAL_USDC_BUFFER);
    }

    function _deployPerp(Deployed memory d, address deployer, address pfAddr) internal {
        OracleAdapter oa = new OracleAdapter(deployer);
        d.oracleAdapter = address(oa);
        oa.setKeeper(deployer, true);

        VaultAccounting va = new VaultAccounting(d.usdc, d.gmxVault, d.oracleAdapter, deployer);
        d.vaultAccounting = address(va);

        d.pricingEngine = address(new PricingEngine(d.oracleAdapter, deployer));

        FundingRateManager frm = new FundingRateManager(d.gmxVault, d.oracleAdapter, deployer);
        d.fundingRateManager = address(frm);
        frm.setKeeper(deployer, true);

        d.perpReader = address(new PerpReader(d.gmxVault, d.oracleAdapter, d.vaultAccounting));

        PriceSync ps = new PriceSync(d.oracleAdapter, pfAddr, deployer);
        d.priceSync = address(ps);
        ISimplePriceFeed(pfAddr).setKeeper(address(ps), true);
    }

    function _deployAssetWiring(
        Deployed memory d,
        address deployer,
        address pfAddr,
        string memory symbol,
        uint256 seedRaw
    ) internal {
        AssetWiring aw = new AssetWiring(
            d.oracleAdapter, d.vaultAccounting, d.fundingRateManager, d.priceSync, pfAddr, d.gmxVault, deployer
        );
        d.assetWiring = address(aw);

        OracleAdapter(d.oracleAdapter).setWirer(d.assetWiring, true);
        VaultAccounting(d.vaultAccounting).setWirer(d.assetWiring, true);
        FundingRateManager(d.fundingRateManager).setWirer(d.assetWiring, true);
        PriceSync(d.priceSync).setWirer(d.assetWiring, true);

        OracleAdapter(d.oracleAdapter).setKeeper(d.assetWiring, true);
        ISimplePriceFeed(pfAddr).setKeeper(d.assetWiring, true);

        IGMXVault(d.gmxVault).setGov(d.assetWiring);

        aw.wireAsset(symbol, seedRaw);
    }

    function _deployBasketFactory(Deployed memory d, address deployer) internal {
        BasketFactory bf = new BasketFactory(d.usdc, d.oracleAdapter, deployer);
        d.basketFactory = address(bf);
        bf.setVaultAccounting(d.vaultAccounting);
        VaultAccounting(d.vaultAccounting).setWirer(d.basketFactory, true);
    }

    function _deployStateRelay(Deployed memory d, address deployer, uint64 ccipChainSelector) internal {
        uint48 maxStaleness = 300; // 5 minutes default
        StateRelay relay = new StateRelay(ccipChainSelector, maxStaleness, deployer, deployer);
        d.stateRelay = address(relay);
    }

    function _deployVaultWithLinkedVaultMath(address mathLib, string memory chainName) internal returns (address addr) {
        string memory json = vm.readFile("out/Vault.sol/Vault.json");
        string memory obj = vm.parseJsonString(json, ".bytecode.object");
        string memory ph = "__$36c87766e6d22a740de7496ef4a84155d7$__";
        string memory libHex = _addressToHex40NoPrefix(mathLib);
        string memory linked = vm.replace(obj, ph, libHex);
        bytes memory bytecode = vm.parseBytes(linked);
        assembly ("memory-safe") {
            addr := create(0, add(bytecode, 0x20), mload(bytecode))
        }
        require(addr != address(0), "Deploy: Vault create failed");
    }

    function _addressToHex40NoPrefix(address a) private pure returns (string memory) {
        bytes memory alphabet = "0123456789abcdef";
        bytes memory str = new bytes(40);
        bytes20 data = bytes20(a);
        for (uint256 i; i < 20; ++i) {
            str[2 * i] = alphabet[uint8(data[i] >> 4)];
            str[2 * i + 1] = alphabet[uint8(data[i] & 0x0f)];
        }
        return string(str);
    }

    function _buildJson(Deployed memory d) internal view returns (string memory) {
        string memory p1 = string.concat(
            "{\n",
            '  "basketFactory": "',
            vm.toString(d.basketFactory),
            '",\n',
            '  "vaultAccounting": "',
            vm.toString(d.vaultAccounting),
            '",\n',
            '  "oracleAdapter": "',
            vm.toString(d.oracleAdapter),
            '",\n',
            '  "perpReader": "',
            vm.toString(d.perpReader),
            '",\n',
            '  "pricingEngine": "',
            vm.toString(d.pricingEngine),
            '",\n'
        );
        string memory p2 = string.concat(
            '  "fundingRateManager": "',
            vm.toString(d.fundingRateManager),
            '",\n',
            '  "priceSync": "',
            vm.toString(d.priceSync),
            '",\n',
            '  "usdc": "',
            vm.toString(d.usdc),
            '",\n',
            '  "gmxVault": "',
            vm.toString(d.gmxVault),
            '",\n',
            '  "assetWiring": "',
            vm.toString(d.assetWiring),
            '",\n',
            '  "stateRelay": "',
            vm.toString(d.stateRelay),
            '"\n',
            "}\n"
        );
        return string.concat(p1, p2);
    }

    function _setVaultErrors(address errCtrl, address vault) internal {
        string[] memory errors = new string[](56);
        errors[0] = "Vault: zero error";
        errors[1] = "Vault: already initialized";
        errors[2] = "Vault: invalid _maxLeverage";
        errors[3] = "Vault: invalid _taxBasisPoints";
        errors[4] = "Vault: invalid _stableTaxBasisPoints";
        errors[5] = "Vault: invalid _mintBurnFeeBasisPoints";
        errors[6] = "Vault: invalid _swapFeeBasisPoints";
        errors[7] = "Vault: invalid _stableSwapFeeBasisPoints";
        errors[8] = "Vault: invalid _marginFeeBasisPoints";
        errors[9] = "Vault: invalid _liquidationFeeUsd";
        errors[10] = "Vault: invalid _fundingInterval";
        errors[11] = "Vault: invalid _fundingRateFactor";
        errors[12] = "Vault: invalid _stableFundingRateFactor";
        errors[13] = "Vault: invalid _tokenWeight";
        errors[14] = "Vault: invalid _token";
        errors[15] = "Vault: _token not whitelisted";
        errors[16] = "Vault: _token not whitelisted";
        errors[17] = "Vault: invalid tokenAmount";
        errors[18] = "Vault: invalid usdgAmount";
        errors[19] = "Vault: _token not whitelisted";
        errors[20] = "Vault: invalid usdgAmount";
        errors[21] = "Vault: invalid redemptionAmount";
        errors[22] = "Vault: invalid amountOut";
        errors[23] = "Vault: swaps not enabled";
        errors[24] = "Vault: _tokenIn not whitelisted";
        errors[25] = "Vault: _tokenOut not whitelisted";
        errors[26] = "Vault: invalid tokens";
        errors[27] = "Vault: invalid tokenAmount";
        errors[28] = "Vault: leverage not enabled";
        errors[29] = "Vault: insufficient collateral for fees";
        errors[30] = "Vault: invalid position.size";
        errors[31] = "Vault: empty position";
        errors[32] = "Vault: position size exceeded";
        errors[33] = "Vault: position collateral exceeded";
        errors[34] = "Vault: invalid liquidator";
        errors[35] = "Vault: empty position";
        errors[36] = "Vault: position cannot be liquidated";
        errors[37] = "Vault: invalid position";
        errors[38] = "Vault: invalid _averagePrice";
        errors[39] = "Vault: collateral should be withdrawn";
        errors[40] = "Vault: _size must be more than _collateral";
        errors[41] = "Vault: invalid msg.sender";
        errors[42] = "Vault: mismatched tokens";
        errors[43] = "Vault: _collateralToken not whitelisted";
        errors[44] = "Vault: _collateralToken must not be a stableToken";
        errors[45] = "Vault: _collateralToken not whitelisted";
        errors[46] = "Vault: _collateralToken must be a stableToken";
        errors[47] = "Vault: _indexToken must not be a stableToken";
        errors[48] = "Vault: _indexToken not shortable";
        errors[49] = "Vault: invalid increase";
        errors[50] = "Vault: reserve exceeds pool";
        errors[51] = "Vault: max USDG exceeded";
        errors[52] = "Vault: reserve exceeds pool";
        errors[53] = "Vault: forbidden";
        errors[54] = "Vault: forbidden";
        errors[55] = "Vault: maxGasPrice exceeded";

        IVaultErrorController(errCtrl).setErrors(vault, errors);
    }
}
