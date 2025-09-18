const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with:", deployer.address);

  const usdtAddress = "0x337610d27c682E347C9cD60BD4b3b107C9d34dDd"; // địa chỉ USDT
  const hdgAddress = "0xa7440675ba7CB263dB1Fc2fb54818E8A18FF96c1"; // địa chỉ HDGoldVault
  const sovicoAddress = "0xec92ad3Cb33eB96511aCd2ba467DbF4e63819210"; // địa chỉ SovicoToken
  const kycAddress = "0x33FEcC1536d8714499340b99545D54784096aE2C"; // địa chỉ KycSBT

  // Deploy Staking
  const Staking = await ethers.getContractFactory("HDGoldStaking");
  const staking = await Staking.deploy(
    hdgAddress,
    usdtAddress,
    sovicoAddress,
    kycAddress
  );
  await staking.waitForDeployment();
  console.log("HDGoldStaking deployed to:", await staking.getAddress());

  // Chuyển ownership SovicoToken sang Staking để staking có quyền mint/burn
  const sovico = await ethers.getContractAt("SovicoToken", sovicoAddress);
  const tx = await sovico.transferOwnership(await staking.getAddress());
  await tx.wait();
  console.log("Transferred SovicoToken ownership to Staking contract");

  // (Tùy chọn) Fund USDT rewards ban đầu
  // const usdt = await ethers.getContractAt("MockUSDT", usdtAddress);
  // await usdt.approve(await staking.getAddress(), ethers.parseUnits("1000", 18));
  // await staking.fundRewards(ethers.parseUnits("1000", 18));
  // console.log("Funded 1000 USDT to staking contract");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
