// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IOracleAdapter} from "../perp/interfaces/IOracleAdapter.sol";
import {MockMETH} from "./mocks/MockMETH.sol";

/// @title MethAdapter
/// @notice Thin wrapper exposing USDC <-> mETH conversion to the
///         RWAReserveAdapter. All pricing is read from the on-chain
///         `OracleAdapter` — there are no admin-set prices, no WETH leg, and
///         no internal yield curve. The keeper posts the current mETH/USDC
///         price (derived from real Mantle mainnet mETH state queried via
///         mainnet RPC) into the OracleAdapter on the same cadence as every
///         other CustomRelayer asset.
/// @dev    Decimals: USDC 6d, mETH 18d, OracleAdapter price 1e30-normalized
///         representing USDC per 1 mETH. So 1 mETH at $3500 -> price = 3500e30.
///
///         Testnet vs mainnet:
///         - Testnet (`testnetMode = true`): the adapter holds the testnet
///           MockMETH; mints on deposit / burns on withdraw against the
///           oracle-driven exchange amount. USDC backing flows in and out of
///           the adapter (1:1 with subscribed value). No swap, no liquidity
///           pool — just a deterministic mint/burn at real prices.
///         - Mainnet (`testnetMode = false`): the adapter routes through the
///           real Mantle mETH staking contract + a DEX swap. NOT WIRED in
///           this file — guarded by `revert("mainnet swap not wired")`.
///           Marked `MAINNET-TODO`.
contract MethAdapter is Ownable {
    using SafeERC20 for IERC20;

    /// @notice OracleAdapter precision.
    uint256 public constant ORACLE_PRECISION = 1e30;
    uint256 public constant USDC_TO_METH_SCALE = 1e12;

    IERC20 public immutable usdc;
    IERC20 public immutable meth;
    IOracleAdapter public immutable oracleAdapter;

    /// @notice OracleAdapter asset id for the mETH-USDC price feed.
    bytes32 public immutable methUsdcAssetId;

    /// @notice True when the adapter mints/burns the testnet MockMETH on
    ///         deposit/withdraw. False for mainnet (NOT wired).
    bool public immutable testnetMode;

    event Deposited(uint256 usdcIn, uint256 methOut, uint256 priceUsed);
    event Withdrawn(uint256 methIn, uint256 usdcOut, uint256 priceUsed);

    constructor(
        address _usdc,
        address _meth,
        address _oracleAdapter,
        bytes32 _methUsdcAssetId,
        bool _testnetMode,
        address _owner
    ) Ownable(_owner) {
        require(_usdc != address(0) && _meth != address(0) && _oracleAdapter != address(0), "zero address");
        require(_methUsdcAssetId != bytes32(0), "asset id required");
        usdc = IERC20(_usdc);
        meth = IERC20(_meth);
        oracleAdapter = IOracleAdapter(_oracleAdapter);
        methUsdcAssetId = _methUsdcAssetId;
        testnetMode = _testnetMode;
    }

    /// @notice Convert `usdcAmount` USDC into mETH. Caller MUST approve
    ///         `usdcAmount` of USDC to this adapter first.
    /// @return methOut mETH shares delivered to the caller.
    function deposit(uint256 usdcAmount) external returns (uint256 methOut) {
        require(usdcAmount > 0, "amount required");

        uint256 price1e30 = _readMethPrice1e30();
        // methOut (1e18) = usdcAmount (1e6) * 1e12 * 1e30 / price (1e30)
        methOut = (usdcAmount * USDC_TO_METH_SCALE * ORACLE_PRECISION) / price1e30;
        require(methOut > 0, "meth out zero");

        usdc.safeTransferFrom(msg.sender, address(this), usdcAmount);

        if (testnetMode) {
            MockMETH(address(meth)).mint(msg.sender, methOut);
        } else {
            // MAINNET-TODO: route USDC -> WETH via DEX, then stake into mETH.
            revert("mainnet swap not wired");
        }

        emit Deposited(usdcAmount, methOut, price1e30);
    }

    /// @notice Redeem mETH so this adapter delivers `usdcOut` USDC to the
    ///         caller, equal to the oracle valuation of `methIn`. Caller MUST
    ///         approve `methIn` of mETH to this adapter first.
    /// @return usdcOut USDC delivered.
    function withdraw(uint256 methIn) external returns (uint256 usdcOut) {
        require(methIn > 0, "amount required");

        uint256 price1e30 = _readMethPrice1e30();
        // usdcOut (1e6) = methIn (1e18) * price (1e30) / (1e12 * 1e30)
        usdcOut = (methIn * price1e30) / (USDC_TO_METH_SCALE * ORACLE_PRECISION);
        require(usdcOut > 0, "usdc out zero");
        require(usdc.balanceOf(address(this)) >= usdcOut, "insufficient usdc liquidity");

        if (testnetMode) {
            MockMETH(address(meth)).burn(msg.sender, methIn);
        } else {
            // MAINNET-TODO: unstake mETH -> WETH, then swap WETH -> USDC.
            revert("mainnet swap not wired");
        }

        usdc.safeTransfer(msg.sender, usdcOut);

        emit Withdrawn(methIn, usdcOut, price1e30);
    }

    /// @notice USDC value of `methAmount` mETH at the current oracle price.
    ///         Used by RWAReserveAdapter NAV.
    function previewWithdrawUsdc(uint256 methAmount) external view returns (uint256 usdcValue) {
        if (methAmount == 0) return 0;
        uint256 price1e30 = _readMethPrice1e30();
        usdcValue = (methAmount * price1e30) / (USDC_TO_METH_SCALE * ORACLE_PRECISION);
    }

    /// @notice mETH shares equivalent to `usdcAmount` USDC at the current
    ///         oracle price.
    function previewDepositMETH(uint256 usdcAmount) external view returns (uint256 methAmount) {
        if (usdcAmount == 0) return 0;
        uint256 price1e30 = _readMethPrice1e30();
        methAmount = (usdcAmount * USDC_TO_METH_SCALE * ORACLE_PRECISION) / price1e30;
    }

    function _readMethPrice1e30() internal view returns (uint256 price) {
        require(!oracleAdapter.isStale(methUsdcAssetId), "mETH price stale");
        (price, ) = oracleAdapter.getPrice(methUsdcAssetId);
        require(price > 0, "mETH price zero");
    }
}
