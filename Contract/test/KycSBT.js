const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("SoulboundKYC", function () {
  let owner, user, other, kycsbt;

  beforeEach(async () => {
    [owner, user, other] = await ethers.getSigners();

    const KycSBT = await ethers.getContractFactory("SoulboundKYC");
    kycsbt = await KycSBT.deploy(); // v4.9: Ownable() không cần tham số
    await kycsbt.waitForDeployment();
  });

  // ---------------- HAPPY PATH ----------------
  describe("HAPPY PATH", () => {
    it("Owner mint thành công cho user", async () => {
      await expect(
        kycsbt.connect(owner).safeMint(user.address, "ipfs://kyc-data")
      )
        .to.emit(kycsbt, "Transfer") // ERC721 Transfer event
        .withArgs(ethers.ZeroAddress, user.address, 1n);

      expect(await kycsbt.balanceOf(user.address)).to.equal(1);
      expect(await kycsbt.hasKYC(user.address)).to.equal(true);
    });

    it("TokenURI lưu đúng metadata", async () => {
      await kycsbt.connect(owner).safeMint(user.address, "ipfs://kyc-data");
      expect(await kycsbt.tokenURI(1)).to.equal("ipfs://kyc-data");
    });
  });

  // ---------------- UNHAPPY PATH ----------------
  describe("UNHAPPY PATH", () => {
    it("Không phải owner thì không được mint", async () => {
      await expect(
        kycsbt.connect(user).safeMint(other.address, "ipfs://bad")
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("Không thể transfer token (soulbound)", async () => {
      await kycsbt.connect(owner).safeMint(user.address, "ipfs://kyc-data");

      await expect(
        kycsbt.connect(user).transferFrom(user.address, other.address, 1)
      ).to.be.revertedWith("Soulbound: non-transferable");
    });
  });
});
