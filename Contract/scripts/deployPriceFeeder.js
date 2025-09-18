const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with:", deployer.address);

  const PriceFeeder = await ethers.getContractFactory("PriceFeeder");

  // giá ban đầu ví dụ: 1900 USD/oz, 24000 VND/USD
  const xauUsd = ethers.parseUnits("1900", 18);
  const usdVnd = ethers.parseUnits("24000", 18);

  const feeder = await PriceFeeder.deploy(xauUsd, usdVnd);
  await feeder.waitForDeployment();

  console.log("PriceFeeder deployed to:", await feeder.getAddress());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
