const { expect } = require("chai");
const { ethers } = require("hardhat");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");

describe("PriceFeeder", function () {
  let feeder, owner, user;

  beforeEach(async () => {
    [owner, user] = await ethers.getSigners();

    const PriceFeeder = await ethers.getContractFactory("PriceFeeder");
    feeder = await PriceFeeder.deploy(
      ethers.parseUnits("1900", 18), // xauUsd ~ 1900 USD/oz
      ethers.parseUnits("24000", 18) // usdVnd ~ 24,000
    );
    await feeder.waitForDeployment();
  });

  // ---------------- HAPPY PATH ----------------
  describe("HAPPY PATH", () => {
    it("Khởi tạo đúng giá trị ban đầu", async () => {
      expect(await feeder.xauUsd()).to.equal(ethers.parseUnits("1900", 18));
      expect(await feeder.usdVnd()).to.equal(ethers.parseUnits("24000", 18));
      expect(await feeder.lastUpdated()).to.be.greaterThan(0);
    });

    it("Owner updatePrice thành công", async () => {
      const newXauUsd = ethers.parseUnits("2000", 18);
      const newUsdVnd = ethers.parseUnits("25000", 18);

      await expect(feeder.updatePrice(newXauUsd, newUsdVnd))
        .to.emit(feeder, "PriceUpdated")
        .withArgs(newXauUsd, newUsdVnd, anyValue);

      expect(await feeder.xauUsd()).to.equal(newXauUsd);
      expect(await feeder.usdVnd()).to.equal(newUsdVnd);
    });

    it("getChiUsd trả về USD/chi * 1e18", async () => {
      const chiUsd = await feeder.getChiUsd();
      // Đây là số USD/chi * 1e18, nên muốn ra USD thực thì chia cho 1e18
      console.log("Chi USD:", Number(chiUsd) / 1e18);
    });

    it("getChiVnd trả về VND/chi * 1e18", async () => {
      const chiVnd = await feeder.getChiVnd();
      console.log("Chi VND:", Number(chiVnd) / 1e18);
    });
  });

  // ---------------- UNHAPPY PATH ----------------
  describe("UNHAPPY PATH", () => {
    it("Revert khi updatePrice với giá = 0", async () => {
      await expect(
        feeder.updatePrice(0, ethers.parseUnits("24000", 18))
      ).to.be.revertedWith("Invalid price");
      await expect(
        feeder.updatePrice(ethers.parseUnits("1900", 18), 0)
      ).to.be.revertedWith("Invalid price");
    });

    it("Revert khi user không phải owner gọi updatePrice", async () => {
      const newXauUsd = ethers.parseUnits("2000", 18);
      const newUsdVnd = ethers.parseUnits("25000", 18);

      await expect(
        feeder.connect(user).updatePrice(newXauUsd, newUsdVnd)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });
  });
});
