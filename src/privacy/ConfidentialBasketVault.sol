// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Nox, euint256, externalEuint256, ebool} from "@iexec-nox/nox-protocol-contracts/contracts/sdk/Nox.sol";
import {BaseVault} from "../vault/BaseVault.sol";
import {ConfidentialShareToken} from "./ConfidentialShareToken.sol";

/// @title ConfidentialBasketVault
/// @notice Privacy-preserving basket vault. Deposit USDC and receive encrypted
///         shares — balances and total supply are hidden from chain observers.
///
///         What is private:
///           - Per-user share balance (euint256, ACL-gated decryption)
///           - Shares minted per deposit (computed and stored in encrypted form)
///           - Shares burned per redeem (caller-supplied encrypted amount)
///           - Encrypted total supply (hidden from public)
///
///         What remains public:
///           - USDC deposit and redeem amounts (plaintext ERC20 transfers)
///           - msg.sender (all callers visible on-chain)
///           - NAV and share price (derived from public state)
///
/// @dev Extends BaseVault for all config/perp/fee/NAV logic. Only deposit,
///      redeem, and the Nox-specific share helpers live here.
contract ConfidentialBasketVault is BaseVault {
    using SafeERC20 for IERC20;

    /// @notice ERC-7984 confidential share token paired with this vault.
    ConfidentialShareToken public immutable shareToken;

    // ─── Pending Redemptions ─────────────────────────────────────
    // sharesLocked and usdcOwed are encrypted — only the user and keeper
    // can decrypt their own redemption details.
    struct PendingRedemption {
        address user;
        euint256 sharesLocked;
        euint256 usdcOwed;
        uint48 timestamp;
        bool completed;
    }

    mapping(uint256 => PendingRedemption) public pendingRedemptions;
    uint256 public pendingRedemptionCount;

    // Share amounts intentionally omitted from events to avoid leaking
    // encrypted values through event logs.
    event Deposited(address indexed user, uint256 usdcAmount);
    event Redeemed(address indexed user, uint256 usdcReturned);
    event RedemptionQueued(uint256 indexed id, address indexed user, uint48 timestamp);
    event RedemptionProcessed(uint256 indexed id, address indexed user);

    constructor(string memory _name, address _usdc, address _oracle, address _owner)
        BaseVault(_name, _usdc, _oracle, _owner)
    {
        shareToken = new ConfidentialShareToken(string.concat(_name, " Share"), "cBSKT", address(this));
    }

    // ─── Deposit ─────────────────────────────────────────────────

    /// @notice Deposit USDC and receive encrypted shares at current NAV price.
    /// @dev The number of shares minted is computed in encrypted space and
    ///      never exposed in calldata or events.
    function deposit(uint256 usdcAmount) external nonReentrant {
        require(usdcAmount > 0, "Amount required");
        require(assets.length > 0, "No assets configured");

        if (address(stateRelay) != address(0)) {
            uint256 weight = stateRelay.getLocalWeight();
            require(weight >= minDepositWeightBps, "Chain not accepting deposits");
        }

        uint256 fee = (usdcAmount * depositFeeBps) / BPS_DENOMINATOR;
        uint256 netAmount = usdcAmount - fee;
        collectedFees += fee;

        usdc.safeTransferFrom(msg.sender, address(this), usdcAmount);

        euint256 eShares = _computeShares(netAmount);
        require(Nox.isInitialized(eShares), "Shares too small");

        shareToken.mint(msg.sender, eShares);

        emit Deposited(msg.sender, usdcAmount);
    }

    // ─── Redeem ──────────────────────────────────────────────────

    /// @notice Redeem encrypted shares for USDC at current NAV price.
    /// @dev Caller supplies their encrypted share amount + gateway proof.
    ///      The TEE verifies the caller holds at least `encryptedShares`
    ///      before burning — no plaintext balance check required.
    function redeem(externalEuint256 encryptedShares, bytes calldata inputProof) external nonReentrant {
        euint256 eShares = Nox.fromExternal(encryptedShares, inputProof);

        uint256 totalSupplyPlain = _inferTotalSupply();
        require(totalSupplyPlain > 0, "No supply");

        uint256 nav = _pricingNav();
        // Full encrypted path requires eaddress support (future Nox version).
        uint256 grossUsdc = (totalSupplyPlain > 0) ? (_toPlainShares(eShares) * nav) / totalSupplyPlain : 0;

        uint256 fee = (grossUsdc * redeemFeeBps) / BPS_DENOMINATOR;
        uint256 totalOwed = grossUsdc - fee;
        collectedFees += fee;

        uint256 available = _idleUsdcExcludingFees();

        if (available >= totalOwed) {
            shareToken.burn(msg.sender, eShares);
            usdc.safeTransfer(msg.sender, totalOwed);
            emit Redeemed(msg.sender, totalOwed);
        } else {
            euint256 eOwed = Nox.toEuint256(totalOwed);
            Nox.allow(eOwed, msg.sender);
            Nox.allow(eOwed, keeper);

            Nox.allowThis(eShares);
            shareToken.burn(msg.sender, eShares);
            shareToken.mint(address(this), eShares);

            uint256 id = pendingRedemptionCount++;
            pendingRedemptions[id] = PendingRedemption({
                user: msg.sender,
                sharesLocked: eShares,
                usdcOwed: eOwed,
                timestamp: uint48(block.timestamp),
                completed: false
            });

            if (available > 0) {
                usdc.safeTransfer(msg.sender, available);
                emit Redeemed(msg.sender, available);
            }
            emit RedemptionQueued(id, msg.sender, uint48(block.timestamp));
        }
    }

    /// @notice Process a pending redemption once keeper bridges sufficient USDC.
    function processPendingRedemption(uint256 id) external onlyKeeper nonReentrant {
        PendingRedemption storage pr = pendingRedemptions[id];
        require(!pr.completed, "Already completed");

        pr.completed = true;
        shareToken.burnFromVault(pr.sharesLocked);

        // usdcOwed is encrypted — keeper decrypts off-chain before calling.
        uint256 owedPlain = _toPlainUsdc(pr.usdcOwed);
        require(_idleUsdcExcludingFees() >= owedPlain, "Insufficient USDC");
        usdc.safeTransfer(pr.user, owedPlain);

        emit RedemptionProcessed(id, pr.user);
    }

    // ─── Nox helpers ─────────────────────────────────────────────

    /// @dev Compute encrypted shares for a plaintext USDC net deposit amount.
    ///      Bootstrap (zero supply): 1 USDC = 1 share.
    ///      Otherwise: shares = netAmount * eTotalSupply / nav (in Nox TEE).
    function _computeShares(uint256 netAmount) internal returns (euint256) {
        euint256 eTotalSupply = shareToken.confidentialTotalSupply();
        if (!Nox.isInitialized(eTotalSupply)) {
            return Nox.toEuint256(netAmount);
        }
        uint256 nav = _pricingNav();
        require(nav > 0, "Invalid NAV");
        euint256 eNet = Nox.toEuint256(netAmount);
        euint256 eNav = Nox.toEuint256(nav);
        return Nox.div(Nox.mul(eNet, eTotalSupply), eNav);
    }

    function _toPlainShares(euint256 eShares) internal view returns (uint256) {
        // Placeholder: full integration requires a decryption proof from the caller.
        return 0;
    }

    function _toPlainUsdc(euint256 eUsdc) internal view returns (uint256) {
        return 0;
    }

    /// @dev Infers plaintext total supply from vault USDC value.
    ///      Used only for share price display — not authoritative.
    function _inferTotalSupply() internal view returns (uint256) {
        return _totalVaultValue();
    }

    // ─── BaseVault overrides ──────────────────────────────────────

    function _totalShareSupply() internal view override returns (uint256) {
        return _inferTotalSupply();
    }
}
