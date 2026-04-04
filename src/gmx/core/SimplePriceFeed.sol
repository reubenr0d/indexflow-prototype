// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

import "../libraries/math/SafeMath.sol";
import "./interfaces/IVaultPriceFeed.sol";

/// @title SimplePriceFeed
/// @notice Minimal IVaultPriceFeed that stores per-token prices directly.
/// Used as a bridge between the OracleAdapter system and the GMX Vault.
/// Prices are set by a gov/keeper and consumed by the Vault's getMinPrice/getMaxPrice.
contract SimplePriceFeed is IVaultPriceFeed {
    using SafeMath for uint256;

    uint256 public constant PRICE_PRECISION = 10 ** 30;
    uint256 public constant BASIS_POINTS_DIVISOR = 10000;

    address public gov;

    mapping(address => uint256) public prices;
    mapping(address => uint256) public spreadBasisPoints;
    mapping(address => uint256) public override adjustmentBasisPoints;
    mapping(address => bool) public override isAdjustmentAdditive;

    mapping(address => bool) public keepers;

    event PriceSet(address indexed token, uint256 price);
    event KeeperUpdated(address indexed keeper, bool active);

    modifier onlyGov() {
        require(msg.sender == gov, "SimplePriceFeed: forbidden");
        _;
    }

    modifier onlyAuthorized() {
        require(msg.sender == gov || keepers[msg.sender], "SimplePriceFeed: forbidden");
        _;
    }

    constructor() public {
        gov = msg.sender;
    }

    function setGov(address _gov) external onlyGov {
        gov = _gov;
    }

    function setKeeper(address _keeper, bool _active) external onlyGov {
        keepers[_keeper] = _active;
        emit KeeperUpdated(_keeper, _active);
    }

    /// @notice Set the price for a token. Price is in PRICE_PRECISION (1e30) format.
    function setPrice(address _token, uint256 _price) external onlyAuthorized {
        require(_price > 0, "SimplePriceFeed: invalid price");
        prices[_token] = _price;
        emit PriceSet(_token, _price);
    }

    /// @notice Batch set prices for multiple tokens.
    function setPrices(address[] calldata _tokens, uint256[] calldata _prices) external onlyAuthorized {
        require(_tokens.length == _prices.length, "SimplePriceFeed: length mismatch");
        for (uint256 i = 0; i < _tokens.length; i++) {
            require(_prices[i] > 0, "SimplePriceFeed: invalid price");
            prices[_tokens[i]] = _prices[i];
            emit PriceSet(_tokens[i], _prices[i]);
        }
    }

    function getPrice(
        address _token,
        bool _maximise,
        bool, /* _includeAmmPrice */
        bool /* _useSwapPricing */
    )
        public
        view
        override
        returns (uint256)
    {
        uint256 price = prices[_token];
        require(price > 0, "SimplePriceFeed: no price");

        uint256 _spreadBps = spreadBasisPoints[_token];
        if (_maximise) {
            return price.add(price.mul(_spreadBps).div(BASIS_POINTS_DIVISOR));
        }
        return price.sub(price.mul(_spreadBps).div(BASIS_POINTS_DIVISOR));
    }

    // ─── IVaultPriceFeed stubs ─────────────────────────────────────

    function setAdjustment(address _token, bool _isAdditive, uint256 _adjustmentBps) external override onlyGov {
        isAdjustmentAdditive[_token] = _isAdditive;
        adjustmentBasisPoints[_token] = _adjustmentBps;
    }

    function setSpreadBasisPoints(address _token, uint256 _spreadBps) external override onlyGov {
        spreadBasisPoints[_token] = _spreadBps;
    }

    function setUseV2Pricing(bool) external override {}
    function setIsAmmEnabled(bool) external override {}
    function setIsSecondaryPriceEnabled(bool) external override {}
    function setSpreadThresholdBasisPoints(uint256) external override {}
    function setFavorPrimaryPrice(bool) external override {}
    function setPriceSampleSpace(uint256) external override {}
    function setMaxStrictPriceDeviation(uint256) external override {}

    function getAmmPrice(address) external view override returns (uint256) {
        return 0;
    }

    function getLatestPrimaryPrice(address _token) external view override returns (uint256) {
        return prices[_token];
    }

    function getPrimaryPrice(address _token, bool) external view override returns (uint256) {
        return prices[_token];
    }

    function setTokenConfig(address, address, uint256, bool) external override {}
}
