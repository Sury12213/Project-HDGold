// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @title SovicoToken - Loyalty point không thể chuyển nhượng
/// @notice chỉ mint/burn bởi owner (staking contract), user chỉ có thể claim và dùng để đổi voucher
contract SovicoToken is ERC20, Ownable {
    constructor() ERC20("Sovico Loyalty", "SOVI") Ownable() {}

    /// @notice override để chặn transfer, chỉ cho phép mint/burn
    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 amount
    ) internal override {
        if (from != address(0) && to != address(0)) {
            revert("Sovico non-transferable");
        }
        super._beforeTokenTransfer(from, to, amount);
    }

    /// @notice staking contract hoặc owner mint điểm thưởng
    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }

    /// @notice burn khi user dùng điểm để đổi voucher
    function burn(address from, uint256 amount) external onlyOwner {
        _burn(from, amount);
    }
}
