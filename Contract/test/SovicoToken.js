const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("SovicoToken", function () {
  let Sovico, sovico, owner, user, other;

  beforeEach(async () => {
    [owner, user, other] = await ethers.getSigners();
    Sovico = await ethers.getContractFactory("SovicoToken");
    sovico = await Sovico.deploy();
    await sovico.waitForDeployment();
  });

  describe("HAPPY PATH", () => {
    it("Owner mint thành công cho user", async () => {
      await expect(sovico.mint(user.address, 1000))
        .to.emit(sovico, "Transfer")
        .withArgs(ethers.ZeroAddress, user.address, 1000);

      expect(await sovico.balanceOf(user.address)).to.equal(1000);
    });

    it("Owner burn thành công từ user", async () => {
      await sovico.mint(user.address, 500);
      await expect(sovico.burn(user.address, 200))
        .to.emit(sovico, "Transfer")
        .withArgs(user.address, ethers.ZeroAddress, 200);

      expect(await sovico.balanceOf(user.address)).to.equal(300);
    });
  });

  describe("UNHAPPY PATH", () => {
    it("Không phải owner thì không được mint", async () => {
      await expect(sovico.connect(user).mint(user.address, 100)).to.be
        .revertedWithCustomError;
    });

    it("Không thể transfer token giữa 2 user", async () => {
      await sovico.mint(user.address, 1000);
      await expect(
        sovico.connect(user).transfer(other.address, 100)
      ).to.be.revertedWith("Sovico non-transferable");
    });
  });
});
