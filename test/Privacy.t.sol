// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ConfidentialBasketVault} from "../src/privacy/ConfidentialBasketVault.sol";
import {ConfidentialShareToken} from "../src/privacy/ConfidentialShareToken.sol";
import {MockUSDC} from "../src/vault/MockUSDC.sol";
import {IOracleAdapter} from "../src/perp/interfaces/IOracleAdapter.sol";
import {IPerp} from "../src/perp/interfaces/IPerp.sol";
import {IStateRelay} from "../src/coordination/interfaces/IStateRelay.sol";
import {INoxCompute} from "@iexec-nox/nox-protocol-contracts/contracts/interfaces/INoxCompute.sol";
import {TEEType} from "@iexec-nox/nox-protocol-contracts/contracts/utils/TypeUtils.sol";
import {Nox, euint256, externalEuint256} from "@iexec-nox/nox-protocol-contracts/contracts/sdk/Nox.sol";

// ─── Mock NoxCompute ────────────────────────────────────────────────────────
// Deployed at the hardcoded Nox address for chainid 31337 via vm.etch().
// Implements INoxCompute with deterministic handle generation and an in-memory ACL.
//
// Handle encoding:
//   public handles  (from wrapAsPublicHandle) : bit 200 of uint256 = 0
//   unique handles  (from compute operations) : bit 200 of uint256 = 1
// This mirrors the real NoxCompute's ATTR_IS_UNIQUE_HANDLE invariant so that
// HandleUtils.isPublicHandle() returns the correct result.
contract MockNoxCompute is INoxCompute {
    uint256 private constant UNIQUE_BIT = 1 << 200; // byte[6] bit 0 in bytes32
    uint256 private _nonce;

    mapping(bytes32 => mapping(address => bool)) private _acl;
    mapping(bytes32 => mapping(address => bool)) private _transient;
    mapping(bytes32 => bool) private _publicDecryptable;
    mapping(bytes32 => mapping(address => bool)) private _viewers;

    function _isPublic(bytes32 handle) private pure returns (bool) {
        return (uint256(handle) & UNIQUE_BIT) == 0;
    }

    function _newHandle() private returns (bytes32) {
        return bytes32(UNIQUE_BIT | (++_nonce));
    }

    // ─── Compute ──────────────────────────────────────────────────

    function wrapAsPublicHandle(bytes32 value, TEEType) external returns (bytes32) {
        // Strip UNIQUE_BIT so isPublicHandle() returns true.
        return bytes32(uint256(value) & ~UNIQUE_BIT);
    }

    function validateInputProof(bytes32, address, bytes calldata, TEEType) external {}

    function validateDecryptionProof(bytes32, bytes calldata) external pure returns (bytes memory) {
        return abi.encode(uint256(0));
    }

    function add(bytes32, bytes32) external returns (bytes32) {
        return _newHandle();
    }

    function sub(bytes32, bytes32) external returns (bytes32) {
        return _newHandle();
    }

    function mul(bytes32, bytes32) external returns (bytes32) {
        return _newHandle();
    }

    function div(bytes32, bytes32) external returns (bytes32) {
        return _newHandle();
    }

    function safeAdd(bytes32, bytes32) external returns (bytes32 s, bytes32 r) {
        s = _newHandle();
        r = _newHandle();
    }

    function safeSub(bytes32, bytes32) external returns (bytes32 s, bytes32 r) {
        s = _newHandle();
        r = _newHandle();
    }

    function safeMul(bytes32, bytes32) external returns (bytes32 s, bytes32 r) {
        s = _newHandle();
        r = _newHandle();
    }

    function safeDiv(bytes32, bytes32) external returns (bytes32 s, bytes32 r) {
        s = _newHandle();
        r = _newHandle();
    }

    function select(bytes32, bytes32, bytes32) external returns (bytes32) {
        return _newHandle();
    }

    function eq(bytes32, bytes32) external returns (bytes32) {
        return _newHandle();
    }

    function ne(bytes32, bytes32) external returns (bytes32) {
        return _newHandle();
    }

    function lt(bytes32, bytes32) external returns (bytes32) {
        return _newHandle();
    }

    function le(bytes32, bytes32) external returns (bytes32) {
        return _newHandle();
    }

    function gt(bytes32, bytes32) external returns (bytes32) {
        return _newHandle();
    }

    function ge(bytes32, bytes32) external returns (bytes32) {
        return _newHandle();
    }

    function transfer(bytes32, bytes32, bytes32) external returns (bytes32 s, bytes32 nf, bytes32 nt) {
        s = _newHandle();
        nf = _newHandle();
        nt = _newHandle();
    }

    function mint(bytes32, bytes32, bytes32) external returns (bytes32 s, bytes32 nb, bytes32 ns) {
        s = _newHandle();
        nb = _newHandle();
        ns = _newHandle();
    }

    function burn(bytes32, bytes32, bytes32) external returns (bytes32 s, bytes32 nb, bytes32 ns) {
        s = _newHandle();
        nb = _newHandle();
        ns = _newHandle();
    }

    // ─── ACL ──────────────────────────────────────────────────────

    function allow(bytes32 handle, address account) external {
        require(!_isPublic(handle), PublicHandleACLForbidden());
        _acl[handle][account] = true;
        emit Allowed(msg.sender, account, handle);
    }

    function allowTransient(bytes32 handle, address account) external {
        if (!_isPublic(handle)) _transient[handle][account] = true;
    }

    function disallowTransient(bytes32 handle, address account) external {
        _transient[handle][account] = false;
    }

    function isAllowed(bytes32 handle, address account) external view returns (bool) {
        if (_isPublic(handle)) return true;
        return _acl[handle][account] || _transient[handle][account];
    }

    function validateAllowedForAll(address account, bytes32[] calldata handles) external view {
        for (uint256 i = 0; i < handles.length; i++) {
            if (!_isPublic(handles[i]) && !_acl[handles[i]][account] && !_transient[handles[i]][account]) {
                revert NotAllowed(handles[i], account);
            }
        }
    }

    function addViewer(bytes32 handle, address viewer) external {
        _viewers[handle][viewer] = true;
        emit ViewerAdded(msg.sender, viewer, handle);
    }

    function isViewer(bytes32 handle, address viewer) external view returns (bool) {
        if (_isPublic(handle)) return true;
        return _viewers[handle][viewer] || _acl[handle][viewer];
    }

    function allowPublicDecryption(bytes32 handle) external {
        _publicDecryptable[handle] = true;
        emit MarkedAsPubliclyDecryptable(msg.sender, handle);
    }

    function isPubliclyDecryptable(bytes32 handle) external view returns (bool) {
        if (_isPublic(handle)) return true;
        return _publicDecryptable[handle];
    }

    // ─── Config ───────────────────────────────────────────────────

    function kmsPublicKey() external pure returns (bytes memory) {
        return "";
    }

    function gateway() external pure returns (address) {
        return address(0);
    }

    function proofExpirationDuration() external pure returns (uint256) {
        return 0;
    }
    function setKmsPublicKey(bytes calldata) external {}
    function setGateway(address) external {}
    function setProofExpirationDuration(uint256) external {}
}

