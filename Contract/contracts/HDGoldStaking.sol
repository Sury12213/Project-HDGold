// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "./SovicoToken.sol";

interface ISoulboundKYC {
    function hasKYC(address account) external view returns (bool);
}

contract HDGoldStaking is Ownable, ReentrancyGuard {
    IERC20 public hdg;
    IERC20 public usdt;
    SovicoToken public sovico;
    ISoulboundKYC public kycsbt;
    uint256 public totalStaked; // Tổng số HDG đang stake trên contract

    uint256 public rewardRateUSDT; // USDT per second per HDG (scaled 1e18)
    uint256 public rewardRateSOVI; // Sovico per second per HDG (scaled 1e18)

    struct StakeInfo {
        uint256 amount; // số HDG stake
        uint256 rewardUSDT; // reward tích lũy (chưa claim)
        uint256 rewardSOVI; // reward tích lũy (chưa claim)
        uint256 lastUpdate; // timestamp lần cuối update
    }

    mapping(address => StakeInfo) public stakes;

    event Staked(address indexed user, uint256 amount);
    event Unstaked(address indexed user, uint256 amount, uint256 usdtReward, uint256 sovicoReward);
    event RewardClaimed(address indexed user, uint256 usdtAmount, uint256 sovicoAmount);
    event Funded(uint256 usdtAmount);
    event RatesUpdated(uint256 usdtRate, uint256 sovicoRate);
    event InsufficientUSDT(address indexed user, uint256 usdtAmount);
    event VoucherRedeemed(address indexed user, uint256 voucherId, uint256 costSovi);


    constructor(
        address _hdg,
        address _usdt,
        address _sovico,
        address _kycsbt
    ) Ownable() {
        require(_hdg != address(0) && _usdt != address(0) && _sovico != address(0) && _kycsbt != address(0), "Invalid address");
        hdg = IERC20(_hdg);
        usdt = IERC20(_usdt);
        sovico = SovicoToken(_sovico);
        kycsbt = ISoulboundKYC(_kycsbt);
        // 5% per year (5 * 1e18) / (365 * 24 * 60 * 60))
        rewardRateUSDT = 1585489599; 
        // 10 SOVI per year (10 * 1e18) / (365 * 24 * 60 * 60))
        rewardRateSOVI = 3170979198;
    }

    modifier onlyKYC(address user) {
        require(kycsbt.hasKYC(user), "KYC required");
        _;
    }

    function _updateReward(address user) internal {
        StakeInfo storage stakeData = stakes[user];
        if (stakeData.amount > 0) {
            uint256 duration = block.timestamp - stakeData.lastUpdate;
            uint256 usdtReward = (stakeData.amount * rewardRateUSDT * duration) / 1e18;
            uint256 sovicoReward = (stakeData.amount * rewardRateSOVI * duration) / 1e18;
            stakeData.rewardUSDT += usdtReward;
            stakeData.rewardSOVI += sovicoReward;
        }
        stakeData.lastUpdate = block.timestamp;
    }

    function stake(uint256 amount) external nonReentrant onlyKYC(msg.sender) {
        require(amount > 0, "Invalid amount");
        _updateReward(msg.sender);
        require(hdg.transferFrom(msg.sender, address(this), amount), "HDG transfer failed");
        stakes[msg.sender].amount += amount;
        totalStaked += amount; // Cộng vào tổng stake
        emit Staked(msg.sender, amount);
    }

    function unstake(uint256 amount) external nonReentrant onlyKYC(msg.sender) {
        require(amount > 0, "Invalid amount");
        _updateReward(msg.sender);
        StakeInfo storage stakeData = stakes[msg.sender];
        require(stakeData.amount >= amount, "Insufficient stake");
        uint256 usdtReward = stakeData.rewardUSDT;
        uint256 sovicoReward = stakeData.rewardSOVI;

        stakeData.amount -= amount;
        totalStaked -= amount;

        uint256 usdtClaimed = 0;
        if (usdtReward > 0) {
            if (usdt.balanceOf(address(this)) >= usdtReward) {
                require(usdt.transfer(msg.sender, usdtReward), "USDT transfer failed");
                usdtClaimed = usdtReward;
                stakeData.rewardUSDT = 0;
            } else {
                emit InsufficientUSDT(msg.sender, usdtReward);
            }
        }
        if (sovicoReward > 0) {
            sovico.mint(msg.sender, sovicoReward);
            stakeData.rewardSOVI = 0;
        }
        require(hdg.transfer(msg.sender, amount), "HDG transfer failed");
        emit Unstaked(msg.sender, amount, usdtClaimed, sovicoReward);
    }

    function claimReward() external nonReentrant onlyKYC(msg.sender) {
        _updateReward(msg.sender);
        StakeInfo storage stakeData = stakes[msg.sender];
        uint256 usdtReward = stakeData.rewardUSDT;
        uint256 sovicoReward = stakeData.rewardSOVI;
        require(usdtReward > 0 || sovicoReward > 0, "No rewards");

        uint256 usdtClaimed = 0;
        if (usdtReward > 0) {
            if (usdt.balanceOf(address(this)) >= usdtReward) {
                require(usdt.transfer(msg.sender, usdtReward), "USDT transfer failed");
                usdtClaimed = usdtReward;
                stakeData.rewardUSDT = 0;
            } else {
                emit InsufficientUSDT(msg.sender, usdtReward);
            }
        }
        if (sovicoReward > 0) {
            sovico.mint(msg.sender, sovicoReward);
            stakeData.rewardSOVI = 0;
        }
        emit RewardClaimed(msg.sender, usdtClaimed, sovicoReward);
    }

    function fundRewards(uint256 usdtAmount) external onlyOwner {
        require(usdtAmount > 0, "Invalid amount");
        require(usdt.transferFrom(msg.sender, address(this), usdtAmount), "USDT transferFrom failed");
        emit Funded(usdtAmount);
    }

    function setRates(uint256 _usdtRate, uint256 _sovicoRate) external onlyOwner {
        rewardRateUSDT = _usdtRate;
        rewardRateSOVI = _sovicoRate;
        emit RatesUpdated(_usdtRate, _sovicoRate);
    }

    function pendingRewards(address user) external view returns (uint256 usdtReward, uint256 sovicoReward) {
        StakeInfo storage stakeData = stakes[user];
        usdtReward = stakeData.rewardUSDT;
        sovicoReward = stakeData.rewardSOVI;
        if (stakeData.amount > 0) {
            uint256 duration = block.timestamp - stakeData.lastUpdate;
            usdtReward += (stakeData.amount * rewardRateUSDT * duration) / 1e18;
            sovicoReward += (stakeData.amount * rewardRateSOVI * duration) / 1e18;
        }
    }
    
   function redeemVoucher(uint256 voucherId, uint256 costSovi) external onlyKYC(msg.sender) {
        require(sovico.balanceOf(msg.sender) >= costSovi, "Not enough points");
        sovico.burn(msg.sender, costSovi);
        emit VoucherRedeemed(msg.sender, voucherId, costSovi);
    }
}
