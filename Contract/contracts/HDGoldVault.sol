// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

interface IPriceFeeder {
    function getChiUsd() external view returns (uint256);
    function lastUpdated() external view returns (uint256);
}

interface ISoulboundKYC {
    function hasKYC(address account) external view returns (bool);
}

contract HDGoldVault is ERC20, Ownable, ReentrancyGuard {
    IERC20 public usdt;
    IERC20Metadata public usdtMetadata;
    IPriceFeeder public priceFeeder;
    ISoulboundKYC public kycsbt;

    uint256 public constant FEE_BPS = 3; // 0.03% fee
    uint256 public constant BPS_DENOMINATOR = 10000;
    address public feeRecipient;
    uint256 public minUSDTReserve = 0;
    uint256 public priceMaxAge = 3600; // 1h

    event Minted(address indexed user, uint256 chiAmount, uint256 usdtAmount);
    event RedeemedUSDT(address indexed user, uint256 chiAmount, uint256 usdtAmount);
    event RedeemedPhysical(address indexed user, uint256 chiAmount);
    event OwnerMinted(address indexed owner, uint256 chiAmount);
    event Deposited(address indexed owner, string token, uint256 amount);
    event Withdrawn(address indexed owner, string token, uint256 amount);

    constructor(
        address _usdt,
        address _priceFeeder,
        address _kycsbt
    ) ERC20("HDGold", "HDG") Ownable() {
        require(_usdt != address(0) && _priceFeeder != address(0) && _kycsbt != address(0), "Invalid address");
        usdt = IERC20(_usdt);
        usdtMetadata = IERC20Metadata(_usdt);
        require(usdtMetadata.decimals() == 18, "USDT must have 18 decimals");
        priceFeeder = IPriceFeeder(_priceFeeder);
        kycsbt = ISoulboundKYC(_kycsbt);
        feeRecipient = msg.sender;
    }

    function _requireKYC(address account) private view {
        require(kycsbt.hasKYC(account), "KYC required");
    }

    function _usdPerChi() public view returns (uint256) {
        uint256 updated = priceFeeder.lastUpdated();
        require(block.timestamp - updated <= priceMaxAge, "Stale price");
        return priceFeeder.getChiUsd(); 
    }

    function quoteChiFromUSDT(uint256 usdtAmount) public view returns (uint256 chiAmount, uint256 fee) {
        uint256 usdPerChi = _usdPerChi();
        fee = (usdtAmount * FEE_BPS) / BPS_DENOMINATOR;
        uint256 usdtAfterFee = usdtAmount - fee;
        chiAmount = (usdtAfterFee * 1e18) / usdPerChi;
    }

    function quoteRedeemUSDT(uint256 chiAmount) public view returns (uint256 usdtOut, uint256 fee) {
        uint256 usdPerChi = _usdPerChi();
        uint256 usdtAmount = (chiAmount * usdPerChi) / 1e18;
        fee = (usdtAmount * FEE_BPS) / BPS_DENOMINATOR;
        usdtOut = usdtAmount - fee;
    }

    function mintByUSDT(uint256 usdtAmount) external nonReentrant {
        _requireKYC(msg.sender);
        require(usdtAmount > 0, "Invalid amount");

        (uint256 chiAmount, uint256 fee) = quoteChiFromUSDT(usdtAmount);
        require(chiAmount > 0, "Invalid chi amount");

        require(usdt.transferFrom(msg.sender, address(this), usdtAmount), "USDT transferFrom failed");
        if (fee > 0) {
            require(usdt.transfer(feeRecipient, fee), "Fee transfer failed");
        }

        _mint(msg.sender, chiAmount);
        emit Minted(msg.sender, chiAmount, usdtAmount);
    }

    function redeemToUSDT(uint256 chiAmount, uint256 minUsdt) external nonReentrant {
        _requireKYC(msg.sender);
        require(chiAmount > 0, "Invalid amount");

        (uint256 usdtOut, uint256 fee) = quoteRedeemUSDT(chiAmount);
        require(usdtOut >= minUsdt, "Slippage too high");
        require(usdt.balanceOf(address(this)) >= usdtOut, "Insufficient USDT reserves");

        _burn(msg.sender, chiAmount);
        require(usdt.transfer(msg.sender, usdtOut), "USDT transfer failed");
        if (fee > 0) {
            require(usdt.transfer(feeRecipient, fee), "Fee transfer failed");
        }

        emit RedeemedUSDT(msg.sender, chiAmount, usdtOut + fee);
    }

    function redeemPhysical(uint256 chiAmount) external nonReentrant {
        _requireKYC(msg.sender);
        require(chiAmount > 0 && chiAmount % 1e18 == 0, "Must be whole chi");
        _burn(msg.sender, chiAmount);
        emit RedeemedPhysical(msg.sender, chiAmount);
    }

    function mintForOwner(uint256 chiAmount) external onlyOwner {
        require(chiAmount > 0, "Invalid amount");
        _mint(msg.sender, chiAmount);
        emit OwnerMinted(msg.sender, chiAmount);
    }

    function depositHDG(uint256 chiAmount) external onlyOwner {
        require(chiAmount > 0, "Invalid amount");
        _transfer(msg.sender, address(this), chiAmount);
        emit Deposited(msg.sender, "HDG", chiAmount);
    }

    function depositUSDT(uint256 usdtAmount) external onlyOwner {
        require(usdtAmount > 0, "Invalid amount");
        require(usdt.transferFrom(msg.sender, address(this), usdtAmount), "USDT transferFrom failed");
        emit Deposited(msg.sender, "USDT", usdtAmount);
    }

    function withdrawHDG(uint256 chiAmount) external onlyOwner {
        require(chiAmount > 0, "Invalid amount");
        require(balanceOf(address(this)) >= chiAmount, "Insufficient HDG balance");
        _transfer(address(this), msg.sender, chiAmount);
        emit Withdrawn(msg.sender, "HDG", chiAmount);
    }

    function withdrawUSDT(uint256 usdtAmount) external onlyOwner {
        require(usdtAmount > 0, "Invalid amount");
        require(usdt.balanceOf(address(this)) >= usdtAmount + minUSDTReserve, "Insufficient USDT balance after reserve");
        require(usdt.transfer(msg.sender, usdtAmount), "USDT transfer failed");
        emit Withdrawn(msg.sender, "USDT", usdtAmount);
    }

    function setMinUSDTReserve(uint256 newReserve) external onlyOwner {
        minUSDTReserve = newReserve;
    }

    function setFeeRecipient(address newRecipient) external onlyOwner {
        require(newRecipient != address(0), "Invalid address");
        feeRecipient = newRecipient;
    }

    function setPriceMaxAge(uint256 newAge) external onlyOwner {
        require(newAge > 0, "Invalid age");
        priceMaxAge = newAge;
    }
}