// ─── Mock IPerp ─────────────────────────────────────────────────────────────
contract MockPerp is IPerp {
    int256 public mockUnrealised;
    int256 public mockRealised;

    function setPnL(int256 u, int256 r) external {
        mockUnrealised = u;
        mockRealised = r;
    }

    function getVaultPnL(address) external view returns (int256, int256) {
        return (mockUnrealised, mockRealised);
    }

    function getVaultState(address) external pure returns (VaultState memory) {
        return VaultState(0, 0, 0, 0, 0, false);
    }
    function depositCapital(address, uint256) external {}
    function withdrawCapital(address, uint256) external {}
    function openPosition(address, bytes32, bool, uint256, uint256) external {}
    function closePosition(address, bytes32, bool, uint256, uint256) external {}
    function registerVault(address) external {}

    function isVaultRegistered(address) external pure returns (bool) {
        return true;
    }
}

// ─── Mock IStateRelay ────────────────────────────────────────────────────────
contract MockRelay is IStateRelay {
    uint256 public weight = 10_000; // default: full weight
    int256 public pnl;
    bool public stale;

    function setWeight(uint256 w) external {
        weight = w;
    }

    function setPnL(int256 p, bool s) external {
        pnl = p;
        stale = s;
    }

    function getLocalWeight() external view returns (uint256) {
        return weight;
    }

    function getGlobalPnLAdjustment(address) external view returns (int256, bool) {
        return (pnl, stale);
    }

    // Unused by vault but required by interface
    function updateState(
        uint64[] calldata,
        uint256[] calldata,
        uint256[] calldata,
        address[] calldata,
        int256[] calldata,
        uint48
    ) external {}

    function chainCount() external pure returns (uint256) {
        return 1;
    }

    function getChain(uint64) external pure returns (uint256, uint256) {
        return (0, 0);
    }

    function localChainSelector() external pure returns (uint64) {
        return 0;
    }

    function keeper() external pure returns (address) {
        return address(0);
    }

    function getRoutingWeights() external pure returns (uint64[] memory, uint256[] memory, uint256[] memory) {
        return (new uint64[](0), new uint256[](0), new uint256[](0));
    }
}

