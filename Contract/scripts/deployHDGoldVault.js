const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying HDGoldVault with account:", deployer.address);

  const usdtAddress = "0x337610d27c682E347C9cD60BD4b3b107C9d34dDd"; // địa chỉ USDT
  const feederAddress = "0x570b30768B77709686afA1F8c7d3AE42cb35aa41"; // địa chỉ PriceFeeder
  const kycAddress = "0x33FEcC1536d8714499340b99545D54784096aE2C"; // địa chỉ SoulboundKYC

  const Vault = await ethers.getContractFactory("HDGoldVault");
  const vault = await Vault.deploy(usdtAddress, feederAddress, kycAddress);
  await vault.waitForDeployment();

  console.log("HDGoldVault deployed at:", await vault.getAddress());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
