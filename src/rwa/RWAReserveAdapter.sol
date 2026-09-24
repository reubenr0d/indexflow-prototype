// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IRWAReserveAdapter} from "./IRWAReserveAdapter.sol";
import {IUSDYInstantManager, IMUSDWrapper} from "./IRWAPrimitives.sol";
import {IOracleAdapter} from "../perp/interfaces/IOracleAdapter.sol";
import {MethAdapter} from "./MethAdapter.sol";

/// @title RWAReserveAdapter
/// @notice Per-vault multi-asset reserve adapter. Holds exactly one reserve
///         token at a time (USDY / mUSD / mETH) on behalf of a single
///         BasketVault. Subscribe / redeem flows through the configured
///         primitive (Ondo InstantManager for USDY, an Ondo-compatible
///         wrapper for mUSD, our `MethAdapter` for mETH). NAV is valued
///         against the on-chain `OracleAdapter` for USDY and mETH; mUSD is
///         valued 1:1 with USDC because it is $1-pegged by design.
/// @dev    Owner = the vault. Mutating functions revert unless
///         `msg.sender == vault()`. Token addresses for all three primitives
///         are pinned at construction so the adapter is immutable in terms
///         of which contracts back each enum value.
contract RWAReserveAdapter is IRWAReserveAdapter, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @notice OracleAdapter precision (matches the perp engine).
    uint256 public constant ORACLE_PRECISION = 1e30;

    /// @notice Decimal scaler 1e18 <-> 1e6.
    uint256 public constant E12 = 1e12;

    // ─── Static deps ─────────────────────────────────────────────

    IERC20 public immutable usdc;
    address public immutable override vault;
    IOracleAdapter public immutable oracleAdapter;

    /// @notice Per-token addresses pinned at construction.
    IUSDYInstantManager public immutable usdyManager;
    IERC20 public immutable usdy;
    bytes32 public immutable usdyUsdcAssetId;

    IMUSDWrapper public immutable musdWrapper;
    IERC20 public immutable musd;

    MethAdapter public immutable methAdapter;
    IERC20 public immutable meth;
    bytes32 public immutable methUsdcAssetId;

    // ─── State ───────────────────────────────────────────────────

    /// @inheritdoc IRWAReserveAdapter
    ReserveToken public override reserveToken;

    /// @param _usdc USDC token.
    /// @param _vault The single BasketVault this adapter serves.
    /// @param _oracleAdapter Existing IndexFlow oracle adapter.
    /// @param _usdyManager Ondo InstantManager (or testnet mock).
    /// @param _usdy USDY token (or testnet mock).
    /// @param _usdyUsdcAssetId OracleAdapter asset id for USDY-USDC price.
    /// @param _musdWrapper Ondo mUSD wrapper (or testnet mock).
    /// @param _musd mUSD token (or testnet mock).
    /// @param _methAdapter Our MethAdapter contract.
    /// @param _meth mETH token (or testnet mock).
    /// @param _methUsdcAssetId OracleAdapter asset id for mETH-USDC price.
    /// @param _initialReserveToken Reserve token to start in (USDY recommended).
    constructor(
        address _usdc,
        address _vault,
        address _oracleAdapter,
        address _usdyManager,
        address _usdy,
        bytes32 _usdyUsdcAssetId,
        address _musdWrapper,
        address _musd,
        address _methAdapter,
        address _meth,
        bytes32 _methUsdcAssetId,
        ReserveToken _initialReserveToken
    ) {
        require(_usdc != address(0) && _vault != address(0) && _oracleAdapter != address(0), "zero address");
        require(_usdyManager != address(0) && _usdy != address(0) && _usdyUsdcAssetId != bytes32(0), "USDY config");
        require(_musdWrapper != address(0) && _musd != address(0), "mUSD config");
        require(_methAdapter != address(0) && _meth != address(0) && _methUsdcAssetId != bytes32(0), "mETH config");

        usdc = IERC20(_usdc);
        vault = _vault;
        oracleAdapter = IOracleAdapter(_oracleAdapter);

        usdyManager = IUSDYInstantManager(_usdyManager);
        usdy = IERC20(_usdy);
        usdyUsdcAssetId = _usdyUsdcAssetId;

        musdWrapper = IMUSDWrapper(_musdWrapper);
        musd = IERC20(_musd);

        methAdapter = MethAdapter(_methAdapter);
        meth = IERC20(_meth);
        methUsdcAssetId = _methUsdcAssetId;

        reserveToken = _initialReserveToken;
    }

    modifier onlyVault() {
        require(msg.sender == vault, "Only vault");
        _;
    }

    // ─── Mutating ────────────────────────────────────────────────

    /// @inheritdoc IRWAReserveAdapter
    function deposit(uint256 usdcAmount)
        external
        override
        onlyVault
        nonReentrant
        returns (uint256 reserveAmountReceived)
    {
        require(usdcAmount > 0, "amount required");
        usdc.safeTransferFrom(msg.sender, address(this), usdcAmount);
        reserveAmountReceived = _depositCurrent(usdcAmount);
        emit ReserveDeposited(reserveToken, usdcAmount, reserveAmountReceived);
    }

    /// @inheritdoc IRWAReserveAdapter
    function withdraw(uint256 usdcAmount) external override onlyVault nonReentrant returns (uint256 usdcDelivered) {
        require(usdcAmount > 0, "amount required");
        uint256 reserveSpent;
        (usdcDelivered, reserveSpent) = _withdrawCurrent(usdcAmount);
        require(usdcDelivered >= usdcAmount, "withdraw shortfall");
        usdc.safeTransfer(msg.sender, usdcDelivered);
        emit ReserveWithdrawn(reserveToken, reserveSpent, usdcDelivered);
    }

    /// @inheritdoc IRWAReserveAdapter
    function setReserveToken(ReserveToken newToken) external override onlyVault nonReentrant {
        ReserveToken oldToken = reserveToken;
        require(newToken != oldToken, "no-op rotation");

        uint256 currentBalance = _balanceOf(oldToken);
        uint256 freedUsdc;
        if (currentBalance > 0) {
            (freedUsdc,) = _redeemAll(oldToken);
        }

        reserveToken = newToken;

        if (freedUsdc > 0) {
            _depositCurrent(freedUsdc);
        }

        emit ReserveTokenChanged(oldToken, newToken, freedUsdc);
    }

    // ─── Views ───────────────────────────────────────────────────

    /// @inheritdoc IRWAReserveAdapter
    function getReserveValueUsdc() public view override returns (uint256 usdcValue) {
        uint256 balance = _balanceOf(reserveToken);
        if (balance == 0) return 0;
        return _valueInUsdc(reserveToken, balance);
    }

    /// @inheritdoc IRWAReserveAdapter
    function getReserveBalance() external view override returns (uint256) {
        return _balanceOf(reserveToken);
    }

    /// @inheritdoc IRWAReserveAdapter
    function getReserveTokenAddress() external view override returns (address) {
        return _tokenAddressOf(reserveToken);
    }

    // ─── Internal ────────────────────────────────────────────────

    function _balanceOf(ReserveToken token) internal view returns (uint256) {
        if (token == ReserveToken.USDY) return usdy.balanceOf(address(this));
        if (token == ReserveToken.MUSD) return musd.balanceOf(address(this));
        return meth.balanceOf(address(this));
    }

    function _tokenAddressOf(ReserveToken token) internal view returns (address) {
        if (token == ReserveToken.USDY) return address(usdy);
        if (token == ReserveToken.MUSD) return address(musd);
        return address(meth);
    }

    /// @dev Value `amount` of `token` in USDC units (6 decimals) using
    ///      OracleAdapter for USDY and mETH, $1-flat for mUSD.
    function _valueInUsdc(ReserveToken token, uint256 amount) internal view returns (uint256) {
        if (token == ReserveToken.USDY) {
            uint256 price = _readPrice1e30(usdyUsdcAssetId);
            // amount (1e18) * price (1e30) / (1e12 * 1e30) -> 1e6
            return (amount * price) / (E12 * ORACLE_PRECISION);
        }
        if (token == ReserveToken.MUSD) {
            // mUSD is rebasing $1-pegged: balance/1e12 is the USDC value.
            return amount / E12;
        }
        // mETH: same shape as USDY but uses the methUsdcAssetId feed.
        uint256 priceMeth = _readPrice1e30(methUsdcAssetId);
        return (amount * priceMeth) / (E12 * ORACLE_PRECISION);
    }

    function _readPrice1e30(bytes32 assetId) internal view returns (uint256 price) {
        require(!oracleAdapter.isStale(assetId), "RWA price stale");
        (price,) = oracleAdapter.getPrice(assetId);
        require(price > 0, "RWA price zero");
    }

    /// @dev Subscribe `usdcAmount` of USDC (already held by this adapter)
    ///      into the currently configured reserve token.
    function _depositCurrent(uint256 usdcAmount) internal returns (uint256 reserveOut) {
        ReserveToken token = reserveToken;
        if (token == ReserveToken.USDY) {
            usdc.safeIncreaseAllowance(address(usdyManager), usdcAmount);
            reserveOut = usdyManager.subscribe(address(usdc), usdcAmount);
        } else if (token == ReserveToken.MUSD) {
            usdc.safeIncreaseAllowance(address(musdWrapper), usdcAmount);
            reserveOut = musdWrapper.wrap(usdcAmount);
        } else {
            usdc.safeIncreaseAllowance(address(methAdapter), usdcAmount);
            reserveOut = methAdapter.deposit(usdcAmount);
        }
    }

    /// @dev Redeem just enough of the currently configured reserve token to
    ///      deliver `usdcAmount` (or more, due to rounding) USDC into this
    ///      adapter's balance. Returns the actual USDC freed plus the amount
    ///      of reserve token spent.
    function _withdrawCurrent(uint256 usdcAmount) internal returns (uint256 usdcDelivered, uint256 reserveSpent) {
        ReserveToken token = reserveToken;
        if (token == ReserveToken.USDY) {
            // Figure out USDY needed: usdyAmount = usdcAmount * 1e12 * 1e30 / price
            uint256 price = _readPrice1e30(usdyUsdcAssetId);
            uint256 usdyNeeded = (usdcAmount * E12 * ORACLE_PRECISION) / price;
            // Round-up by 1 wei so the subsequent redeem covers usdcAmount.
            usdyNeeded += 1;
            uint256 usdyBal = usdy.balanceOf(address(this));
            require(usdyBal >= usdyNeeded, "insufficient USDY");
            usdy.safeIncreaseAllowance(address(usdyManager), usdyNeeded);
            usdcDelivered = usdyManager.redeem(address(usdy), usdyNeeded, address(usdc));
            reserveSpent = usdyNeeded;
        } else if (token == ReserveToken.MUSD) {
            // 1:1, scale 6d -> 18d.
            uint256 musdNeeded = usdcAmount * E12;
            uint256 musdBal = musd.balanceOf(address(this));
            require(musdBal >= musdNeeded, "insufficient mUSD");
            musd.safeIncreaseAllowance(address(musdWrapper), musdNeeded);
            usdcDelivered = musdWrapper.unwrap(musdNeeded);
            reserveSpent = musdNeeded;
        } else {
            // mETH: figure out mETH shares needed via MethAdapter preview.
            uint256 methNeeded = methAdapter.previewDepositMETH(usdcAmount);
            methNeeded += 1; // dust-up so the withdraw covers usdcAmount exactly.
            uint256 methBal = meth.balanceOf(address(this));
            require(methBal >= methNeeded, "insufficient mETH");
            meth.safeIncreaseAllowance(address(methAdapter), methNeeded);
            usdcDelivered = methAdapter.withdraw(methNeeded);
            reserveSpent = methNeeded;
        }
    }

    /// @dev Redeem the entire current reserve balance back to USDC held by
    ///      this adapter. Used during `setReserveToken` rotation.
    function _redeemAll(ReserveToken token) internal returns (uint256 usdcOut, uint256 reserveSpent) {
        reserveSpent = _balanceOf(token);
        if (reserveSpent == 0) return (0, 0);

        if (token == ReserveToken.USDY) {
            usdy.safeIncreaseAllowance(address(usdyManager), reserveSpent);
            usdcOut = usdyManager.redeem(address(usdy), reserveSpent, address(usdc));
        } else if (token == ReserveToken.MUSD) {
            musd.safeIncreaseAllowance(address(musdWrapper), reserveSpent);
            usdcOut = musdWrapper.unwrap(reserveSpent);
        } else {
            meth.safeIncreaseAllowance(address(methAdapter), reserveSpent);
            usdcOut = methAdapter.withdraw(reserveSpent);
        }
    }
}
