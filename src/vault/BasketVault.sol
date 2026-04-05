// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {BasketShareToken} from "./BasketShareToken.sol";
import {IOracleAdapter} from "../perp/interfaces/IOracleAdapter.sol";
import {IPerp} from "../perp/interfaces/IPerp.sol";

/// @title BasketVault
/// @notice GLP-style basket vault: deposit USDC, mint shares priced by weighted oracle prices.
/// @dev Continuous deposit/redeem. `deposit`/`redeem` use `getBasketPrice()` (oracle basket).
/// `getSharePrice` uses on-balance USDC (minus reserved fees) plus `perpAllocated` book entry—
/// not the same as basket oracle when perp PnL exists; use off-chain or `PerpReader.getTotalVaultValue` for full NAV.
contract BasketVault is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    /// @notice Basis points denominator for weights and fees (10000 = 100%).
    uint256 public constant BPS_DENOMINATOR = 10_000;
    /// @notice Price scalar matching oracle adapter (1e30 per 1e6 USDC share).
    uint256 public constant PRICE_PRECISION = 1e30;

    /// @notice One basket constituent.
    /// @param assetId Oracle asset id.
    /// @param weightBps Weight in basis points; all weights must sum to `BPS_DENOMINATOR`.
    struct AssetAllocation {
        bytes32 assetId;
        uint256 weightBps;
    }

    /// @notice Collateral token (USDC).
    IERC20 public immutable usdc;
    /// @notice ERC20 shares minted by this vault.
    BasketShareToken public immutable shareToken;

    /// @notice Oracle for basket composition pricing.
    IOracleAdapter public oracleAdapter;
    /// @notice Perp capital bridge (optional until set).
    IPerp public vaultAccounting;

    AssetAllocation[] public assets;
    /// @notice Sum of weights; must equal `BPS_DENOMINATOR` after `setAssets`.
    uint256 public totalWeightBps;

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

    /// @notice Human-readable basket name.
    string public name;

    event Deposited(address indexed user, uint256 usdcAmount, uint256 sharesMinted);
    event Redeemed(address indexed user, uint256 sharesBurned, uint256 usdcReturned);
    event AllocatedToPerp(uint256 amount);
    event WithdrawnFromPerp(uint256 amount);
    event AssetsUpdated(uint256 assetCount);
    event FeesCollected(address indexed to, uint256 amount);
    event ReservePolicyUpdated(uint256 minReserveBps);
    event ReserveToppedUp(address indexed from, uint256 amount);

    /// @param _name Basket display name (also used for share token name).
    /// @param _usdc USDC address.
    /// @param _oracleAdapter `OracleAdapter` address.
    /// @param _owner Ownable admin.
    constructor(string memory _name, address _usdc, address _oracleAdapter, address _owner) Ownable(_owner) {
        require(_usdc != address(0), "USDC required");
        require(_oracleAdapter != address(0), "Oracle required");

        name = _name;
        usdc = IERC20(_usdc);
        oracleAdapter = IOracleAdapter(_oracleAdapter);

        string memory tokenName = string.concat(_name, " Share");
        shareToken = new BasketShareToken(tokenName, "BSKT", address(this));
    }

    // ─── Configuration ───────────────────────────────────────────

    /// @notice Replace basket composition; each asset must be active on the oracle; weights sum to 10000 bps.
    /// @param assetIds Oracle asset ids.
    /// @param weightsBps Parallel weights.
    function setAssets(bytes32[] calldata assetIds, uint256[] calldata weightsBps) external onlyOwner {
        require(assetIds.length == weightsBps.length, "Length mismatch");
        require(assetIds.length > 0, "No assets");

        delete assets;
        uint256 total;
        for (uint256 i = 0; i < assetIds.length; i++) {
            require(weightsBps[i] > 0, "Zero weight");
            require(oracleAdapter.isAssetActive(assetIds[i]), "Asset not active in oracle");
            assets.push(AssetAllocation({assetId: assetIds[i], weightBps: weightsBps[i]}));
            total += weightsBps[i];
        }
        require(total == BPS_DENOMINATOR, "Weights must sum to 10000");
        totalWeightBps = total;

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

    // ─── Deposit / Redeem ────────────────────────────────────────

    /// @notice Deposit USDC and receive basket shares at current oracle basket price.
    /// @param usdcAmount Gross USDC to deposit (fee deducted before minting).
    /// @return sharesMinted Shares minted to `msg.sender` (6 decimals).
    function deposit(uint256 usdcAmount) external nonReentrant returns (uint256 sharesMinted) {
        require(usdcAmount > 0, "Amount required");
        require(assets.length > 0, "No assets configured");

        uint256 fee = (usdcAmount * depositFeeBps) / BPS_DENOMINATOR;
        uint256 netAmount = usdcAmount - fee;
        collectedFees += fee;

        usdc.safeTransferFrom(msg.sender, address(this), usdcAmount);

        uint256 basketPrice = getBasketPrice();
        require(basketPrice > 0, "Invalid basket price");

        // shares = netAmount * PRICE_PRECISION / basketPrice
        // Both USDC (6 dec) and shares (6 dec) -- basketPrice is in PRICE_PRECISION
        sharesMinted = (netAmount * PRICE_PRECISION) / basketPrice;
        require(sharesMinted > 0, "Shares too small");

        shareToken.mint(msg.sender, sharesMinted);

        emit Deposited(msg.sender, usdcAmount, sharesMinted);
    }

    /// @notice Redeem basket shares for USDC at current oracle basket price.
    /// @param sharesToBurn Shares to burn from `msg.sender`.
    /// @return usdcReturned Net USDC after redeem fee.
    function redeem(uint256 sharesToBurn) external nonReentrant returns (uint256 usdcReturned) {
        require(sharesToBurn > 0, "Amount required");
        require(shareToken.balanceOf(msg.sender) >= sharesToBurn, "Insufficient shares");

        uint256 basketPrice = getBasketPrice();
        require(basketPrice > 0, "Invalid basket price");

        // usdcAmount = shares * basketPrice / PRICE_PRECISION
        uint256 grossAmount = (sharesToBurn * basketPrice) / PRICE_PRECISION;
        uint256 fee = (grossAmount * redeemFeeBps) / BPS_DENOMINATOR;
        usdcReturned = grossAmount - fee;
        collectedFees += fee;

        uint256 availableUsdc = usdc.balanceOf(address(this)) - collectedFees;
        require(usdcReturned <= availableUsdc, "Insufficient liquidity");

        shareToken.burn(msg.sender, sharesToBurn);
        usdc.safeTransfer(msg.sender, usdcReturned);

        emit Redeemed(msg.sender, sharesToBurn, usdcReturned);
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
        require(amount <= perpAllocated, "Exceeds allocated");

        vaultAccounting.withdrawCapital(address(this), amount);
        perpAllocated -= amount;

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

    /// @notice Basket price = sum(weight_i * oraclePrice_i) / 10000.
    /// @return price In `PRICE_PRECISION` (1e30) per 1 USDC unit (1e6).
    function getBasketPrice() public view returns (uint256 price) {
        for (uint256 i = 0; i < assets.length; i++) {
            (uint256 assetPrice,) = oracleAdapter.getPrice(assets[i].assetId);
            price += (assetPrice * assets[i].weightBps) / BPS_DENOMINATOR;
        }
    }

    /// @notice Implied share value from vault USDC (excl. reserved fees) plus `perpAllocated` over supply.
    /// @return Price in `PRICE_PRECISION` per share; if zero supply, returns `getBasketPrice()`.
    /// @dev Does not include unrealised perp PnL; not full mark-to-market NAV.
    function getSharePrice() external view returns (uint256) {
        uint256 totalSupply = shareToken.totalSupply();
        if (totalSupply == 0) return getBasketPrice();

        uint256 totalValue = _totalVaultValue();
        return (totalValue * PRICE_PRECISION) / totalSupply;
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

    /// @notice Nth asset in the basket.
    /// @param index Array index.
    /// @return assetId Asset id.
    /// @return weightBps Weight in bps.
    function getAssetAt(uint256 index) external view returns (bytes32 assetId, uint256 weightBps) {
        AssetAllocation memory a = assets[index];
        return (a.assetId, a.weightBps);
    }

    /// @dev USDC balance not reserved as fees plus book value sent to perp.
    function _totalVaultValue() internal view returns (uint256) {
        return _idleUsdcExcludingFees() + perpAllocated;
    }

    /// @dev Idle USDC held by the basket excluding fee reserve.
    function _idleUsdcExcludingFees() internal view returns (uint256) {
        uint256 balance = usdc.balanceOf(address(this));
        if (balance <= collectedFees) return 0;
        return balance - collectedFees;
    }
}