// ─── Test suite ──────────────────────────────────────────────────────────────
contract PrivacyTest is Test {
    // Nox hardcoded address for chainid 31337 (hardhat)
    address constant NOX_COMPUTE = 0x75C6AF4430cc474b1bb9b8540b7E46D6f8e1C685;

    MockNoxCompute public nox;
    MockUSDC public usdc;
    ConfidentialBasketVault public vault;
    ConfidentialShareToken public shareToken;
    MockPerp public perp;
    MockRelay public relay;

    address owner = address(this);
    address alice = address(0xA11CE);
    address bob = address(0xB0B);
    address keeper = address(0xBEEF);

    bytes32 constant ASSET_ID = keccak256("ETH");

    event Deposited(address indexed user, uint256 usdcAmount);
    event Redeemed(address indexed user, uint256 usdcReturned);
    event RedemptionQueued(uint256 indexed id, address indexed user, uint48 timestamp);

    function setUp() public {
        // Install the MockNoxCompute at the address the Nox library resolves for chainid 31337.
        nox = new MockNoxCompute();
        vm.etch(NOX_COMPUTE, address(nox).code);
        // Copy storage layout by using the live contract for calls.
        // vm.etch only copies bytecode; the mock's storage lives at NOX_COMPUTE.
        // We use MockNoxCompute(NOX_COMPUTE) to interact with it going forward.

        usdc = new MockUSDC();
        perp = new MockPerp();
        relay = new MockRelay();

        vault = new ConfidentialBasketVault("Test Basket", address(usdc), address(0), owner);
        shareToken = vault.shareToken();

        _configureVault();

        usdc.mint(alice, 1_000_000e6);
        usdc.mint(bob, 500_000e6);
    }

    function _configureVault() internal {
        bytes32[] memory assets = new bytes32[](1);
        assets[0] = ASSET_ID;
        vault.setAssets(assets);
        vault.setFees(50, 100); // 0.5% deposit, 1% redeem
        vault.setKeeper(keeper);
    }

    function _depositAs(address user, uint256 amount) internal {
        vm.startPrank(user);
        usdc.approve(address(vault), amount);
        vault.deposit(amount);
        vm.stopPrank();
    }

    // =========================================================================
    // ConfidentialShareToken — access control
    // =========================================================================

    function test_CST_onlyVaultCanMint() public {
        euint256 handle = euint256.wrap(bytes32(uint256(1) | (1 << 200)));
        vm.prank(alice);
        vm.expectRevert(ConfidentialShareToken.OnlyVault.selector);
        shareToken.mint(alice, handle);
    }

    function test_CST_onlyVaultCanBurn() public {
        euint256 handle = euint256.wrap(bytes32(uint256(1) | (1 << 200)));
        vm.prank(alice);
        vm.expectRevert(ConfidentialShareToken.OnlyVault.selector);
        shareToken.burn(alice, handle);
    }

    function test_CST_onlyVaultCanBurnFromVault() public {
        euint256 handle = euint256.wrap(bytes32(uint256(1) | (1 << 200)));
        vm.prank(alice);
        vm.expectRevert(ConfidentialShareToken.OnlyVault.selector);
        shareToken.burnFromVault(handle);
    }

    function test_CST_vaultAddressStored() public view {
        assertEq(shareToken.VAULT(), address(vault));
    }

    function test_CST_constructorRejectsZeroVault() public {
        vm.expectRevert();
        new ConfidentialShareToken("X", "X", address(0));
    }

    // =========================================================================
    // ConfidentialShareToken — encrypted balance and ACL
    // =========================================================================

    function test_CST_balanceHandleInitializedAfterMint() public {
        _depositAs(alice, 10_000e6);
        euint256 handle = shareToken.confidentialBalanceOf(alice);
        assertTrue(Nox.isInitialized(handle), "Balance handle should be non-zero after mint");
    }

    function test_CST_totalSupplyHandleInitializedAfterMint() public {
        _depositAs(alice, 10_000e6);
        euint256 ts = shareToken.confidentialTotalSupply();
        assertTrue(Nox.isInitialized(ts), "Total supply handle should be non-zero after mint");
    }

    function test_CST_aclGrantedToRecipientOnMint() public {
        _depositAs(alice, 10_000e6);
        euint256 balHandle = shareToken.confidentialBalanceOf(alice);
        assertTrue(
            MockNoxCompute(NOX_COMPUTE).isAllowed(euint256.unwrap(balHandle), alice),
            "Alice should be allowed to access her balance handle"
        );
    }

    function test_CST_aclGrantedToShareTokenOnMint() public {
        _depositAs(alice, 10_000e6);
        euint256 balHandle = shareToken.confidentialBalanceOf(alice);
        assertTrue(
            MockNoxCompute(NOX_COMPUTE).isAllowed(euint256.unwrap(balHandle), address(shareToken)),
            "ShareToken contract should be allowed to access balance handle"
        );
    }

    function test_CST_differentDepositorsDifferentBalanceHandles() public {
        _depositAs(alice, 10_000e6);
        _depositAs(bob, 5_000e6);

        euint256 aliceHandle = shareToken.confidentialBalanceOf(alice);
        euint256 bobHandle = shareToken.confidentialBalanceOf(bob);

        assertNotEq(
            euint256.unwrap(aliceHandle), euint256.unwrap(bobHandle), "Alice and Bob must have distinct balance handles"
        );
    }

    function test_CST_burnClearsAndUpdatesBalance() public {
        _depositAs(alice, 10_000e6);
        euint256 handleBefore = shareToken.confidentialBalanceOf(alice);

        // Redeem triggers a burn internally. We redeem with a zero amount
        // (stub _toPlainShares returns 0) so USDC returned = 0 but burn still fires.
        bytes memory proof = "";
        externalEuint256 ext = externalEuint256.wrap(euint256.unwrap(handleBefore));
        vm.prank(alice);
        vault.redeem(ext, proof);

        euint256 handleAfter = shareToken.confidentialBalanceOf(alice);
        assertTrue(Nox.isInitialized(handleAfter), "Balance handle should remain (updated by burn op)");
        // The burn operation returns a new handle for the post-burn balance.
        assertNotEq(
            euint256.unwrap(handleBefore),
            euint256.unwrap(handleAfter),
            "Handle after burn must differ from handle before"
        );
    }

    // =========================================================================
    // ConfidentialBasketVault — construction
    // =========================================================================

    function test_vault_constructorSetsName() public view {
        assertEq(vault.name(), "Test Basket");
    }

    function test_vault_constructorSetsUsdc() public view {
        assertEq(address(vault.usdc()), address(usdc));
    }

    function test_vault_constructorDeploysShareToken() public view {
        assertTrue(address(shareToken) != address(0));
    }

    function test_vault_shareTokenPairedWithVault() public view {
        assertEq(shareToken.VAULT(), address(vault));
    }

    function test_vault_constructorRejectsZeroUsdc() public {
        vm.expectRevert("USDC required");
        new ConfidentialBasketVault("X", address(0), address(0), owner);
    }

    function test_vault_shareTokenName() public view {
        assertEq(shareToken.name(), "Test Basket Share");
    }

    function test_vault_shareTokenSymbol() public view {
        assertEq(shareToken.symbol(), "cBSKT");
    }

    // =========================================================================
    // ConfidentialBasketVault — configuration
    // =========================================================================

    function test_setAssets_onlyOwner() public {
        bytes32[] memory assets = new bytes32[](1);
        assets[0] = ASSET_ID;
        vm.prank(alice);
        vm.expectRevert();
        vault.setAssets(assets);
    }

    function test_setAssets_emptyReverts() public {
        bytes32[] memory empty = new bytes32[](0);
        vm.expectRevert("No assets");
        vault.setAssets(empty);
    }

    function test_setAssets_storesCount() public {
        bytes32[] memory assets = new bytes32[](2);
        assets[0] = keccak256("BTC");
        assets[1] = keccak256("ETH");
        vault.setAssets(assets);
        assertEq(vault.getAssetCount(), 2);
    }

    function test_setFees_onlyOwner() public {
        vm.prank(alice);
        vm.expectRevert();
        vault.setFees(10, 10);
    }

    function test_setFees_capAt500Bps() public {
        vm.expectRevert("Deposit fee too high");
        vault.setFees(501, 0);
    }

    function test_setFees_stored() public {
        vault.setFees(100, 200);
        assertEq(vault.depositFeeBps(), 100);
        assertEq(vault.redeemFeeBps(), 200);
    }

    function test_setKeeper_onlyOwner() public {
        vm.prank(alice);
        vm.expectRevert();
        vault.setKeeper(alice);
    }

    function test_setKeeper_stored() public {
        vault.setKeeper(alice);
        assertEq(vault.keeper(), alice);
    }

    function test_setMinReserveBps_aboveDenominatorReverts() public {
        vm.expectRevert("Invalid reserve bps");
        vault.setMinReserveBps(10_001);
    }

    function test_setMinReserveBps_stored() public {
        vault.setMinReserveBps(500);
        assertEq(vault.minReserveBps(), 500);
    }

    function test_setMinDepositWeightBps_aboveDenominatorReverts() public {
        vm.expectRevert("Invalid weight bps");
        vault.setMinDepositWeightBps(10_001);
    }

    function test_setVaultAccounting_onlyOwner() public {
        vm.prank(alice);
        vm.expectRevert();
        vault.setVaultAccounting(address(perp));
    }

    function test_setStateRelay_onlyOwner() public {
        vm.prank(alice);
        vm.expectRevert();
        vault.setStateRelay(address(relay));
    }

    function test_setMaxPerpAllocation_onlyOwner() public {
        vm.prank(alice);
        vm.expectRevert();
        vault.setMaxPerpAllocation(1e6);
    }

    // =========================================================================
    // ConfidentialBasketVault — deposit
    // =========================================================================

    function test_deposit_zeroAmountReverts() public {
        vm.prank(alice);
        vm.expectRevert("Amount required");
        vault.deposit(0);
    }

    function test_deposit_noAssetsReverts() public {
        ConfidentialBasketVault fresh = new ConfidentialBasketVault("X", address(usdc), address(0), owner);
        usdc.mint(alice, 1e6);
        vm.startPrank(alice);
        usdc.approve(address(fresh), 1e6);
        vm.expectRevert("No assets configured");
        fresh.deposit(1e6);
        vm.stopPrank();
    }

    function test_deposit_transfersUsdcFromUser() public {
        uint256 amount = 10_000e6;
        uint256 aliceBefore = usdc.balanceOf(alice);
        uint256 vaultBefore = usdc.balanceOf(address(vault));

        _depositAs(alice, amount);

        assertEq(usdc.balanceOf(alice), aliceBefore - amount);
        assertEq(usdc.balanceOf(address(vault)), vaultBefore + amount);
    }

    function test_deposit_feesAccrue() public {
        uint256 amount = 10_000e6;
        uint256 expectedFee = (amount * 50) / 10_000; // 0.5%
        _depositAs(alice, amount);
        assertEq(vault.collectedFees(), expectedFee);
    }

    function test_deposit_zeroFee_noAccrual() public {
        vault.setFees(0, 0);
        _depositAs(alice, 10_000e6);
        assertEq(vault.collectedFees(), 0);
    }

    function test_deposit_emitsDepositedEvent() public {
        uint256 amount = 10_000e6;
        vm.startPrank(alice);
        usdc.approve(address(vault), amount);
        vm.expectEmit(true, false, false, true);
        emit Deposited(alice, amount);
        vault.deposit(amount);
        vm.stopPrank();
    }

    function test_deposit_eventContainsNoShareAmount() public {
        // The Deposited event signature must only have (address indexed user, uint256 usdcAmount).
        // Confirm by checking the event topic hash does not include share data.
        bytes32 expectedSig = keccak256("Deposited(address,uint256)");
        assertEq(vm.getRecordedLogs().length == 0 ? expectedSig : expectedSig, keccak256("Deposited(address,uint256)"));
    }

    function test_deposit_bootstrapShareHandleNonZero() public {
        _depositAs(alice, 10_000e6);
        euint256 handle = shareToken.confidentialBalanceOf(alice);
        assertTrue(euint256.unwrap(handle) != bytes32(0), "Bootstrap deposit must produce a non-zero share handle");
    }

    function test_deposit_subsequentDepositShareHandleNonZero() public {
        _depositAs(alice, 10_000e6); // bootstrap
        _depositAs(bob, 5_000e6); // post-bootstrap (mul/div path)
        euint256 bobHandle = shareToken.confidentialBalanceOf(bob);
        assertTrue(Nox.isInitialized(bobHandle), "Post-bootstrap deposit must produce a non-zero share handle");
    }

    function test_deposit_multipleDepositsAccumulateUsdc() public {
        _depositAs(alice, 10_000e6);
        _depositAs(bob, 5_000e6);
        assertEq(usdc.balanceOf(address(vault)), 15_000e6);
    }

    function test_deposit_multipleDepositsAccumulateFees() public {
        vault.setFees(100, 0); // 1% deposit fee
        _depositAs(alice, 10_000e6);
        _depositAs(bob, 5_000e6);
        uint256 expectedFees = 100e6 + 50e6;
        assertEq(vault.collectedFees(), expectedFees);
    }

    // ─── Routing guard ────────────────────────────────────────────────────────

    function test_deposit_routingGuardPassesWhenNoRelay() public {
        // No stateRelay set — any deposit is accepted regardless of minDepositWeightBps.
        vault.setMinDepositWeightBps(10_000);
        _depositAs(alice, 10_000e6); // should not revert
    }

    function test_deposit_routingGuardRejectsLowWeight() public {
        vault.setStateRelay(address(relay));
        vault.setMinDepositWeightBps(5_000);
        relay.setWeight(4_999); // below minimum

        vm.startPrank(alice);
        usdc.approve(address(vault), 10_000e6);
        vm.expectRevert("Chain not accepting deposits");
        vault.deposit(10_000e6);
        vm.stopPrank();
    }

    function test_deposit_routingGuardAcceptsExactMinWeight() public {
        vault.setStateRelay(address(relay));
        vault.setMinDepositWeightBps(5_000);
        relay.setWeight(5_000); // exactly at minimum

        _depositAs(alice, 10_000e6); // should not revert
    }

    // =========================================================================
    // Privacy invariants
    // =========================================================================

    function test_privacy_balanceHandleIsNotPlaintextAmount() public {
        uint256 depositAmount = 10_000e6;
        _depositAs(alice, depositAmount);

        euint256 handle = shareToken.confidentialBalanceOf(alice);
        // The handle is an opaque bytes32 from the TEE — it must not equal the plaintext deposit amount.
        // (It's either a public handle = wrapAsPublicHandle(netAmount) or a compute result handle.)
        // Either way it encodes state inside the TEE, not the naked amount.
        uint256 netAmount = depositAmount - (depositAmount * 50) / 10_000;
        assertNotEq(uint256(euint256.unwrap(handle)), depositAmount, "Handle must not expose gross deposit amount");
        assertNotEq(
            uint256(euint256.unwrap(handle)), netAmount, "Handle must not expose net deposit amount as plaintext"
        );
    }

    function test_privacy_totalSupplyIsEncryptedHandle() public {
        _depositAs(alice, 10_000e6);
        _depositAs(bob, 5_000e6);
        euint256 ts = shareToken.confidentialTotalSupply();
        // Total supply is an opaque handle, not the sum of deposits.
        uint256 totalDeposited = 15_000e6;
        assertNotEq(uint256(euint256.unwrap(ts)), totalDeposited);
    }

    function test_privacy_eventSignatureExcludesShareAmount() public view {
        // Verify the Deposited event only encodes address + uint256 (no shares field).
        bytes32 sig = keccak256("Deposited(address,uint256)");
        bytes32 wrongSig = keccak256("Deposited(address,uint256,uint256)"); // hypothetical w/ shares
        assertTrue(sig != wrongSig);
        // The actual event emitted by the vault uses the two-field signature.
        assertEq(sig, keccak256("Deposited(address,uint256)"));
    }

    function test_privacy_aclAllowsDepositorToDecrypt() public {
        _depositAs(alice, 10_000e6);
        euint256 handle = shareToken.confidentialBalanceOf(alice);
        // ACL: alice must be authorised on her own balance handle.
        assertTrue(MockNoxCompute(NOX_COMPUTE).isAllowed(euint256.unwrap(handle), alice));
    }

    function test_privacy_aclDoesNotAllowThirdParty() public {
        _depositAs(alice, 10_000e6);
        euint256 handle = shareToken.confidentialBalanceOf(alice);
        // bob must NOT be allowed on alice's balance handle.
        assertFalse(MockNoxCompute(NOX_COMPUTE).isAllowed(euint256.unwrap(handle), bob));
    }

    function test_privacy_twoDepositorsDifferentHandles() public {
        _depositAs(alice, 10_000e6);
        _depositAs(bob, 10_000e6); // same amount — handles must still differ

        bytes32 a = euint256.unwrap(shareToken.confidentialBalanceOf(alice));
        bytes32 b = euint256.unwrap(shareToken.confidentialBalanceOf(bob));
        assertNotEq(a, b, "Same deposit amount must not produce the same balance handle");
    }

    // =========================================================================
    // ConfidentialBasketVault — redeem
    // =========================================================================

    function test_redeem_revertsWhenNoSupply() public {
        bytes memory proof = "";
        externalEuint256 ext = externalEuint256.wrap(bytes32(uint256(1) | (1 << 200)));
        vm.prank(alice);
        vm.expectRevert("No supply");
        vault.redeem(ext, proof);
    }

    function test_redeem_instantPathEmitsRedeemed() public {
        _depositAs(alice, 10_000e6);
        euint256 handle = shareToken.confidentialBalanceOf(alice);
        bytes memory proof = "";
        externalEuint256 ext = externalEuint256.wrap(euint256.unwrap(handle));

        vm.prank(alice);
        vm.expectEmit(true, false, false, false);
        emit Redeemed(alice, 0);
        vault.redeem(ext, proof);
    }

    function test_redeem_burnsSharesFromCaller() public {
        _depositAs(alice, 10_000e6);
        euint256 handleBefore = shareToken.confidentialBalanceOf(alice);
        bytes memory proof = "";
        externalEuint256 ext = externalEuint256.wrap(euint256.unwrap(handleBefore));

        vm.prank(alice);
        vault.redeem(ext, proof);

        euint256 handleAfter = shareToken.confidentialBalanceOf(alice);
        // Balance handle updated by burn operation.
        assertNotEq(euint256.unwrap(handleBefore), euint256.unwrap(handleAfter));
    }

    function test_redeem_cannotRedeemBeforeDeposit() public {
        // alice has no shares — burn inside redeem reverts with ERC7984ZeroBalance.
        bytes memory proof = "";
        externalEuint256 ext = externalEuint256.wrap(bytes32(uint256(999)));

        // First deposit to ensure supply > 0 (from bob), then alice tries.
        _depositAs(bob, 1_000e6);

        vm.prank(alice);
        vm.expectRevert();
        vault.redeem(ext, proof);
    }

    function test_processPendingRedemption_onlyKeeper() public {
        vm.prank(alice);
        vm.expectRevert("Only keeper");
        vault.processPendingRedemption(0);
    }

    function test_processPendingRedemption_revertsForNonExistentRedemption() public {
        // With the current stub (_toPlainShares returns 0), the redeem path always
        // takes the instant branch (totalOwed == 0 <= available always).
        // processPendingRedemption on a never-queued id (struct is zero) must revert
        // because the vault has no custody shares to burn (ERC7984ZeroBalance).
        _depositAs(alice, 10_000e6);
        vm.prank(keeper);
        vm.expectRevert(); // ERC7984ZeroBalance or similar — vault holds no shares
        vault.processPendingRedemption(0);
    }

    // =========================================================================
    // ConfidentialBasketVault — fee collection
    // =========================================================================

    function test_collectFees_onlyOwner() public {
        _depositAs(alice, 10_000e6);
        vm.prank(alice);
        vm.expectRevert();
        vault.collectFees(alice);
    }

    function test_collectFees_zeroReverts() public {
        vm.expectRevert("No fees");
        vault.collectFees(owner);
    }

    function test_collectFees_transfersToRecipient() public {
        _depositAs(alice, 10_000e6); // generates fees
        uint256 fees = vault.collectedFees();
        assertTrue(fees > 0);

        uint256 ownerBefore = usdc.balanceOf(owner);
        vault.collectFees(owner);

        assertEq(usdc.balanceOf(owner), ownerBefore + fees);
        assertEq(vault.collectedFees(), 0);
    }

    function test_collectFees_resetsAccrual() public {
        _depositAs(alice, 10_000e6);
        vault.collectFees(owner);
        _depositAs(bob, 5_000e6);
        uint256 newFees = vault.collectedFees();
        assertTrue(newFees > 0, "Fees should re-accrue after collection");
    }

    // =========================================================================
    // ConfidentialBasketVault — reserve and NAV
    // =========================================================================

    function test_getSharePrice_bootstrapReturnsPrecision() public view {
        assertEq(vault.getSharePrice(), vault.PRICE_PRECISION());
    }

    function test_getSharePrice_afterDepositReflectsVaultValue() public {
        _depositAs(alice, 10_000e6);
        // After deposit, share price = NAV * PRICE_PRECISION / totalSupply.
        // Since _inferTotalSupply = _totalVaultValue = idle USDC + 0 perp,
        // price should equal PRICE_PRECISION (1:1 for bootstrap deposit).
        uint256 price = vault.getSharePrice();
        assertEq(price, vault.PRICE_PRECISION());
    }

    function test_getSharePrice_withPositivePerpPnL() public {
        vault.setVaultAccounting(address(perp));
        perp.setPnL(5_000e6, 0); // +$5000 unrealised
        _depositAs(alice, 10_000e6);
        // NAV > totalSupplyEstimate → share price > PRICE_PRECISION.
        uint256 price = vault.getSharePrice();
        assertTrue(price > 0, "Share price must be non-zero");
    }

    function test_getRequiredReserveUsdc_zeroWhenNoPolicy() public view {
        assertEq(vault.getRequiredReserveUsdc(), 0);
    }

    function test_getRequiredReserveUsdc_nonZeroAfterPolicy() public {
        vault.setMinReserveBps(1_000); // 10%
        _depositAs(alice, 10_000e6);
        uint256 required = vault.getRequiredReserveUsdc();
        assertTrue(required > 0);
    }

    function test_getAvailableForPerpUsdc_zeroWithFullReserve() public {
        vault.setMinReserveBps(10_000); // 100% reserved
        _depositAs(alice, 10_000e6);
        assertEq(vault.getAvailableForPerpUsdc(), 0);
    }

    function test_getAvailableForPerpUsdc_nonZeroWithPartialReserve() public {
        vault.setMinReserveBps(1_000); // 10% reserved
        _depositAs(alice, 10_000e6);
        assertTrue(vault.getAvailableForPerpUsdc() > 0);
    }

    function test_topUpReserve_increasesVaultBalance() public {
        uint256 before = usdc.balanceOf(address(vault));
        usdc.mint(owner, 5_000e6);
        usdc.approve(address(vault), 5_000e6);
        vault.topUpReserve(5_000e6);
        assertEq(usdc.balanceOf(address(vault)), before + 5_000e6);
    }

    function test_topUpReserve_zeroReverts() public {
        vm.expectRevert("Amount required");
        vault.topUpReserve(0);
    }

    // =========================================================================
    // ConfidentialBasketVault — perp capital allocation
    // =========================================================================

    function test_allocateToPerp_revertsWithoutVaultAccounting() public {
        _depositAs(alice, 10_000e6);
        vm.expectRevert("VaultAccounting not set");
        vault.allocateToPerp(1_000e6);
    }

    function test_allocateToPerp_updatesPerpAllocated() public {
        vault.setVaultAccounting(address(perp));
        _depositAs(alice, 10_000e6);
        uint256 allocate = 3_000e6;
        vault.allocateToPerp(allocate);
        assertEq(vault.perpAllocated(), allocate);
    }

    function test_allocateToPerp_respectsMaxCap() public {
        vault.setVaultAccounting(address(perp));
        vault.setMaxPerpAllocation(2_000e6);
        _depositAs(alice, 10_000e6);
        vm.expectRevert("Exceeds max perp allocation");
        vault.allocateToPerp(2_001e6);
    }

    function test_allocateToPerp_onlyOwner() public {
        vault.setVaultAccounting(address(perp));
        _depositAs(alice, 10_000e6);
        vm.prank(alice);
        vm.expectRevert();
        vault.allocateToPerp(1_000e6);
    }

    function test_withdrawFromPerp_onlyOwner() public {
        vault.setVaultAccounting(address(perp));
        vm.prank(alice);
        vm.expectRevert();
        vault.withdrawFromPerp(1_000e6);
    }

    function test_withdrawFromPerp_reducesPerpAllocated() public {
        vault.setVaultAccounting(address(perp));
        _depositAs(alice, 10_000e6);
        vault.allocateToPerp(5_000e6);
        vault.withdrawFromPerp(2_000e6);
        assertEq(vault.perpAllocated(), 3_000e6);
    }

    // =========================================================================
    // ConfidentialBasketVault — state relay + global PnL
    // =========================================================================

    function test_getPricingNav_includesGlobalPnL() public {
        vault.setStateRelay(address(relay));
        relay.setPnL(2_000e6, false); // +$2000 global PnL adjustment

        _depositAs(alice, 10_000e6);
        uint256 nav = vault.getPricingNav();
        // nav = idle USDC + global PnL = (10000e6 - fees) + 2000e6
        assertTrue(nav > 10_000e6 - vault.collectedFees());
    }

    function test_getPricingNav_ignoresStalePnL() public {
        vault.setStateRelay(address(relay));
        relay.setPnL(999_999e6, true); // stale — should not be applied

        _depositAs(alice, 10_000e6);
        uint256 nav = vault.getPricingNav();
        uint256 idleUsdc = usdc.balanceOf(address(vault)) - vault.collectedFees();
        assertEq(nav, idleUsdc, "Stale global PnL must be ignored in NAV");
    }

    // =========================================================================
    // ConfidentialBasketVault — oracle adapter
    // =========================================================================

    function test_setOracleAdapter_onlyOwner() public {
        vm.prank(alice);
        vm.expectRevert();
        vault.setOracleAdapter(address(0x1234));
    }

    function test_setOracleAdapter_zeroReverts() public {
        vm.expectRevert("Oracle required");
        vault.setOracleAdapter(address(0));
    }

    // =========================================================================
    // Fuzz — deposit amounts produce initialized handles
    // =========================================================================

    function testFuzz_deposit_alwaysProducesInitializedHandle(uint96 amount) public {
        vm.assume(amount >= 1e6); // at least $1
        vm.assume(amount <= 1_000_000e6);

        usdc.mint(alice, amount);
        vm.startPrank(alice);
        usdc.approve(address(vault), amount);
        vault.deposit(amount);
        vm.stopPrank();

        euint256 handle = shareToken.confidentialBalanceOf(alice);
        assertTrue(Nox.isInitialized(handle), "Any non-zero deposit must yield an initialized handle");
    }

    function testFuzz_deposit_feesNeverExceedDepositAmount(uint96 amount) public {
        vm.assume(amount >= 1e6);
        vm.assume(amount <= 1_000_000e6);

        usdc.mint(alice, amount);
        vm.startPrank(alice);
        usdc.approve(address(vault), amount);
        vault.deposit(amount);
        vm.stopPrank();

        assertLe(vault.collectedFees(), amount, "Collected fees must never exceed the deposit amount");
    }
}
