// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {Deploy} from "../script/Deploy.s.sol";

contract DeployHarness is Deploy {
    function exposeBuildJson(Deployed memory d) external view returns (string memory) {
        return _buildJson(d);
    }

    function exposeSetVaultErrors(address errCtrl, address vault) external {
        _setVaultErrors(errCtrl, vault);
    }

    function exposeInitialUsdcBuffer() external pure returns (uint256) {
        return INITIAL_USDC_BUFFER;
    }

    function exposeInitialGmxMint() external pure returns (uint256) {
        return INITIAL_GMX_MINT;
    }

    function exposeInitialGmxPoolSeed() external pure returns (uint256) {
        return INITIAL_GMX_POOL_SEED;
    }
}

contract MockErrorControllerCapture {
    uint256 public lastLen;
    string public first;
    string public last;

    function setErrors(address, string[] calldata errors) external {
        lastLen = errors.length;
        if (errors.length > 0) {
            first = errors[0];
            last = errors[errors.length - 1];
        }
    }
}

contract DeployScriptsTest is Test {
    DeployHarness internal harness;

    function setUp() public {
        harness = new DeployHarness();
    }

    function test_buildJson_contains_expected_keys() public view {
        Deploy.Deployed memory d = Deploy.Deployed({
            basketFactory: address(0x1111),
            vaultAccounting: address(0x2222),
            oracleAdapter: address(0x3333),
            perpReader: address(0x4444),
            pricingEngine: address(0x5555),
            fundingRateManager: address(0x6666),
            priceSync: address(0x7777),
            usdc: address(0x8888),
            gmxVault: address(0x9999),
            assetWiring: address(0xAAAA),
            stateRelay: address(0xBBBB)
        });
        string memory json = harness.exposeBuildJson(d);
        assertTrue(_contains(json, '"basketFactory"'));
        assertTrue(_contains(json, vm.toString(address(0x1111))));
        assertTrue(_contains(json, '"assetWiring"'));
        assertTrue(_contains(json, '"vaultAccounting"'));
        assertTrue(_contains(json, '"stateRelay"'));
        assertTrue(_contains(json, vm.toString(address(0xBBBB))));
    }

    function test_setVaultErrors_pushes_expected_array_shape() public {
        MockErrorControllerCapture cap = new MockErrorControllerCapture();
        harness.exposeSetVaultErrors(address(cap), address(0x1234));
        assertEq(cap.lastLen(), 56);
        assertEq(cap.first(), "Vault: zero error");
        assertEq(cap.last(), "Vault: maxGasPrice exceeded");
    }

    function test_hub_seed_constants_remain_expected() public view {
        assertEq(harness.exposeInitialGmxMint(), 10_000_000e6);
        assertEq(harness.exposeInitialGmxPoolSeed(), 1_000_000e6);
        assertEq(harness.exposeInitialUsdcBuffer(), 200_000e6);
    }

    function _contains(string memory text, string memory needle) internal pure returns (bool) {
        bytes memory hay = bytes(text);
        bytes memory ndl = bytes(needle);
        if (ndl.length == 0) return true;
        if (ndl.length > hay.length) return false;

        for (uint256 i = 0; i <= hay.length - ndl.length; i++) {
            bool ok = true;
            for (uint256 j = 0; j < ndl.length; j++) {
                if (hay[i + j] != ndl[j]) {
                    ok = false;
                    break;
                }
            }
            if (ok) return true;
        }
        return false;
    }
}
