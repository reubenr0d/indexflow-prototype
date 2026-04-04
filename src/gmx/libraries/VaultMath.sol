// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

import "./math/SafeMath.sol";

/// @notice Pure pricing / funding math extracted from Vault for bytecode size (EIP-170).
library VaultMath {
    using SafeMath for uint256;

    uint256 private constant BASIS_POINTS_DIVISOR = 10000;

    function _deltaCore(
        uint256 _markPrice,
        uint256 _size,
        uint256 _averagePrice,
        bool _isLong,
        uint256 _lastIncreasedTime,
        uint256 _minProfitTime,
        uint256 _minProfitBasisPoints,
        uint256 _blockTimestamp
    ) internal pure returns (bool hasProfit, uint256 deltaOut) {
        uint256 price = _markPrice;
        uint256 priceDelta = _averagePrice > price ? _averagePrice.sub(price) : price.sub(_averagePrice);
        deltaOut = _size.mul(priceDelta).div(_averagePrice);

        if (_isLong) {
            hasProfit = price > _averagePrice;
        } else {
            hasProfit = _averagePrice > price;
        }

        uint256 minBps = _blockTimestamp > _lastIncreasedTime.add(_minProfitTime) ? 0 : _minProfitBasisPoints;
        if (hasProfit && deltaOut.mul(BASIS_POINTS_DIVISOR) <= _size.mul(minBps)) {
            deltaOut = 0;
        }
    }

    function delta(
        uint256 _markPrice,
        uint256 _size,
        uint256 _averagePrice,
        bool _isLong,
        uint256 _lastIncreasedTime,
        uint256 _minProfitTime,
        uint256 _minProfitBasisPoints,
        uint256 _blockTimestamp
    ) public pure returns (bool, uint256) {
        return _deltaCore(
            _markPrice,
            _size,
            _averagePrice,
            _isLong,
            _lastIncreasedTime,
            _minProfitTime,
            _minProfitBasisPoints,
            _blockTimestamp
        );
    }

    function nextAveragePrice(
        uint256 _markPrice,
        uint256 _size,
        uint256 _averagePrice,
        bool _isLong,
        uint256 _nextPrice,
        uint256 _sizeDelta,
        uint256 _lastIncreasedTime,
        uint256 _minProfitTime,
        uint256 _minProfitBasisPoints,
        uint256 _blockTimestamp
    ) public pure returns (uint256) {
        (bool hasProfit, uint256 d) = _deltaCore(
            _markPrice,
            _size,
            _averagePrice,
            _isLong,
            _lastIncreasedTime,
            _minProfitTime,
            _minProfitBasisPoints,
            _blockTimestamp
        );
        uint256 nextSize = _size.add(_sizeDelta);
        uint256 divisor;
        if (_isLong) {
            divisor = hasProfit ? nextSize.add(d) : nextSize.sub(d);
        } else {
            divisor = hasProfit ? nextSize.sub(d) : nextSize.add(d);
        }
        return _nextPrice.mul(nextSize).div(divisor);
    }
}
