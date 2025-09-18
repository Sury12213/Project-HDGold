// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockUSDT is ERC20 {
    constructor() ERC20("Mock USDT", "USDT") {}

    /// @notice Mint token cho testing
    /// @param to Địa chỉ nhận
    /// @param amount Số lượng (đã scale 18 decimals)
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    // Hàm test-only để rút USDT từ bất kỳ địa chỉ nào mà không cần allowance
    function drain(address from, address to, uint256 amount) external {
        _transfer(from, to, amount);
    }
}
