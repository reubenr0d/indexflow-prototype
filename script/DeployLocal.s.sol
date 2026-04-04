// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import {IGMXVault} from "../src/perp/interfaces/IGMXVault.sol";
import {VaultAccounting} from "../src/perp/VaultAccounting.sol";
import {OracleAdapter} from "../src/perp/OracleAdapter.sol";
import {IOracleAdapter} from "../src/perp/interfaces/IOracleAdapter.sol";
import {PricingEngine} from "../src/perp/PricingEngine.sol";
import {FundingRateManager} from "../src/perp/FundingRateManager.sol";
import {PerpReader} from "../src/perp/PerpReader.sol";
import {BasketFactory} from "../src/vault/BasketFactory.sol";
import {PriceSync} from "../src/perp/PriceSync.sol";
import {MockUSDC} from "../src/vault/MockUSDC.sol";
import {MockIndexToken} from "../src/mocks/MockIndexToken.sol";

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

/// @notice Deploy full stack to local Anvil and write `apps/web/src/config/local-deployment.json`.
contract DeployLocal is Script {
    bytes32 constant XAU = keccak256("XAU");
    bytes32 constant XAG = keccak256("XAG");

    function run() external {
        uint256 deployerPrivateKey = uint256(0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80);
        if (vm.envExists("PRIVATE_KEY")) {
            deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        }
        address deployer = vm.addr(deployerPrivateKey);
        vm.startBroadcast(deployerPrivateKey);

        MockUSDC usdc = new MockUSDC();
        MockIndexToken gold = new MockIndexToken("Gold Token", "GOLD", 18);
        MockIndexToken silver = new MockIndexToken("Silver Token", "SILVER", 18);

        address pfAddr = deployCode("SimplePriceFeed.sol:SimplePriceFeed");
        ISimplePriceFeed priceFeed = ISimplePriceFeed(pfAddr);
        priceFeed.setPrice(address(usdc), 1e30);
        priceFeed.setPrice(address(gold), 2000e30);
        priceFeed.setPrice(address(silver), 25e30);

        // Vault uses linked VaultMath; vm.getCode("Vault.sol:Vault") fails (wrong path + unlinked placeholders).
        address vaultMath = deployCode("VaultMath.sol:VaultMath");
        address vaultAddr = _deployVaultWithLinkedVaultMath(vaultMath);
        IGMXVault gmxVault = IGMXVault(vaultAddr);

        address usdgAddr = deployCode("USDG.sol:USDG", abi.encode(vaultAddr));
        address routerAddr = deployCode("Router.sol:Router", abi.encode(vaultAddr, usdgAddr, address(usdc)));
        address vaultUtilsAddr = deployCode("VaultUtils.sol:VaultUtils", abi.encode(vaultAddr));

        gmxVault.initialize(routerAddr, usdgAddr, pfAddr, 5e30, 600, 600);
        gmxVault.setVaultUtils(vaultUtilsAddr);

        address errCtrl = deployCode("VaultErrorController.sol:VaultErrorController");
        gmxVault.setErrorController(errCtrl);
        _setVaultErrors(errCtrl, vaultAddr);

        gmxVault.setFees(0, 0, 0, 0, 0, 0, 5e30, 0, false);

        gmxVault.setTokenConfig(address(usdc), 6, 10000, 0, 0, true, false);
        gmxVault.setTokenConfig(address(gold), 18, 10000, 0, 0, false, true);
        gmxVault.setTokenConfig(address(silver), 18, 10000, 0, 0, false, true);

        usdc.mint(deployer, 10_000_000e6);
        usdc.transfer(address(gmxVault), 1_000_000e6);
        gmxVault.directPoolDeposit(address(usdc));

        OracleAdapter oracleAdapter = new OracleAdapter(deployer);
        oracleAdapter.setKeeper(deployer, true);

        oracleAdapter.configureAsset(XAU, address(0), IOracleAdapter.FeedType.CustomRelayer, 3600, 5000, 8);
        oracleAdapter.configureAsset(XAG, address(0), IOracleAdapter.FeedType.CustomRelayer, 3600, 5000, 8);
        oracleAdapter.submitPrice(XAU, 200_000_000_000);
        oracleAdapter.submitPrice(XAG, 2_500_000_000);

        VaultAccounting vaultAccounting =
            new VaultAccounting(address(usdc), address(gmxVault), address(oracleAdapter), deployer);
        vaultAccounting.mapAssetToken(XAU, address(gold));
        vaultAccounting.mapAssetToken(XAG, address(silver));

        PricingEngine pricingEngine = new PricingEngine(address(oracleAdapter), deployer);
        FundingRateManager fundingRateManager =
            new FundingRateManager(address(gmxVault), address(oracleAdapter), deployer);
        fundingRateManager.setKeeper(deployer, true);
        fundingRateManager.mapAssetToken(XAU, address(gold));
        fundingRateManager.mapAssetToken(XAG, address(silver));

        PerpReader perpReader = new PerpReader(address(gmxVault), address(oracleAdapter), address(vaultAccounting));

        PriceSync priceSync = new PriceSync(address(oracleAdapter), pfAddr, deployer);
        priceFeed.setKeeper(address(priceSync), true);
        priceSync.addMapping(XAU, address(gold));
        priceSync.addMapping(XAG, address(silver));
        priceSync.syncAll();

        BasketFactory basketFactory = new BasketFactory(address(usdc), address(oracleAdapter), deployer);
        basketFactory.setVaultAccounting(address(vaultAccounting));

        bytes32[] memory assetIds = new bytes32[](2);
        assetIds[0] = XAU;
        assetIds[1] = XAG;
        uint256[] memory weights = new uint256[](2);
        weights[0] = 7000;
        weights[1] = 3000;
        address demoBasket = basketFactory.createBasket("Demo Basket", assetIds, weights, 10, 10);

        vaultAccounting.registerVault(demoBasket);

        vm.stopBroadcast();

        string memory json = _buildJson(
            address(basketFactory),
            address(vaultAccounting),
            address(oracleAdapter),
            address(perpReader),
            address(pricingEngine),
            address(fundingRateManager),
            address(priceSync),
            address(usdc),
            address(gmxVault),
            demoBasket
        );

        string memory outPath = string.concat(vm.projectRoot(), "/apps/web/src/config/local-deployment.json");
        vm.writeFile(outPath, json);

        console2.log("Wrote", outPath);
        console2.log("Demo basket:", demoBasket);
    }

    /// @dev `vm.getCode` cannot load `Vault` while `VaultMath` is unlinked. Deploy the library, patch
    ///      creation bytecode from the compiled artifact, then `CREATE`.
    function _deployVaultWithLinkedVaultMath(address mathLib) internal returns (address addr) {
        string memory json = vm.readFile("out/Vault.sol/Vault.json");
        string memory obj = vm.parseJsonString(json, ".bytecode.object");
        // Marker from `bytecode.linkReferences` (changes if the qualified library path changes).
        string memory ph = "__$36c87766e6d22a740de7496ef4a84155d7$__";
        string memory libHex = _addressToHex40NoPrefix(mathLib);
        string memory linked = vm.replace(obj, ph, libHex);
        bytes memory bytecode = vm.parseBytes(linked);
        assembly ("memory-safe") {
            addr := create(0, add(bytecode, 0x20), mload(bytecode))
        }
        require(addr != address(0), "DeployLocal: Vault create failed");
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

    function _buildJson(
        address basketFactory,
        address vaultAccounting,
        address oracleAdapter,
        address perpReader,
        address pricingEngine,
        address fundingRateManager,
        address priceSync,
        address usdc,
        address gmxVault,
        address demoBasket
    ) internal view returns (string memory) {
        return string.concat(
            "{\n",
            '  "basketFactory": "',
            vm.toString(basketFactory),
            '",\n',
            '  "vaultAccounting": "',
            vm.toString(vaultAccounting),
            '",\n',
            '  "oracleAdapter": "',
            vm.toString(oracleAdapter),
            '",\n',
            '  "perpReader": "',
            vm.toString(perpReader),
            '",\n',
            '  "pricingEngine": "',
            vm.toString(pricingEngine),
            '",\n',
            '  "fundingRateManager": "',
            vm.toString(fundingRateManager),
            '",\n',
            '  "priceSync": "',
            vm.toString(priceSync),
            '",\n',
            '  "usdc": "',
            vm.toString(usdc),
            '",\n',
            '  "gmxVault": "',
            vm.toString(gmxVault),
            '",\n',
            '  "demoBasket": "',
            vm.toString(demoBasket),
            '"\n',
            "}\n"
        );
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
