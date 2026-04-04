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
/// Continuous deposit/redeem. Can allocate capital to perp pool via VaultAccounting.
contract BasketVault is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    uint256 public constant BPS_DENOMINATOR = 10_000;
    uint256 public constant PRICE_PRECISION = 1e30;

    struct AssetAllocation {
        bytes32 assetId;
        uint256 weightBps;
    }

    IERC20 public immutable usdc;
    BasketShareToken public immutable shareToken;

    IOracleAdapter public oracleAdapter;
    IPerp public vaultAccounting;

    AssetAllocation[] public assets;
    uint256 public totalWeightBps;

    uint256 public depositFeeBps;
    uint256 public redeemFeeBps;
    uint256 public collectedFees;

    uint256 public perpAllocated;
    uint256 public maxPerpAllocation;

    string public name;

    event Deposited(address indexed user, uint256 usdcAmount, uint256 sharesMinted);
    event Redeemed(address indexed user, uint256 sharesBurned, uint256 usdcReturned);
    event AllocatedToPerp(uint256 amount);
    event WithdrawnFromPerp(uint256 amount);
    event AssetsUpdated(uint256 assetCount);
    event FeesCollected(address indexed to, uint256 amount);

    constructor(
        string memory _name,
        address _usdc,
        address _oracleAdapter,
        address _owner
    ) Ownable(_owner) {
        require(_usdc != address(0), "USDC required");
        require(_oracleAdapter != address(0), "Oracle required");

        name = _name;
        usdc = IERC20(_usdc);
        oracleAdapter = IOracleAdapter(_oracleAdapter);

        string memory tokenName = string.concat(_name, " Share");
        shareToken = new BasketShareToken(tokenName, "BSKT", address(this));
    }

    // ─── Configuration ───────────────────────────────────────────

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

    function setFees(uint256 _depositFeeBps, uint256 _redeemFeeBps) external onlyOwner {
        require(_depositFeeBps <= 500, "Deposit fee too high");
        require(_redeemFeeBps <= 500, "Redeem fee too high");
        depositFeeBps = _depositFeeBps;
        redeemFeeBps = _redeemFeeBps;
    }

    function setVaultAccounting(address _vaultAccounting) external onlyOwner {
        vaultAccounting = IPerp(_vaultAccounting);
    }

    function setOracleAdapter(address _oracleAdapter) external onlyOwner {
        require(_oracleAdapter != address(0), "Oracle required");
        oracleAdapter = IOracleAdapter(_oracleAdapter);
    }

    function setMaxPerpAllocation(uint256 cap) external onlyOwner {
        maxPerpAllocation = cap;
    }

    // ─── Deposit / Redeem ────────────────────────────────────────

    /// @notice Deposit USDC and receive basket shares at current oracle basket price.
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

    /// @notice Allocate vault USDC to the perp global pool.
    function allocateToPerp(uint256 amount) external onlyOwner nonReentrant {
        require(address(vaultAccounting) != address(0), "VaultAccounting not set");
        uint256 available = usdc.balanceOf(address(this)) - collectedFees;
        require(amount <= available, "Insufficient balance");

        if (maxPerpAllocation > 0) {
            require(perpAllocated + amount <= maxPerpAllocation, "Exceeds max perp allocation");
        }

        usdc.safeIncreaseAllowance(address(vaultAccounting), amount);
        vaultAccounting.depositCapital(address(this), amount);
        perpAllocated += amount;

        emit AllocatedToPerp(amount);
    }

    /// @notice Withdraw USDC from the perp global pool back to vault.
    function withdrawFromPerp(uint256 amount) external onlyOwner nonReentrant {
        require(address(vaultAccounting) != address(0), "VaultAccounting not set");
        require(amount <= perpAllocated, "Exceeds allocated");

        vaultAccounting.withdrawCapital(address(this), amount);
        perpAllocated -= amount;

        emit WithdrawnFromPerp(amount);
    }

    // ─── Fee Collection ──────────────────────────────────────────

    function collectFees(address to) external onlyOwner {
        uint256 fees = collectedFees;
        require(fees > 0, "No fees");
        collectedFees = 0;
        usdc.safeTransfer(to, fees);
        emit FeesCollected(to, fees);
    }

    // ─── Views ───────────────────────────────────────────────────

    /// @notice Basket price = sum(weight_i * oraclePrice_i) / 10000.
    /// Returns price in PRICE_PRECISION (1e30) per 1 USDC unit (1e6).
    function getBasketPrice() public view returns (uint256 price) {
        for (uint256 i = 0; i < assets.length; i++) {
            (uint256 assetPrice,) = oracleAdapter.getPrice(assets[i].assetId);
            price += (assetPrice * assets[i].weightBps) / BPS_DENOMINATOR;
        }
    }

    /// @notice Share price = basket price accounting for total value / supply.
    function getSharePrice() external view returns (uint256) {
        uint256 totalSupply = shareToken.totalSupply();
        if (totalSupply == 0) return getBasketPrice();

        uint256 totalValue = _totalVaultValue();
        return (totalValue * PRICE_PRECISION) / totalSupply;
    }

    function getAssetCount() external view returns (uint256) {
        return assets.length;
    }

    function getAssetAt(uint256 index) external view returns (bytes32 assetId, uint256 weightBps) {
        AssetAllocation memory a = assets[index];
        return (a.assetId, a.weightBps);
    }

    function _totalVaultValue() internal view returns (uint256) {
        uint256 usdcBalance = usdc.balanceOf(address(this)) - collectedFees + perpAllocated;
        return usdcBalance;
    }
}
