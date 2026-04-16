// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {BasketShareToken} from "./BasketShareToken.sol";
import {IOracleAdapter} from "../perp/interfaces/IOracleAdapter.sol";
import {IPerp} from "../perp/interfaces/IPerp.sol";
import {IStateRelay} from "../coordination/interfaces/IStateRelay.sol";

/// @title BasketVault
/// @notice Basket vault with perp-driven pricing: deposit USDC, mint shares priced from mark-to-market NAV.
/// @dev Continuous deposit/redeem. Share pricing uses on-vault USDC (excluding reserved fees), `perpAllocated`,
/// and perp PnL from `VaultAccounting` when available.
contract BasketVault is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    /// @notice Basis points denominator for weights and fees (10000 = 100%).
    uint256 public constant BPS_DENOMINATOR = 10_000;
    /// @notice Price scalar matching oracle adapter (1e30 per 1e6 USDC share).
    uint256 public constant PRICE_PRECISION = 1e30;

    /// @notice One configured basket asset id.
    /// @param assetId Oracle asset id.
    struct AssetAllocation {
        bytes32 assetId;
    }

    /// @notice Collateral token (USDC).
    IERC20 public immutable usdc;
    /// @notice ERC20 shares minted by this vault.
    BasketShareToken public immutable shareToken;

    /// @notice Oracle for basket composition pricing.
    IOracleAdapter public oracleAdapter;
    /// @notice Perp capital bridge (optional until set).
    IPerp public vaultAccounting;
    /// @notice Cross-chain state relay for routing weights and global PnL adjustments.
    IStateRelay public stateRelay;

    AssetAllocation[] public assets;

    /// @notice Deposit fee in bps taken from gross USDC.
    uint256 public depositFeeBps;
    /// @notice Redeem fee in bps taken from gross USDC out.
    uint256 public redeemFeeBps;
    /// @notice Fees reserved in vault balance until `collectFees`.
    uint256 public collectedFees;

    /// @notice USDC sent to `vaultAccounting` via `allocateToPerp` (book entry).
    uint256 public perpAllocated;
    /// @notice Max `perpAllocated`; 0 means no cap.
    uint256 public maxPerpAllocation;
    /// @notice Minimum idle reserve target in basis points over total vault value.
    uint256 public minReserveBps;

    /// @notice Minimum local routing weight (bps) for deposits to be accepted.
    /// 0 = accept deposits regardless of weight (backward compat).
    uint256 public minDepositWeightBps;

    /// @notice Authorised keeper for cross-chain redemption processing.
    address public keeper;

    /// @notice Human-readable basket name.
    string public name;

    // ─── Pending Redemptions ────────────────────────────────────
    struct PendingRedemption {
        address user;
        uint256 sharesLocked;
        uint256 usdcOwed;
        uint48 timestamp;
        bool completed;
    }

    mapping(uint256 => PendingRedemption) public pendingRedemptions;
    uint256 public pendingRedemptionCount;

    event Deposited(address indexed user, uint256 usdcAmount, uint256 sharesMinted);
    event Redeemed(address indexed user, uint256 sharesBurned, uint256 usdcReturned);
    event RedemptionQueued(uint256 indexed id, address indexed user, uint256 sharesLocked, uint256 usdcOwed);
    event RedemptionProcessed(uint256 indexed id, address indexed user, uint256 usdcPaid);
    event AllocatedToPerp(uint256 amount);
    event WithdrawnFromPerp(uint256 amount);
    event AssetsUpdated(uint256 assetCount);
    event FeesCollected(address indexed to, uint256 amount);
    event ReservePolicyUpdated(uint256 minReserveBps);
    event ReserveToppedUp(address indexed from, uint256 amount);

    modifier onlyKeeper() {
        require(msg.sender == keeper, "Only keeper");
        _;
    }

    /// @param _name Basket display name (also used for share token name).
    /// @param _usdc USDC address.
    /// @param _oracleAdapter `OracleAdapter` address.
    /// @param _owner Ownable admin.
    constructor(string memory _name, address _usdc, address _oracleAdapter, address _owner) Ownable(_owner) {
        require(_usdc != address(0), "USDC required");

        name = _name;
        usdc = IERC20(_usdc);
        if (_oracleAdapter != address(0)) {
            oracleAdapter = IOracleAdapter(_oracleAdapter);
        }

        string memory tokenName = string.concat(_name, " Share");
        shareToken = new BasketShareToken(tokenName, "BSKT", address(this));
    }

    // ─── Configuration ───────────────────────────────────────────

    /// @notice Replace configured basket assets; each asset must be active on the oracle
    /// (validation skipped on spokes where oracleAdapter is not set).
    /// @param assetIds Oracle asset ids.
    function setAssets(bytes32[] calldata assetIds) external onlyOwner {
        require(assetIds.length > 0, "No assets");

        delete assets;
        for (uint256 i = 0; i < assetIds.length; i++) {
            if (address(oracleAdapter) != address(0)) {
                require(oracleAdapter.isAssetActive(assetIds[i]), "Asset not active in oracle");
            }
            assets.push(AssetAllocation({assetId: assetIds[i]}));
        }

        emit AssetsUpdated(assetIds.length);
    }

    /// @notice Set deposit and redeem fees (max 500 bps each).
    /// @param _depositFeeBps Fee on deposit gross amount.
    /// @param _redeemFeeBps Fee on redeem gross USDC.
    function setFees(uint256 _depositFeeBps, uint256 _redeemFeeBps) external onlyOwner {
        require(_depositFeeBps <= 500, "Deposit fee too high");
        require(_redeemFeeBps <= 500, "Redeem fee too high");
        depositFeeBps = _depositFeeBps;
        redeemFeeBps = _redeemFeeBps;
    }

    /// @notice Wire `VaultAccounting` (`IPerp`) for perp allocation calls.
    /// @param _vaultAccounting Perp module address (may be zero to unset).
    function setVaultAccounting(address _vaultAccounting) external onlyOwner {
        vaultAccounting = IPerp(_vaultAccounting);
    }

    /// @notice Point to a new oracle adapter (e.g. upgrade).
    /// @param _oracleAdapter New adapter address.
    function setOracleAdapter(address _oracleAdapter) external onlyOwner {
        require(_oracleAdapter != address(0), "Oracle required");
        oracleAdapter = IOracleAdapter(_oracleAdapter);
    }

    /// @notice Cap total USDC that may be allocated to perp; 0 disables the cap.
    /// @param cap Max `perpAllocated`.
    function setMaxPerpAllocation(uint256 cap) external onlyOwner {
        maxPerpAllocation = cap;
    }

    /// @notice Set minimum idle reserve target used to gate `allocateToPerp`.
    /// @param bps Reserve target in basis points (0..10000).
    function setMinReserveBps(uint256 bps) external onlyOwner {
        require(bps <= BPS_DENOMINATOR, "Invalid reserve bps");
        minReserveBps = bps;
        emit ReservePolicyUpdated(bps);
    }

    /// @notice Wire the cross-chain state relay for routing weights and global NAV.
    /// @param _stateRelay StateRelay address (may be zero to unset).
    function setStateRelay(address _stateRelay) external onlyOwner {
        stateRelay = IStateRelay(_stateRelay);
    }

    /// @notice Set the keeper address authorised to process pending redemptions.
    /// @param _keeper Keeper address (may be zero to unset).
    function setKeeper(address _keeper) external onlyOwner {
        keeper = _keeper;
    }

    /// @notice Minimum local routing weight (bps) required for deposits. 0 = no restriction.
    /// @param bps Threshold in basis points.
    function setMinDepositWeightBps(uint256 bps) external onlyOwner {
        require(bps <= BPS_DENOMINATOR, "Invalid weight bps");
        minDepositWeightBps = bps;
    }

    // ─── Deposit / Redeem ────────────────────────────────────────

    /// @notice Deposit USDC and receive basket shares at current NAV-based share price.
    /// @param usdcAmount Gross USDC to deposit (fee deducted before minting).
    /// @return sharesMinted Shares minted to `msg.sender` (6 decimals).
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
            // Bootstrap at 1 USDC per share (both use 6 decimals).
            sharesMinted = netAmount;
        } else {
            require(navBefore > 0, "Invalid NAV");
            sharesMinted = (netAmount * totalSupply) / navBefore;
        }
        require(sharesMinted > 0, "Shares too small");

        shareToken.mint(msg.sender, sharesMinted);

        emit Deposited(msg.sender, usdcAmount, sharesMinted);
    }

    /// @notice Redeem basket shares for USDC at current NAV-based share price.
    /// If local reserves are insufficient, fills what it can and queues the remainder
    /// as a pending redemption for keeper-driven cross-chain fill.
    /// @param sharesToBurn Shares to burn from `msg.sender`.
    /// @return usdcReturned Net USDC paid out immediately (may be less than full owed amount).
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

        // Partial fill from local reserves + queue remainder
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
        emit RedemptionQueued(id, msg.sender, remainderShares, remainderUsdc);

        return available;
    }

    /// @notice Process a pending redemption after keeper bridges sufficient USDC.
    /// @param id Pending redemption id.
    function processPendingRedemption(uint256 id) external onlyKeeper nonReentrant {
        PendingRedemption storage pr = pendingRedemptions[id];
        require(!pr.completed, "Already completed");
        require(_idleUsdcExcludingFees() >= pr.usdcOwed, "Insufficient bridged USDC");

        pr.completed = true;
        shareToken.burn(address(this), pr.sharesLocked);
        usdc.safeTransfer(pr.user, pr.usdcOwed);

        emit RedemptionProcessed(id, pr.user, pr.usdcOwed);
    }

    // ─── Perp Capital Allocation ─────────────────────────────────

    /// @notice Allocate vault USDC to the perp module as deposited capital for this vault.
    /// @param amount USDC to move; increases `perpAllocated`.
    /// @dev Requires `vaultAccounting` set; respects `maxPerpAllocation` if nonzero.
    function allocateToPerp(uint256 amount) external onlyOwner nonReentrant {
        require(address(vaultAccounting) != address(0), "VaultAccounting not set");
        uint256 available = getAvailableForPerpUsdc();
        require(amount <= available, "Insufficient balance");

        if (maxPerpAllocation > 0) {
            require(perpAllocated + amount <= maxPerpAllocation, "Exceeds max perp allocation");
        }

        usdc.safeIncreaseAllowance(address(vaultAccounting), amount);
        vaultAccounting.depositCapital(address(this), amount);
        perpAllocated += amount;

        emit AllocatedToPerp(amount);
    }

    /// @notice Pull USDC back from perp module up to available capital there.
    /// @param amount USDC to withdraw; decreases `perpAllocated`.
    function withdrawFromPerp(uint256 amount) external onlyOwner nonReentrant {
        require(address(vaultAccounting) != address(0), "VaultAccounting not set");
        vaultAccounting.withdrawCapital(address(this), amount);
        if (amount >= perpAllocated) {
            perpAllocated = 0;
        } else {
            perpAllocated -= amount;
        }

        emit WithdrawnFromPerp(amount);
    }

    /// @notice Add USDC to basket reserve without minting shares.
    /// @param amount USDC amount to transfer in.
    function topUpReserve(uint256 amount) external nonReentrant {
        require(amount > 0, "Amount required");
        usdc.safeTransferFrom(msg.sender, address(this), amount);
        emit ReserveToppedUp(msg.sender, amount);
    }

    // ─── Fee Collection ──────────────────────────────────────────

    /// @notice Transfer accumulated fees to `to`.
    /// @param to Recipient of `collectedFees` USDC.
    function collectFees(address to) external onlyOwner {
        uint256 fees = collectedFees;
        require(fees > 0, "No fees");
        collectedFees = 0;
        usdc.safeTransfer(to, fees);
        emit FeesCollected(to, fees);
    }

    // ─── Views ───────────────────────────────────────────────────

    /// @notice Share value from pricing NAV over total supply.
    /// @return Price in `PRICE_PRECISION` per share; if zero supply, returns `PRICE_PRECISION` (1 USDC/share).
    function getSharePrice() external view returns (uint256) {
        uint256 totalSupply = shareToken.totalSupply();
        if (totalSupply == 0) return PRICE_PRECISION;
        return (_pricingNav() * PRICE_PRECISION) / totalSupply;
    }

    /// @notice Required idle reserve based on current vault value and `minReserveBps`.
    /// @return Reserve target in USDC units (6 decimals).
    function getRequiredReserveUsdc() public view returns (uint256) {
        return (_totalVaultValue() * minReserveBps) / BPS_DENOMINATOR;
    }

    /// @notice Max additional USDC that may be allocated to perp while preserving reserve target.
    /// @return Amount in USDC units (6 decimals).
    function getAvailableForPerpUsdc() public view returns (uint256) {
        uint256 idleUsdc = _idleUsdcExcludingFees();
        uint256 requiredReserve = getRequiredReserveUsdc();
        if (idleUsdc <= requiredReserve) return 0;
        return idleUsdc - requiredReserve;
    }

    /// @notice Number of basket constituents.
    /// @return Length of `assets`.
    function getAssetCount() external view returns (uint256) {
        return assets.length;
    }

    /// @notice Nth configured asset id.
    /// @param index Array index.
    /// @return assetId Asset id.
    function getAssetAt(uint256 index) external view returns (bytes32 assetId) {
        AssetAllocation memory a = assets[index];
        return a.assetId;
    }

    /// @notice Pricing NAV used by share valuation.
    /// @return nav Current mark-to-market NAV in USDC units (floored at zero).
    function getPricingNav() external view returns (uint256 nav) {
        return _pricingNav();
    }

    /// @dev USDC balance not reserved as fees plus book value sent to perp.
    function _totalVaultValue() internal view returns (uint256) {
        return _idleUsdcExcludingFees() + perpAllocated;
    }

    /// @dev Mark-to-market NAV = on-vault value + local perp PnL + keeper-posted global adjustment.
    /// On spokes: vaultAccounting is address(0), so localPnL = 0. NAV = idle USDC + globalAdj.
    /// On hub: both local PnL and globalAdj contribute (globalAdj is the zero-sum complement).
    function _pricingNav() internal view returns (uint256) {
        uint256 base = _totalVaultValue();

        int256 localPnL;
        if (address(vaultAccounting) != address(0)) {
            (int256 unrealisedPnL, int256 realisedPnL) = vaultAccounting.getVaultPnL(address(this));
            localPnL = unrealisedPnL + realisedPnL;
        }

        int256 globalAdj;
        if (address(stateRelay) != address(0)) {
            (int256 pnl, bool stale) = stateRelay.getGlobalPnLAdjustment(address(this));
            if (!stale) globalAdj = pnl;
        }

        int256 total = int256(base) + localPnL + globalAdj;
        return total > 0 ? uint256(total) : 0;
    }

    /// @dev Idle USDC held by the basket excluding fee reserve.
    function _idleUsdcExcludingFees() internal view returns (uint256) {
        uint256 balance = usdc.balanceOf(address(this));
        if (balance <= collectedFees) return 0;
        return balance - collectedFees;
    }
}
