// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

contract MockPriceFeeder {
    uint256 private price;
    uint256 private updatedAt;

    constructor(uint256 _initialPrice) {
        price = _initialPrice;
        updatedAt = block.timestamp;
    }

    function getPrice() external view returns (uint256) {
        return price;
    }

    function lastUpdated() external view returns (uint256) {
        return updatedAt;
    }

    function setPrice(uint256 _newPrice) external {
        price = _newPrice;
        updatedAt = block.timestamp;
    }
}
