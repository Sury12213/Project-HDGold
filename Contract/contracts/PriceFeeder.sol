// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/access/Ownable.sol";

contract PriceFeeder is Ownable {
    uint256 public xauUsd;   // Giá vàng quốc tế USD/oz, scale 1e18 (từ Supra Oracle)
    uint256 public usdVnd;   // Tỷ giá VND/USD, scale 1e18
    uint256 public lastUpdated;

    uint256 private constant CHI_TO_OUNCE = 120565000000000000; // 1 chỉ = 0.120565 oz, scale 1e18

    event PriceUpdated(uint256 xauUsd, uint256 usdVnd, uint256 timestamp);

    constructor(uint256 _xauUsd, uint256 _usdVnd) Ownable() {
        require(_xauUsd > 0 && _usdVnd > 0, "Invalid price");
        xauUsd = _xauUsd;
        usdVnd = _usdVnd;
        lastUpdated = block.timestamp;
        emit PriceUpdated(_xauUsd, _usdVnd, block.timestamp);
    }

    function updatePrice(uint256 _xauUsd, uint256 _usdVnd) external onlyOwner {
        require(_xauUsd > 0 && _usdVnd > 0, "Invalid price");
        xauUsd = _xauUsd;
        usdVnd = _usdVnd;
        lastUpdated = block.timestamp;
        emit PriceUpdated(_xauUsd, _usdVnd, block.timestamp);
    }

    function getChiUsd() public view returns (uint256) {
    return (xauUsd * CHI_TO_OUNCE) / 1e18;
    }

    function getChiVnd() public view returns (uint256) {       
        return (getChiUsd() * usdVnd) / 1e18;
    }
}