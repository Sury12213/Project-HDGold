const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying with account:", deployer.address);

  const KycSBT = await ethers.getContractFactory("SoulboundKYC");
  const kycsbt = await KycSBT.deploy();
  await kycsbt.waitForDeployment();

  console.log("SoulboundKYC deployed to:", await kycsbt.getAddress());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
