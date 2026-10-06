// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IOracleAdapter} from "../perp/interfaces/IOracleAdapter.sol";
import {IPerp} from "../perp/interfaces/IPerp.sol";
import {IStateRelay} from "../coordination/interfaces/IStateRelay.sol";

/// @title BaseVault
/// @notice Shared logic for BasketVault and ConfidentialBasketVault: configuration,
///         perp allocation, fee collection, NAV pricing, and reserve views.
///         Subclasses implement deposit/redeem and supply the share token.
abstract contract BaseVault is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    uint256 public constant BPS_DENOMINATOR = 10_000;
    uint256 public constant PRICE_PRECISION = 1e30;

    struct AssetAllocation {
        bytes32 assetId;
    }

    IERC20 public immutable usdc;

    IOracleAdapter public oracleAdapter;
    IPerp public vaultAccounting;
    IStateRelay public stateRelay;

    AssetAllocation[] public assets;

    uint256 public depositFeeBps;
    uint256 public redeemFeeBps;
    uint256 public collectedFees;
    uint256 public perpAllocated;
    uint256 public maxPerpAllocation;
    uint256 public minReserveBps;
    uint256 public minDepositWeightBps;

    address public keeper;
    string public name;

    event AssetsUpdated(uint256 assetCount);
    event FeesCollected(address indexed to, uint256 amount);
    event ReservePolicyUpdated(uint256 minReserveBps);
    event AllocatedToPerp(uint256 amount);
    event WithdrawnFromPerp(uint256 amount);
    event ReserveToppedUp(address indexed from, uint256 amount);

    modifier onlyKeeper() {
        require(msg.sender == keeper, "Only keeper");
        _;
    }

    constructor(string memory _name, address _usdc, address _oracle, address _owner) Ownable(_owner) {
        require(_usdc != address(0), "USDC required");
        name = _name;
        usdc = IERC20(_usdc);
        if (_oracle != address(0)) oracleAdapter = IOracleAdapter(_oracle);
    }

    // ─── Configuration ───────────────────────────────────────────

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

    function setFees(uint256 _depositFeeBps, uint256 _redeemFeeBps) external onlyOwner {
        require(_depositFeeBps <= 500, "Deposit fee too high");
        require(_redeemFeeBps <= 500, "Redeem fee too high");
        depositFeeBps = _depositFeeBps;
        redeemFeeBps = _redeemFeeBps;
    }

    function setVaultAccounting(address _va) external onlyOwner {
        vaultAccounting = IPerp(_va);
    }

    function setOracleAdapter(address _oracle) external onlyOwner {
        require(_oracle != address(0), "Oracle required");
        oracleAdapter = IOracleAdapter(_oracle);
    }

    function setMaxPerpAllocation(uint256 cap) external onlyOwner {
        maxPerpAllocation = cap;
    }

    function setMinReserveBps(uint256 bps) external onlyOwner {
        require(bps <= BPS_DENOMINATOR, "Invalid reserve bps");
        minReserveBps = bps;
        emit ReservePolicyUpdated(bps);
    }

    function setStateRelay(address _relay) external onlyOwner {
        stateRelay = IStateRelay(_relay);
    }

    function setKeeper(address _keeper) external onlyOwner {
        keeper = _keeper;
    }

    function setMinDepositWeightBps(uint256 bps) external onlyOwner {
        require(bps <= BPS_DENOMINATOR, "Invalid weight bps");
        minDepositWeightBps = bps;
    }

    // ─── Perp Capital Allocation ─────────────────────────────────

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

    function withdrawFromPerp(uint256 amount) external onlyOwner nonReentrant {
        require(address(vaultAccounting) != address(0), "VaultAccounting not set");
        vaultAccounting.withdrawCapital(address(this), amount);
        perpAllocated = amount >= perpAllocated ? 0 : perpAllocated - amount;
        emit WithdrawnFromPerp(amount);
    }

    function topUpReserve(uint256 amount) external nonReentrant {
        require(amount > 0, "Amount required");
        usdc.safeTransferFrom(msg.sender, address(this), amount);
        emit ReserveToppedUp(msg.sender, amount);
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

    function getSharePrice() external view returns (uint256) {
        uint256 ts = _totalShareSupply();
        if (ts == 0) return PRICE_PRECISION;
        return (_pricingNav() * PRICE_PRECISION) / ts;
    }

    function getRequiredReserveUsdc() public view returns (uint256) {
        return (_totalVaultValue() * minReserveBps) / BPS_DENOMINATOR;
    }

    function getAvailableForPerpUsdc() public view returns (uint256) {
        uint256 idle = _idleUsdcExcludingFees();
        uint256 req = getRequiredReserveUsdc();
        return idle > req ? idle - req : 0;
    }

    function getAssetCount() external view returns (uint256) {
        return assets.length;
    }

    function getAssetAt(uint256 index) external view returns (bytes32) {
        return assets[index].assetId;
    }

    function getPricingNav() external view returns (uint256) {
        return _pricingNav();
    }

    // ─── Internal ────────────────────────────────────────────────

    /// @dev Override in BasketVault to include RWA reserve value; defaults to 0.
    function _rwaReserveValue() internal view virtual returns (uint256) {
        return 0;
    }

    /// @dev Override to return the current plaintext total share supply.
    ///      BasketVault returns shareToken.totalSupply(); CBV returns _inferTotalSupply().
    function _totalShareSupply() internal view virtual returns (uint256);

    function _totalVaultValue() internal view returns (uint256) {
        return _idleUsdcExcludingFees() + perpAllocated + _rwaReserveValue();
    }

    function _pricingNav() internal view returns (uint256) {
        uint256 base = _totalVaultValue();

        int256 localPnL;
        if (address(vaultAccounting) != address(0)) {
            (int256 u, int256 r) = vaultAccounting.getVaultPnL(address(this));
            localPnL = u + r;
        }

        int256 globalAdj;
        if (address(stateRelay) != address(0)) {
            (int256 pnl, bool stale) = stateRelay.getGlobalPnLAdjustment(address(this));
            if (!stale) globalAdj = pnl;
        }

        int256 total = int256(base) + localPnL + globalAdj;
        return total > 0 ? uint256(total) : 0;
    }

    function _idleUsdcExcludingFees() internal view returns (uint256) {
        uint256 balance = usdc.balanceOf(address(this));
        return balance <= collectedFees ? 0 : balance - collectedFees;
    }
}
