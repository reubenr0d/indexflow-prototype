// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Minimal mutable Chainlink-style feed for local testing and scripts.
contract MockChainlinkFeed {
    int256 private _answer;
    uint256 private _updatedAt;
    uint8 private immutable _decimals;
    string private _description;

    constructor(uint8 decimals_, string memory description_) {
        _decimals = decimals_;
        _description = description_;
    }

    function setLatestAnswer(int256 answer_, uint256 updatedAt_) external {
        _answer = answer_;
        _updatedAt = updatedAt_;
    }

    function latestRoundData()
        external
        view
        returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)
    {
        return (1, _answer, _updatedAt, _updatedAt, 1);
    }

    function decimals() external view returns (uint8) {
        return _decimals;
    }

    function description() external view returns (string memory) {
        return _description;
    }
}
