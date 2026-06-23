// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {BaseVault} from "./BaseVault.sol";
import {BasketShareToken} from "./BasketShareToken.sol";
import {IRWAReserveAdapter} from "../rwa/IRWAReserveAdapter.sol";

/// @title BasketVault
/// @notice Basket vault with perp-driven pricing: deposit USDC, mint shares priced from mark-to-market NAV.
/// @dev Continuous deposit/redeem. Extends BaseVault for all shared config/perp/fee/NAV logic.
contract BasketVault is BaseVault {
    using SafeERC20 for IERC20;

    /// @notice ERC20 shares minted by this vault.
    BasketShareToken public immutable shareToken;

    // ─── RWA Reserve ─────────────────────────────────────────────
    IRWAReserveAdapter public rwaAdapter;
    uint256 public rwaTargetBps;

    // ─── Pending Redemptions ─────────────────────────────────────
    struct PendingRedemption {
        address user;
        uint256 sharesLocked;
        uint256 usdcOwed;
        uint48 timestamp;
        bool completed;
    }

    mapping(uint256 => PendingRedemption) public pendingRedemptions;
    uint256 public pendingRedemptionCount;
    uint256 public pendingRedemptionsUsdc;

    event Deposited(address indexed user, uint256 usdcAmount, uint256 sharesMinted);
    event Redeemed(address indexed user, uint256 sharesBurned, uint256 usdcReturned);
    event RedemptionQueued(uint256 indexed id, address indexed user, uint256 sharesLocked, uint256 usdcOwed);
    event RedemptionProcessed(uint256 indexed id, address indexed user, uint256 usdcPaid);
    event AllocatedToRWA(uint256 usdcAmount, uint256 reserveOut);
    event WithdrawnFromRWA(uint256 usdcAmount);
    event RWAAdapterSet(address indexed adapter);
    event RWATargetBpsUpdated(uint256 bps);
    event ReserveTokenRotated(uint8 indexed oldToken, uint8 indexed newToken);
    event RWAYieldHarvested(uint256 reserveValueUsdc);

    constructor(string memory _name, address _usdc, address _oracleAdapter, address _owner)
        BaseVault(_name, _usdc, _oracleAdapter, _owner)
    {
        string memory tokenName = string.concat(_name, " Share");
        shareToken = new BasketShareToken(tokenName, "BSKT", address(this));
    }

    // ─── Deposit / Redeem ────────────────────────────────────────

    function deposit(uint256 usdcAmount) external nonReentrant returns (uint256 sharesMinted) {
        require(usdcAmount > 0, "Amount required");
        require(assets.length > 0, "No assets configured");

        if (address(stateRelay) != address(0)) {
            uint256 weight = stateRelay.getLocalWeight();
            require(weight >= minDepositWeightBps, "Chain not accepting deposits");
        }

        uint256 totalSupply = shareToken.totalSupply();
        uint256 navBefore = _pricingNav();

        uint256 fee = (usdcAmount * depositFeeBps) / BPS_DENOMINATOR;
        uint256 netAmount = usdcAmount - fee;
        collectedFees += fee;

        usdc.safeTransferFrom(msg.sender, address(this), usdcAmount);

        if (totalSupply == 0) {
            sharesMinted = netAmount;
        } else {
            require(navBefore > 0, "Invalid NAV");
            sharesMinted = (netAmount * totalSupply) / navBefore;
        }
        require(sharesMinted > 0, "Shares too small");

        shareToken.mint(msg.sender, sharesMinted);

        emit Deposited(msg.sender, usdcAmount, sharesMinted);
    }

    function redeem(uint256 sharesToBurn) external nonReentrant returns (uint256 usdcReturned) {
        require(sharesToBurn > 0, "Amount required");
        require(shareToken.balanceOf(msg.sender) >= sharesToBurn, "Insufficient shares");

        uint256 totalSupply = shareToken.totalSupply();
        require(totalSupply > 0, "No supply");

        uint256 grossAmount = (sharesToBurn * _pricingNav()) / totalSupply;
        uint256 fee = (grossAmount * redeemFeeBps) / BPS_DENOMINATOR;
        uint256 totalOwed = grossAmount - fee;
        collectedFees += fee;

        uint256 available = _idleUsdcExcludingFees();

        if (available >= totalOwed) {
            shareToken.burn(msg.sender, sharesToBurn);
            usdc.safeTransfer(msg.sender, totalOwed);
            emit Redeemed(msg.sender, sharesToBurn, totalOwed);
            return totalOwed;
        }

        uint256 partialShares;
        if (available > 0) {
            partialShares = (sharesToBurn * available) / totalOwed;
            if (partialShares > 0) {
                shareToken.burn(msg.sender, partialShares);
                usdc.safeTransfer(msg.sender, available);
                emit Redeemed(msg.sender, partialShares, available);
            }
        }

        uint256 remainderShares = sharesToBurn - partialShares;
        uint256 remainderUsdc = totalOwed - available;

        shareToken.transferFrom(msg.sender, address(this), remainderShares);
        uint256 id = pendingRedemptionCount++;
        pendingRedemptions[id] = PendingRedemption({
            user: msg.sender,
            sharesLocked: remainderShares,
            usdcOwed: remainderUsdc,
            timestamp: uint48(block.timestamp),
            completed: false
        });
        pendingRedemptionsUsdc += remainderUsdc;
        emit RedemptionQueued(id, msg.sender, remainderShares, remainderUsdc);

        return available;
    }

    function processPendingRedemption(uint256 id) external onlyKeeper nonReentrant {
        PendingRedemption storage pr = pendingRedemptions[id];
        require(!pr.completed, "Already completed");
        require(_idleUsdcExcludingFees() >= pr.usdcOwed, "Insufficient bridged USDC");

        pr.completed = true;
        if (pendingRedemptionsUsdc >= pr.usdcOwed) {
            pendingRedemptionsUsdc -= pr.usdcOwed;
        } else {
            pendingRedemptionsUsdc = 0;
        }
        shareToken.burn(address(this), pr.sharesLocked);
        usdc.safeTransfer(pr.user, pr.usdcOwed);

        emit RedemptionProcessed(id, pr.user, pr.usdcOwed);
    }

    // ─── RWA Configuration ───────────────────────────────────────

    function setRWAAdapter(address _rwaAdapter) external onlyOwner {
        if (_rwaAdapter != address(0)) {
            require(
                IRWAReserveAdapter(_rwaAdapter).vault() == address(this),
                "Adapter not bound to this vault"
            );
        }
        rwaAdapter = IRWAReserveAdapter(_rwaAdapter);
        emit RWAAdapterSet(_rwaAdapter);
    }

    function setRWATargetBps(uint256 bps) external onlyOwner {
        require(bps <= BPS_DENOMINATOR, "Invalid RWA target bps");
        rwaTargetBps = bps;
        emit RWATargetBpsUpdated(bps);
    }

    // ─── RWA Actions ─────────────────────────────────────────────

    function allocateToRWA(uint256 amount) external onlyOwner nonReentrant {
        require(address(rwaAdapter) != address(0), "RWA adapter not set");
        require(amount > 0, "Amount required");
        require(amount <= _idleUsdcExcludingFees(), "Insufficient idle USDC");
        usdc.safeIncreaseAllowance(address(rwaAdapter), amount);
        uint256 reserveOut = rwaAdapter.deposit(amount);
        emit AllocatedToRWA(amount, reserveOut);
    }

    function withdrawFromRWA(uint256 amount) external onlyOwner nonReentrant {
        require(address(rwaAdapter) != address(0), "RWA adapter not set");
        require(amount > 0, "Amount required");
        uint256 usdcDelivered = rwaAdapter.withdraw(amount);
        emit WithdrawnFromRWA(usdcDelivered);
    }

    function rotateReserveToken(uint8 newToken) external onlyOwner nonReentrant {
        require(address(rwaAdapter) != address(0), "RWA adapter not set");
        IRWAReserveAdapter.ReserveToken oldEnum = rwaAdapter.reserveToken();
        rwaAdapter.setReserveToken(IRWAReserveAdapter.ReserveToken(newToken));
        emit ReserveTokenRotated(uint8(oldEnum), newToken);
    }

    function harvestRWAYield() external nonReentrant {
        require(address(rwaAdapter) != address(0), "RWA adapter not set");
        uint256 valueUsdc = rwaAdapter.getReserveValueUsdc();
        emit RWAYieldHarvested(valueUsdc);
    }

    // ─── BaseVault overrides ──────────────────────────────────────

    function _rwaReserveValue() internal view override returns (uint256) {
        if (address(rwaAdapter) != address(0)) return rwaAdapter.getReserveValueUsdc();
        return 0;
    }

    function _totalShareSupply() internal view override returns (uint256) {
        return shareToken.totalSupply();
    }
}
