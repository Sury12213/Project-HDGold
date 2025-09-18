const { expect } = require("chai");
const { ethers, network } = require("hardhat");

describe("HDGoldVault", function () {
  let owner, user, other;
  let usdt, kyc, feeder, vault;

  beforeEach(async () => {
    [owner, user, other] = await ethers.getSigners();

    // Mock USDT (18 decimals)
    const USDT = await ethers.getContractFactory("MockUSDT");
    usdt = await USDT.deploy();
    await usdt.waitForDeployment();

    // KYC contract
    const KYC = await ethers.getContractFactory("SoulboundKYC");
    kyc = await KYC.deploy();
    await kyc.waitForDeployment();

    // PriceFeeder
    const Feeder = await ethers.getContractFactory("PriceFeeder");
    feeder = await Feeder.deploy(
      ethers.parseUnits("1900", 18), // xauUsd
      ethers.parseUnits("24000", 18) // usdVnd
    );
    await feeder.waitForDeployment();

    // Vault
    const Vault = await ethers.getContractFactory("HDGoldVault");
    vault = await Vault.deploy(
      await usdt.getAddress(),
      await feeder.getAddress(),
      await kyc.getAddress()
    );
    await vault.waitForDeployment();

    // Mint KYC SBT cho user
    await kyc.connect(owner).safeMint(user.address, "ipfs://kyc");

    // Mint USDT cho user
    await usdt.mint(user.address, ethers.parseUnits("1000", 18));
    await usdt
      .connect(user)
      .approve(await vault.getAddress(), ethers.MaxUint256);
  });

  // ---------------- HAPPY PATH ----------------
  describe("HAPPY PATH", () => {
    it("User mintByUSDT thành công", async () => {
      const usdtIn = ethers.parseUnits("100", 18);
      const [chiQuote] = await vault.quoteChiFromUSDT(usdtIn);

      await expect(vault.connect(user).mintByUSDT(usdtIn))
        .to.emit(vault, "Minted")
        .withArgs(user.address, chiQuote, usdtIn);

      expect(await vault.balanceOf(user.address)).to.equal(chiQuote);
    });

    it("User redeemToUSDT thành công", async () => {
      const usdtIn = ethers.parseUnits("50", 18);
      const [chiQuote] = await vault.quoteChiFromUSDT(usdtIn);

      await vault.connect(user).mintByUSDT(usdtIn);

      await expect(vault.connect(user).redeemToUSDT(chiQuote, 0)).to.emit(
        vault,
        "RedeemedUSDT"
      );

      expect(await vault.balanceOf(user.address)).to.equal(0);
    });

    it("User redeemPhysical thành công (nguyên chỉ)", async () => {
      const usdtIn = ethers.parseUnits("500", 18); // để chắc chắn có vài chỉ nguyên
      await vault.connect(user).mintByUSDT(usdtIn);

      const chiBal = await vault.balanceOf(user.address);
      const wholeChi = (chiBal / 10n ** 18n) * 10n ** 18n;

      if (wholeChi > 0n) {
        await expect(vault.connect(user).redeemPhysical(wholeChi))
          .to.emit(vault, "RedeemedPhysical")
          .withArgs(user.address, wholeChi);
      }
    });
  });

  // ---------------- UNHAPPY PATH ----------------
  describe("UNHAPPY PATH", () => {
    it("Không có KYC thì mint fail", async () => {
      const usdtIn = ethers.parseUnits("10", 18);
      await expect(vault.connect(other).mintByUSDT(usdtIn)).to.be.revertedWith(
        "KYC required"
      );
    });

    it("Giá stale thì mint fail", async () => {
      // tăng thời gian > 3600s để trigger stale
      await network.provider.send("evm_increaseTime", [7200]);
      await network.provider.send("evm_mine");

      const usdtIn = ethers.parseUnits("10", 18);
      await expect(vault.connect(user).mintByUSDT(usdtIn)).to.be.revertedWith(
        "Stale price"
      );
    });

    it("redeemPhysical với số lẻ fail", async () => {
      const usdtIn = ethers.parseUnits("100", 18);
      await vault.connect(user).mintByUSDT(usdtIn);

      const chiBal = await vault.balanceOf(user.address);
      const halfChi = chiBal / 2n;

      await expect(
        vault.connect(user).redeemPhysical(halfChi)
      ).to.be.revertedWith("Must be whole chi");
    });

    it("Chuyển HDG cho ví chưa KYC rồi redeem fail", async () => {
      const usdtIn = ethers.parseUnits("20", 18);
      const [chiQuote] = await vault.quoteChiFromUSDT(usdtIn);

      await vault.connect(user).mintByUSDT(usdtIn);
      await vault.connect(user).transfer(other.address, chiQuote);

      await expect(
        vault.connect(other).redeemToUSDT(chiQuote, 0)
      ).to.be.revertedWith("KYC required");
    });
  });
});
