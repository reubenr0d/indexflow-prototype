// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IUSDYInstantManager} from "../IRWAPrimitives.sol";
import {IOracleAdapter} from "../../perp/interfaces/IOracleAdapter.sol";
import {MockUSDY} from "./MockUSDY.sol";

/// @title MockUSDYInstantManager
/// @notice Testnet stand-in for Ondo's USDY InstantManager. Holds USDC backing
///         on subscribe; mints / burns MockUSDY using the on-chain
///         `OracleAdapter`'s `USDY-USDC` price (CustomRelayer-fed by the keeper
///         from Ondo mainnet's real `RWADynamicOracle.getPrice()` via mainnet
///         RPC). No prices are hardcoded or admin-set.
/// @dev    The OracleAdapter returns prices in 1e30-normalized form. For
///         USDY-USDC, the price represents 1 USDY worth of USDC scaled to
///         1e30 (so $1.05 USDC/USDY -> 1.05e30). The conversion math below
///         accounts for the 18d USDY and 6d USDC decimals.
contract MockUSDYInstantManager is IUSDYInstantManager {
    using SafeERC20 for IERC20;

    /// @notice OracleAdapter precision (matches the perp engine).
    uint256 public constant ORACLE_PRECISION = 1e30;

    /// @notice Decimal scaler from USDC (6) to USDY (18).
    uint256 public constant USDC_TO_USDY_SCALE = 1e12;

    IERC20 public immutable usdc;
    MockUSDY public usdy;
    IOracleAdapter public immutable oracleAdapter;

    /// @notice OracleAdapter asset id for the USDY-USDC price feed.
    ///         e.g. keccak256("USDY-USDC").
    bytes32 public immutable usdyUsdcAssetId;

    constructor(address _usdc, address _oracleAdapter, bytes32 _usdyUsdcAssetId) {
        require(_usdc != address(0) && _oracleAdapter != address(0), "zero address");
        require(_usdyUsdcAssetId != bytes32(0), "asset id required");
        usdc = IERC20(_usdc);
        oracleAdapter = IOracleAdapter(_oracleAdapter);
        usdyUsdcAssetId = _usdyUsdcAssetId;
    }

    /// @notice Wire the MockUSDY token. Called once by the deploy script.
    function setUSDY(address _usdy) external {
        require(address(usdy) == address(0), "already set");
        require(_usdy != address(0), "zero address");
        usdy = MockUSDY(_usdy);
    }

    function subscribe(address _usdc, uint256 usdcAmount) external returns (uint256 usdyOut) {
        require(_usdc == address(usdc), "wrong usdc");
        require(usdcAmount > 0, "amount required");

        usdc.safeTransferFrom(msg.sender, address(this), usdcAmount);

        uint256 price1e30 = _readUsdyPrice1e30();
        // usdyOut (1e18) = usdcAmount (1e6) * 1e12 * 1e30 / price (1e30)
        usdyOut = (usdcAmount * USDC_TO_USDY_SCALE * ORACLE_PRECISION) / price1e30;
        require(usdyOut > 0, "usdyOut zero");

        usdy.mint(msg.sender, usdyOut);
    }

    function redeem(address _usdy, uint256 usdyAmount, address _usdc) external returns (uint256 usdcOut) {
        require(_usdy == address(usdy), "wrong usdy");
        require(_usdc == address(usdc), "wrong usdc");
        require(usdyAmount > 0, "amount required");

        uint256 price1e30 = _readUsdyPrice1e30();
        // usdcOut (1e6) = usdyAmount (1e18) * price (1e30) / (1e12 * 1e30)
        usdcOut = (usdyAmount * price1e30) / (USDC_TO_USDY_SCALE * ORACLE_PRECISION);
        require(usdcOut > 0, "usdcOut zero");
        require(usdc.balanceOf(address(this)) >= usdcOut, "insufficient usdc liquidity");

        usdy.burn(msg.sender, usdyAmount);
        usdc.safeTransfer(msg.sender, usdcOut);
    }

    /// @dev Read the current USDY-USDC price from OracleAdapter. Reverts if
    ///      the oracle considers the price stale, matching how every other
    ///      consumer in IndexFlow (PricingEngine, VaultAccounting) handles
    ///      stale prices.
    function _readUsdyPrice1e30() internal view returns (uint256 price) {
        require(!oracleAdapter.isStale(usdyUsdcAssetId), "USDY price stale");
        (price,) = oracleAdapter.getPrice(usdyUsdcAssetId);
        require(price > 0, "USDY price zero");
    }
}
