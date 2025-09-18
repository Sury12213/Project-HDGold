const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();

  console.log("Deploying SovicoToken with account:", deployer.address);

  const Sovico = await ethers.getContractFactory("SovicoToken");
  const sovico = await Sovico.deploy();
  await sovico.waitForDeployment();

  console.log("✅ SovicoToken deployed at:", await sovico.getAddress());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
