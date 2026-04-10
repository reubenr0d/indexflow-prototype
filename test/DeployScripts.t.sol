// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {DeployLocal} from "../script/DeployLocal.s.sol";
import {DeploySepolia} from "../script/DeploySepolia.s.sol";

contract DeployLocalHarness is DeployLocal {
    function exposeBuildJson(Deployed memory d) external view returns (string memory) {
        return _buildJson(d);
    }

    function exposeSetVaultErrors(address errCtrl, address vault) external {
        _setVaultErrors(errCtrl, vault);
    }
}

contract DeploySepoliaHarness is DeploySepolia {
    function exposeBuildJson(Deployed memory d) external view returns (string memory) {
        return _buildJson(d);
    }

    function exposeSetVaultErrors(address errCtrl, address vault) external {
        _setVaultErrors(errCtrl, vault);
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
    DeployLocalHarness internal localHarness;
    DeploySepoliaHarness internal sepoliaHarness;

    function setUp() public {
        localHarness = new DeployLocalHarness();
        sepoliaHarness = new DeploySepoliaHarness();
    }

    function test_buildJson_local_and_sepolia_contains_expected_keys() public view {
        DeployLocal.Deployed memory d1 = DeployLocal.Deployed({
            basketFactory: address(0x1111),
            vaultAccounting: address(0x2222),
            oracleAdapter: address(0x3333),
            perpReader: address(0x4444),
            pricingEngine: address(0x5555),
            fundingRateManager: address(0x6666),
            priceSync: address(0x7777),
            usdc: address(0x8888),
            gmxVault: address(0x9999),
            assetWiring: address(0xAAAA)
        });
        string memory localJson = localHarness.exposeBuildJson(d1);
        assertTrue(_contains(localJson, '"basketFactory"'));
        assertTrue(_contains(localJson, vm.toString(address(0x1111))));
        assertTrue(_contains(localJson, '"assetWiring"'));

        DeploySepolia.Deployed memory d2 = DeploySepolia.Deployed({
            basketFactory: address(0xBBBB),
            vaultAccounting: address(0xCCCC),
            oracleAdapter: address(0xDDDD),
            perpReader: address(0xEEEE),
            pricingEngine: address(0xF001),
            fundingRateManager: address(0xF002),
            priceSync: address(0xF003),
            usdc: address(0xF004),
            gmxVault: address(0xF005),
            assetWiring: address(0xF006)
        });
        string memory sepoliaJson = sepoliaHarness.exposeBuildJson(d2);
        assertTrue(_contains(sepoliaJson, '"vaultAccounting"'));
        assertTrue(_contains(sepoliaJson, vm.toString(address(0xF006))));
    }

    function test_setVaultErrors_pushes_expected_array_shape() public {
        MockErrorControllerCapture cap1 = new MockErrorControllerCapture();
        localHarness.exposeSetVaultErrors(address(cap1), address(0x1234));
        assertEq(cap1.lastLen(), 56);
        assertEq(cap1.first(), "Vault: zero error");
        assertEq(cap1.last(), "Vault: maxGasPrice exceeded");

        MockErrorControllerCapture cap2 = new MockErrorControllerCapture();
        sepoliaHarness.exposeSetVaultErrors(address(cap2), address(0x4321));
        assertEq(cap2.lastLen(), 56);
        assertEq(cap2.first(), "Vault: zero error");
        assertEq(cap2.last(), "Vault: maxGasPrice exceeded");
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
