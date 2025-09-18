const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("HDGoldStaking", function () {
  let owner, user1, user2, other;
  let hdg, usdt, kyc, staking, sovico, priceFeeder;
  const SECONDS_PER_YEAR = 365 * 24 * 60 * 60;
  const REWARD_RATE_USDT = BigInt(1585489599); // 5% per year
  const REWARD_RATE_SOVI = BigInt(3170979198); // 10 SOVI per year

  beforeEach(async () => {
    [owner, user1, user2, other] = await ethers.getSigners();

    // Deploy PriceFeeder
    const PriceFeeder = await ethers.getContractFactory("PriceFeeder");
    priceFeeder = await PriceFeeder.deploy(
      ethers.parseUnits("2000", 18), // xauUsd = 2000 USD/oz
      ethers.parseUnits("25000", 18) // usdVnd = 25000 VND/USD
    );
    await priceFeeder.waitForDeployment();
    const priceFeederAddress = await priceFeeder.getAddress();

    // Deploy MockUSDT (USDT)
    const USDT = await ethers.getContractFactory("MockUSDT");
    usdt = await USDT.deploy();
    await usdt.waitForDeployment();
    const usdtAddress = await usdt.getAddress();

    // Deploy KycSBT
    const KYC = await ethers.getContractFactory("SoulboundKYC");
    kyc = await KYC.deploy();
    await kyc.waitForDeployment();
    const kycAddress = await kyc.getAddress();

    // Deploy HDGoldVault (HDG)
    const HDGoldVault = await ethers.getContractFactory("HDGoldVault");
    hdg = await HDGoldVault.deploy(usdtAddress, priceFeederAddress, kycAddress);
    await hdg.waitForDeployment();
    const hdgAddress = await hdg.getAddress();

    // Deploy SovicoToken
    const Sovico = await ethers.getContractFactory("SovicoToken");
    sovico = await Sovico.deploy();
    await sovico.waitForDeployment();
    const sovicoAddress = await sovico.getAddress();

    // Deploy HDGoldStaking
    const Staking = await ethers.getContractFactory("HDGoldStaking");
    staking = await Staking.deploy(
      hdgAddress,
      usdtAddress,
      sovicoAddress,
      kycAddress
    );
    await staking.waitForDeployment();
    const stakingAddress = await staking.getAddress();

    // Chuyển ownership của SovicoToken cho HDGoldStaking
    await sovico.connect(owner).transferOwnership(stakingAddress);

    // Mint SBT cho user1, user2
    await kyc.connect(owner).safeMint(user1.address, "ipfs://dummy1");
    await kyc.connect(owner).safeMint(user2.address, "ipfs://dummy2");

    // Mint USDT và HDG cho user1, user2
    await usdt.mint(user1.address, ethers.parseUnits("10000", 18));
    await usdt.mint(user2.address, ethers.parseUnits("10000", 18));
    await usdt.connect(user1).approve(hdgAddress, ethers.MaxUint256);
    await usdt.connect(user2).approve(hdgAddress, ethers.MaxUint256);
    await hdg.connect(owner).mintForOwner(ethers.parseUnits("200", 18));
    await hdg
      .connect(owner)
      .transfer(user1.address, ethers.parseUnits("100", 18));
    await hdg
      .connect(owner)
      .transfer(user2.address, ethers.parseUnits("100", 18));
    await hdg.connect(user1).approve(stakingAddress, ethers.MaxUint256);
    await hdg.connect(user2).approve(stakingAddress, ethers.MaxUint256);

    // Mint USDT cho owner và fund rewards
    await usdt.mint(owner.address, ethers.parseUnits("10000", 18));
    await usdt.connect(owner).approve(stakingAddress, ethers.MaxUint256);
    await staking.connect(owner).fundRewards(ethers.parseUnits("5000", 18));
  });

  describe("HAPPY PATH", () => {
    it("stake: user1 và user2 stake, totalStaked đúng", async () => {
      const amount1 = ethers.parseUnits("10", 18);
      const amount2 = ethers.parseUnits("20", 18);
      await expect(staking.connect(user1).stake(amount1))
        .to.emit(staking, "Staked")
        .withArgs(user1.address, amount1);
      await expect(staking.connect(user2).stake(amount2))
        .to.emit(staking, "Staked")
        .withArgs(user2.address, amount2);
      expect(await staking.totalStaked()).to.equal(amount1 + amount2);
      expect((await staking.stakes(user1.address)).amount).to.equal(amount1);
      expect((await staking.stakes(user2.address)).amount).to.equal(amount2);
      expect(await hdg.balanceOf(user1.address)).to.equal(
        ethers.parseUnits("90", 18)
      );
      expect(await hdg.balanceOf(user2.address)).to.equal(
        ethers.parseUnits("80", 18)
      );
      expect(await hdg.balanceOf(await staking.getAddress())).to.equal(
        amount1 + amount2
      );
    });

    it("unstake: user1 unstake, nhận USDT + SOVI, totalStaked giảm", async () => {
      const amount1 = ethers.parseUnits("10", 18);
      const amount2 = ethers.parseUnits("20", 18);
      await staking.connect(user1).stake(amount1);
      await staking.connect(user2).stake(amount2);

      // Tăng 1 năm
      await ethers.provider.send("evm_increaseTime", [SECONDS_PER_YEAR]);
      await ethers.provider.send("evm_mine");

      const [expectedUsdtReward, expectedSovicoReward] =
        await staking.pendingRewards(user1.address);
      const initialUsdtBal = await usdt.balanceOf(user1.address);
      const initialSovicoBal = await sovico.balanceOf(user1.address);

      const tx = await staking.connect(user1).unstake(amount1);
      const receipt = await tx.wait();
      const event = receipt.logs.find((l) => l.eventName === "Unstaked");
      expect(event.args[2]).to.be.closeTo(
        expectedUsdtReward,
        1000000000000000n
      );
      expect(event.args[3]).to.be.closeTo(
        expectedSovicoReward,
        1000000000000000n
      );

      expect(await staking.totalStaked()).to.equal(amount2);
      expect((await staking.stakes(user1.address)).amount).to.equal(0);
      expect((await staking.stakes(user1.address)).rewardUSDT).to.equal(0);
      expect((await staking.stakes(user1.address)).rewardSOVI).to.equal(0);
      expect(await hdg.balanceOf(user1.address)).to.equal(
        ethers.parseUnits("100", 18)
      );
      expect(await usdt.balanceOf(user1.address)).to.be.closeTo(
        initialUsdtBal + expectedUsdtReward,
        1000000000000000n
      );
      expect(await sovico.balanceOf(user1.address)).to.be.closeTo(
        initialSovicoBal + expectedSovicoReward,
        1000000000000000n
      );
    });

    it("unstake: user1 unstake, giữ USDT reward nếu thiếu reserve", async () => {
      const amount = ethers.parseUnits("10", 18);
      await staking.connect(user1).stake(amount);

      // Tăng 1 năm
      await ethers.provider.send("evm_increaseTime", [SECONDS_PER_YEAR]);
      await ethers.provider.send("evm_mine");

      // Rút hết USDT từ staking contract
      const stakingAddr = await staking.getAddress();
      const stakingBal = await usdt.balanceOf(stakingAddr);
      await usdt.connect(owner).drain(stakingAddr, owner.address, stakingBal);

      const [expectedUsdtReward, expectedSovicoReward] =
        await staking.pendingRewards(user1.address);
      const initialUsdtBal = await usdt.balanceOf(user1.address);
      const initialSovicoBal = await sovico.balanceOf(user1.address);

      const tx = await staking.connect(user1).unstake(amount);
      const receipt = await tx.wait();
      const unstakedEvent = receipt.logs.find(
        (l) => l.eventName === "Unstaked"
      );
      const insufficientEvent = receipt.logs.find(
        (l) => l.eventName === "InsufficientUSDT"
      );
      expect(unstakedEvent.args[2]).to.equal(0);
      expect(unstakedEvent.args[3]).to.be.closeTo(
        expectedSovicoReward,
        1000000000000000n
      );
      expect(insufficientEvent.args[1]).to.be.closeTo(
        expectedUsdtReward,
        1000000000000000n
      );

      expect(await staking.totalStaked()).to.equal(0);
      expect((await staking.stakes(user1.address)).amount).to.equal(0);
      expect((await staking.stakes(user1.address)).rewardUSDT).to.be.closeTo(
        expectedUsdtReward,
        1000000000000000n
      );
      expect((await staking.stakes(user1.address)).rewardSOVI).to.equal(0);
      expect(await hdg.balanceOf(user1.address)).to.equal(
        ethers.parseUnits("100", 18)
      );
      expect(await usdt.balanceOf(user1.address)).to.equal(initialUsdtBal);
      expect(await sovico.balanceOf(user1.address)).to.be.closeTo(
        initialSovicoBal + expectedSovicoReward,
        1000000000000000n
      );
    });

    it("claimReward: user claim, vẫn nhận SOVI nếu thiếu USDT", async () => {
      const amount = ethers.parseUnits("10", 18);
      await staking.connect(user1).stake(amount);

      // Tăng 1 năm
      await ethers.provider.send("evm_increaseTime", [SECONDS_PER_YEAR]);
      await ethers.provider.send("evm_mine");

      // Rút hết USDT từ staking contract
      const stakingAddr = await staking.getAddress();
      const stakingBal = await usdt.balanceOf(stakingAddr);
      await usdt.connect(owner).drain(stakingAddr, owner.address, stakingBal);

      const [expectedUsdtReward, expectedSovicoReward] =
        await staking.pendingRewards(user1.address);
      const initialUsdtBal = await usdt.balanceOf(user1.address);
      const initialSovicoBal = await sovico.balanceOf(user1.address);

      const tx = await staking.connect(user1).claimReward();
      const receipt = await tx.wait();
      const rewardClaimedEvent = receipt.logs.find(
        (l) => l.eventName === "RewardClaimed"
      );
      const insufficientEvent = receipt.logs.find(
        (l) => l.eventName === "InsufficientUSDT"
      );
      expect(rewardClaimedEvent.args[1]).to.equal(0);
      expect(rewardClaimedEvent.args[2]).to.be.closeTo(
        expectedSovicoReward,
        1000000000000000n
      );
      expect(insufficientEvent.args[1]).to.be.closeTo(
        expectedUsdtReward,
        1000000000000000n
      );

      expect((await staking.stakes(user1.address)).amount).to.equal(amount);
      expect((await staking.stakes(user1.address)).rewardUSDT).to.be.closeTo(
        expectedUsdtReward,
        1000000000000000n
      );
      expect((await staking.stakes(user1.address)).rewardSOVI).to.equal(0);
      expect(await usdt.balanceOf(user1.address)).to.equal(initialUsdtBal);
      expect(await sovico.balanceOf(user1.address)).to.be.closeTo(
        initialSovicoBal + expectedSovicoReward,
        1000000000000000n
      );
    });

    it("fundRewards: owner nạp USDT", async () => {
      const usdtAmount = ethers.parseUnits("1000", 18);
      const initialUsdtBal = await usdt.balanceOf(await staking.getAddress());
      const tx = await staking.connect(owner).fundRewards(usdtAmount);
      await tx.wait();
      await expect(tx).to.emit(staking, "Funded").withArgs(usdtAmount);
      expect(await usdt.balanceOf(await staking.getAddress())).to.equal(
        initialUsdtBal + usdtAmount
      );
    });

    it("setRates: owner cập nhật reward rates", async () => {
      const newUsdtRate = REWARD_RATE_USDT * 2n;
      const newSovicoRate = REWARD_RATE_SOVI * 2n;
      const tx = await staking
        .connect(owner)
        .setRates(newUsdtRate, newSovicoRate);
      await tx.wait();
      await expect(tx)
        .to.emit(staking, "RatesUpdated")
        .withArgs(newUsdtRate, newSovicoRate);
      expect(await staking.rewardRateUSDT()).to.equal(newUsdtRate);
      expect(await staking.rewardRateSOVI()).to.equal(newSovicoRate);
    });

    it("pendingRewards: tính reward đang chờ", async () => {
      const amount = ethers.parseUnits("10", 18);
      await staking.connect(user1).stake(amount);

      // Tăng 1 năm
      await ethers.provider.send("evm_increaseTime", [SECONDS_PER_YEAR]);
      await ethers.provider.send("evm_mine");

      const [usdtReward, sovicoReward] = await staking.pendingRewards(
        user1.address
      );
      const expectedUsdtReward =
        (amount * REWARD_RATE_USDT * BigInt(SECONDS_PER_YEAR)) / BigInt(1e18);
      const expectedSovicoReward =
        (amount * REWARD_RATE_SOVI * BigInt(SECONDS_PER_YEAR)) / BigInt(1e18);
      expect(usdtReward).to.be.closeTo(expectedUsdtReward, 1000000000000000n);
      expect(sovicoReward).to.be.closeTo(
        expectedSovicoReward,
        1000000000000000n
      );
    });

    it("redeemVoucher: user đổi voucher bằng SOVI", async () => {
      const amount = ethers.parseUnits("10", 18);
      await staking.connect(user1).stake(amount);

      // Tăng 1 năm, claim SOVI
      await ethers.provider.send("evm_increaseTime", [SECONDS_PER_YEAR]);
      await ethers.provider.send("evm_mine");
      await staking.connect(user1).claimReward();

      const [, expectedSovicoReward] = await staking.pendingRewards(
        user1.address
      );
      const sovicoAmount = expectedSovicoReward; // Dùng chính xác số SOVI nhận được
      const voucherId = 123;
      const initialSovicoBal = await sovico.balanceOf(user1.address);
      const tx = await staking
        .connect(user1)
        .redeemVoucher(voucherId, sovicoAmount);
      await tx.wait();

      await expect(tx)
        .to.emit(staking, "VoucherRedeemed")
        .withArgs(user1.address, voucherId, sovicoAmount);
      expect(await sovico.balanceOf(user1.address)).to.equal(
        initialSovicoBal - sovicoAmount
      );
    });
  });

  describe("UNHAPPY PATH", () => {
    it("NotKYC: user không có SBT không thể stake/unstake/claim/redeem", async () => {
      const amount = ethers.parseUnits("10", 18);
      await expect(staking.connect(other).stake(amount)).to.be.revertedWith(
        "KYC required"
      );
      await expect(staking.connect(other).unstake(amount)).to.be.revertedWith(
        "KYC required"
      );
      await expect(staking.connect(other).claimReward()).to.be.revertedWith(
        "KYC required"
      );
      await expect(
        staking.connect(other).redeemVoucher(123, amount)
      ).to.be.revertedWith("KYC required");
    });

    it("Invalid amount: stake/unstake với 0", async () => {
      await expect(staking.connect(user1).stake(0)).to.be.revertedWith(
        "Invalid amount"
      );
      await expect(staking.connect(user1).unstake(0)).to.be.revertedWith(
        "Invalid amount"
      );
    });

    it("Insufficient stake: unstake nhiều hơn số staked", async () => {
      const amount = ethers.parseUnits("10", 18);
      await staking.connect(user1).stake(amount);
      await expect(
        staking.connect(user1).unstake(ethers.parseUnits("11", 18))
      ).to.be.revertedWith("Insufficient stake");
    });

    it("No rewards: claim khi không có reward", async () => {
      await expect(staking.connect(user1).claimReward()).to.be.revertedWith(
        "No rewards"
      );
    });

    it("Insufficient SOVI: redeem voucher khi không đủ SOVI", async () => {
      const sovicoAmount = ethers.parseUnits("100", 18);
      await expect(
        staking.connect(user1).redeemVoucher(123, sovicoAmount)
      ).to.be.revertedWith("Not enough points");
    });

    it("onlyOwner: non-owner gọi fundRewards/setRates", async () => {
      const usdtAmount = ethers.parseUnits("100", 18);
      await expect(
        staking.connect(user1).fundRewards(usdtAmount)
      ).to.be.revertedWith("Ownable: caller is not the owner");
      await expect(staking.connect(user1).setRates(1, 1)).to.be.revertedWith(
        "Ownable: caller is not the owner"
      );
    });
  });
});
