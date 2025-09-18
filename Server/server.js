// server.js
require("dotenv").config();
const express = require("express");
const { ethers } = require("ethers");
const cors = require("cors");
const fs = require("fs");

// ===== CONFIG =====
const PORT = 4000;
const RPC_URL = "https://bsc-testnet-rpc.publicnode.com";
const KYC_SBT_ADDRESS = "0x33FEcC1536d8714499340b99545D54784096aE2C";

// Load ABI từ file JSON
let raw = JSON.parse(fs.readFileSync("./SoulboundKYC.json", "utf8"));
const KYC_SBT_ABI = raw.abi ? raw.abi : raw;

// Provider
const provider = new ethers.JsonRpcProvider(RPC_URL);

// Lấy private key từ .env
const ownerKey = (process.env.OWNER_PRIVATE_KEY || "").trim();
if (!ownerKey || !ownerKey.startsWith("0x") || ownerKey.length !== 66) {
  throw new Error(
    "❌ Private key không hợp lệ. Check lại .env (phải có 0x + 64 hex)."
  );
}

// Wallet owner
const ownerWallet = new ethers.Wallet(ownerKey, provider);

// Contract instance
const contract = new ethers.Contract(KYC_SBT_ADDRESS, KYC_SBT_ABI, ownerWallet);

// Express app
const app = express();
app.use(cors());
app.use(express.json());

// ====== ROUTES ======

// Mint KYC SBT cho user
app.post("/kyc/mint", async (req, res) => {
  try {
    const { userAddress } = req.body;

    if (!ethers.isAddress(userAddress)) {
      return res.status(400).json({ error: "Invalid user address" });
    }

    console.log(`🚀 Minting KYC SBT cho ${userAddress}...`);

    const uri = "ipfs://demo-json"; // demo URI (có thể để IPFS link metadata NFT)
    const tx = await contract.safeMint(userAddress, uri);
    await tx.wait();

    res.json({ success: true, txHash: tx.hash });
  } catch (err) {
    console.error("❌ Lỗi khi mint:", err);
    res.status(500).json({ error: err.message });
  }
});

// Kiểm tra user đã có KYC chưa
app.get("/kyc/check/:address", async (req, res) => {
  try {
    const userAddress = req.params.address;
    if (!ethers.isAddress(userAddress)) {
      return res.status(400).json({ error: "Invalid address" });
    }

    const balance = await contract.balanceOf(userAddress);
    res.json({ address: userAddress, kyc: balance > 0 });
  } catch (err) {
    console.error("❌ Lỗi khi check KYC:", err);
    res.status(500).json({ error: err.message });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`✅ KYC Server running at http://localhost:${PORT}`);
  console.log(`✅ Owner wallet: ${ownerWallet.address}`);
});
