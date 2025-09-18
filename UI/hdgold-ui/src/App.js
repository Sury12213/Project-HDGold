/* eslint-disable no-undef */

import React, { useState, useEffect } from "react";
import Web3 from "web3";
import {
  VAULT_ADDRESS,
  VAULT_ABI,
  USDT_ADDRESS,
  STAKING_ABI,
  STAKING_ADDRESS,
} from "./constants";
import { QRCodeCanvas } from "qrcode.react";
import "./App.css";

export const PRICE_FEEDER_ADDRESS =
  "0x570b30768B77709686afA1F8c7d3AE42cb35aa41";
export const PRICE_FEEDER_ABI = [
  {
    constant: true,
    inputs: [],
    name: "getChiVnd",
    outputs: [{ name: "", type: "uint256" }],
    type: "function",
  },
];
// ABI tối thiểu cho USDT (BEP20/ERC20)
const USDT_ABI = [
  {
    constant: true,
    inputs: [
      { name: "_owner", type: "address" },
      { name: "_spender", type: "address" },
    ],
    name: "allowance",
    outputs: [{ name: "", type: "uint256" }],
    type: "function",
  },
  {
    constant: false,
    inputs: [
      { name: "_spender", type: "address" },
      { name: "_value", type: "uint256" },
    ],
    name: "approve",
    outputs: [{ name: "", type: "bool" }],
    type: "function",
  },
  {
    constant: true,
    inputs: [{ name: "_owner", type: "address" }],
    name: "balanceOf",
    outputs: [{ name: "", type: "uint256" }],
    type: "function",
  },
];

function App() {
  const [account, setAccount] = useState(null);
  const [web3, setWeb3] = useState(null);
  const [vault, setVault] = useState(null);
  const [usdt, setUsdt] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [isApproved, setIsApproved] = useState(false);

  const [goldPrice, setGoldPrice] = useState("0");
  const [usdtBalance, setUsdtBalance] = useState("0");
  const [hdgBalance, setHdgBalance] = useState("0");

  const [tab, setTab] = useState("mint");
  const [usdtValue, setUsdtValue] = useState("");
  const [hdgValue, setHdgValue] = useState("");

  const [voucherList] = useState([
    { id: 1, name: "Giảm 5% Hàng không", cost: "50" },
    { id: 2, name: "Giảm 10% Khách sạn", cost: "100" },
  ]);
  const [selectedVoucher, setSelectedVoucher] = useState(null);
  const [totalStaked, setTotalStaked] = useState("0");
  const [myStaked, setMyStaked] = useState("0");
  const [apyUSDT, setApyUSDT] = useState("0");
  const [apySOVI, setApySOVI] = useState("0");
  const [pendingUSDT, setPendingUSDT] = useState("0");
  const [pendingSOVI, setPendingSOVI] = useState("0");
  const [kycStatus, setKycStatus] = useState(false);

  const [qrData, setQrData] = useState(null);

  // Kết nối ví và kiểm tra network (BSC Testnet chainId = 97)
  const connectWallet = async () => {
    if (window.ethereum) {
      const w3 = new Web3(window.ethereum);
      await window.ethereum.request({ method: "eth_requestAccounts" });
      const accounts = await w3.eth.getAccounts();
      const chainId = await w3.eth.getChainId();

      if (chainId !== 97) {
        try {
          await window.ethereum.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: "0x61" }],
          });
        } catch (switchError) {
          if (switchError.code === 4902) {
            await window.ethereum.request({
              method: "wallet_addEthereumChain",
              params: [
                {
                  chainId: "0x61",
                  chainName: "BSC Testnet",
                  nativeCurrency: { name: "BNB", symbol: "BNB", decimals: 18 },
                  rpcUrls: ["https://data-seed-prebsc-1-s1.binance.org:8545/"],
                  blockExplorerUrls: ["https://testnet.bscscan.com"],
                },
              ],
            });
          } else {
            alert("Vui lòng switch sang BSC Testnet thủ công trong MetaMask!");
            return;
          }
        }
      }

      setAccount(accounts[0]);
      setWeb3(w3);

      const vaultContract = new w3.eth.Contract(VAULT_ABI, VAULT_ADDRESS);
      setVault(vaultContract);
      window.vault = vaultContract;

      const usdtContract = new w3.eth.Contract(USDT_ABI, USDT_ADDRESS);
      setUsdt(usdtContract);

      console.log("Vault methods:", Object.keys(vaultContract.methods));
      console.log("Vault address:", vaultContract._address);
    } else {
      alert("Bạn cần cài MetaMask!");
    }
  };
  //KYC
  const requestKYC = async () => {
    if (!account) return;
    try {
      const res = await fetch("http://localhost:4000/kyc/mint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userAddress: account }),
      });
      const data = await res.json();
      if (data.success) {
        alert("✅ Mint KYC thành công! Tx: " + data.txHash);
        setKycStatus(true);
      } else {
        alert("❌ Lỗi: " + data.error);
      }
    } catch (err) {
      console.error("Lỗi khi gọi API KYC:", err);
    }
  };

  const checkKYC = async () => {
    if (!account) return;
    try {
      const res = await fetch(`http://localhost:4000/kyc/check/${account}`);
      const data = await res.json();
      setKycStatus(data.kyc);
    } catch (err) {
      console.error("Lỗi khi check KYC:", err);
    }
  };
  // Fetch giá vàng từ PriceFeeder
  const fetchGoldPrice = async () => {
    if (!web3) return;
    try {
      const feeder = new web3.eth.Contract(
        PRICE_FEEDER_ABI,
        PRICE_FEEDER_ADDRESS
      );
      const chiVnd = await feeder.methods.getChiVnd().call();
      const price = web3.utils.fromWei(chiVnd.toString(), "ether"); // vì scale 1e18
      setGoldPrice(
        Number(price).toLocaleString("vi-VN", { maximumFractionDigits: 0 })
      );
    } catch (err) {
      console.error("Lỗi khi lấy giá vàng:", err);
    }
  };

  // Lấy số dư USDT và HDG
  const fetchBalances = async () => {
    if (!usdt || !vault || !account) return;
    try {
      const usdtBal = await usdt.methods.balanceOf(account).call();
      setUsdtBalance(web3.utils.fromWei(usdtBal.toString(), "ether"));

      const hdgBal = await vault.methods.balanceOf(account).call();
      setHdgBalance(web3.utils.fromWei(hdgBal.toString(), "ether"));
    } catch (err) {
      console.error("Lỗi khi lấy số dư:", err);
    }
  };
  useEffect(() => {
    if (web3) {
      fetchGoldPrice();
    }
  }, [web3]);

  useEffect(() => {
    if (account) {
      checkKYC();
    }
  }, [account]);

  useEffect(() => {
    if (account && usdt && vault) {
      fetchBalances();
    }
  }, [account, usdt, vault]);

  useEffect(() => {
    if (tab === "staking" && account) {
      fetchStakingInfo();
    }
  }, [tab, account]);

  // Kiểm tra allowance và số dư USDT
  const checkAllowanceAndBalance = async (usdtAmount) => {
    if (!usdt || !account) return false;
    try {
      const allowance = await usdt.methods
        .allowance(account, VAULT_ADDRESS)
        .call();
      const balance = await usdt.methods.balanceOf(account).call();
      const usdtInput = web3.utils.toWei(usdtAmount.toString(), "ether");
      console.log(
        "Allowance:",
        allowance,
        "Balance:",
        balance,
        "Required:",
        usdtInput
      );
      return allowance >= usdtInput && balance >= usdtInput;
    } catch (err) {
      console.error("Lỗi khi kiểm tra allowance/balance:", err);
      return false;
    }
  };

  const handleUsdtInput = async (val) => {
    setUsdtValue(val);
    setErrorMessage("");
    setIsApproved(false);
    if (!vault || !val || isNaN(val)) {
      setHdgValue("");
      return;
    }
    try {
      const usdtInput = web3.utils.toWei(val.toString(), "ether");
      const result = await vault.methods.quoteChiFromUSDT(usdtInput).call();
      const chiQuote = result[0];
      setHdgValue(
        Number(web3.utils.fromWei(chiQuote.toString(), "ether")).toFixed(6)
      );

      const approved = await checkAllowanceAndBalance(val);
      setIsApproved(approved);
    } catch (err) {
      console.error("Lỗi khi gọi quoteChiFromUSDT:", err);
      setErrorMessage(
        "Lỗi khi tính giá: " + (err.message || "Không xác định.")
      );
      setHdgValue("");
    }
  };

  const setMaxUsdt = () => {
    setUsdtValue(usdtBalance);
    handleUsdtInput(usdtBalance);
  };

  const mint = async () => {
    if (!usdtValue || isNaN(usdtValue)) {
      setErrorMessage("Vui lòng nhập số lượng USDT hợp lệ");
      return;
    }
    setErrorMessage("");
    try {
      const usdtInput = web3.utils.toWei(usdtValue.toString(), "ether");
      if (!isApproved) {
        await usdt.methods
          .approve(VAULT_ADDRESS, usdtInput)
          .send({ from: account });
        setIsApproved(true);
      }
      await vault.methods.mintByUSDT(usdtInput).send({ from: account });
      alert("Mint thành công!");
      setIsApproved(false);
      fetchBalances();
    } catch (err) {
      console.error("Lỗi khi mint:", err);
      setErrorMessage("Lỗi khi mint: " + (err.message || "Không xác định."));
    }
  };

  const handleHdgInput = async (val) => {
    setHdgValue(val);
    setErrorMessage("");
    if (!vault || !val || isNaN(val) || Number(val) <= 0) {
      setUsdtValue("");
      return;
    }
    try {
      const chiAmount = web3.utils.toWei(val.toString(), "ether");
      const result = await vault.methods.quoteRedeemUSDT(chiAmount).call();
      const usdtQuote = result[0];
      setUsdtValue(
        Number(web3.utils.fromWei(usdtQuote.toString(), "ether")).toFixed(6)
      );
    } catch (err) {
      console.error("Lỗi khi gọi quoteRedeemUSDT:", err);
      setErrorMessage(
        "Lỗi khi tính giá: " + (err.message || "Không xác định.")
      );
      setUsdtValue("");
    }
  };

  const setMaxHdg = () => {
    setHdgValue(hdgBalance);
    handleHdgInput(hdgBalance);
  };

  const burn = async () => {
    if (!hdgValue || isNaN(hdgValue) || Number(hdgValue) <= 0) {
      setErrorMessage("Vui lòng nhập số lượng HDG hợp lệ");
      return;
    }
    try {
      const chiAmount = web3.utils.toWei(hdgValue.toString(), "ether");
      const result = await vault.methods.quoteRedeemUSDT(chiAmount).call();
      const usdtOut = result[0].toString();

      await vault.methods
        .redeemToUSDT(chiAmount, usdtOut)
        .send({ from: account });

      alert("Redeem thành công!");
      fetchBalances();
    } catch (err) {
      console.error("Lỗi khi redeem:", err);
      setErrorMessage("Lỗi khi redeem: " + (err.message || "Không xác định."));
    }
  };

  // Redeem Physical
  const redeemPhysical = async () => {
    if (!hdgValue || isNaN(hdgValue)) {
      setErrorMessage("Vui lòng nhập số lượng HDG hợp lệ");
      return;
    }
    setErrorMessage("");
    try {
      const chiAmount = web3.utils.toWei(hdgValue.toString(), "ether");
      const tx = await vault.methods
        .redeemPhysical(chiAmount)
        .send({ from: account });

      const qrPayload = JSON.stringify({
        txHash: tx.transactionHash,
        chiAmount: hdgValue,
        wallet: account,
      });

      setQrData(qrPayload);
    } catch (err) {
      console.error("Lỗi khi redeemPhysical:", err);
      setErrorMessage(
        "Lỗi khi redeemPhysical: " + (err.message || "Không xác định.")
      );
    }
  };

  // Staking
  const fetchStakingInfo = async () => {
    if (!account) return;
    try {
      const stakingContract = new web3.eth.Contract(
        STAKING_ABI,
        STAKING_ADDRESS
      );

      const total = await stakingContract.methods.totalStaked().call();
      setTotalStaked(web3.utils.fromWei(total.toString(), "ether"));

      const userStake = await stakingContract.methods.stakes(account).call();
      setMyStaked(web3.utils.fromWei(userStake.amount.toString(), "ether"));

      const SECONDS_PER_YEAR = 365 * 24 * 60 * 60;

      const rewardRateUSDT = await stakingContract.methods
        .rewardRateUSDT()
        .call();
      const rewardRateSOVI = await stakingContract.methods
        .rewardRateSOVI()
        .call();

      const apyUSDT =
        ((Number(rewardRateUSDT) * Number(SECONDS_PER_YEAR)) / 1e18) * 100;
      setApyUSDT(apyUSDT.toFixed(2));

      const apySOVI = (Number(rewardRateSOVI) * SECONDS_PER_YEAR) / 1e16;
      setApySOVI(apySOVI.toFixed(2));

      const pending = await stakingContract.methods
        .pendingRewards(account)
        .call();
      const pendingUSDT = web3.utils.fromWei(pending[0].toString(), "ether");
      const pendingSOVI = web3.utils.fromWei(pending[1].toString(), "ether");

      setPendingUSDT(pendingUSDT);
      setPendingSOVI(pendingSOVI);
    } catch (err) {
      console.error("Lỗi khi fetch staking info:", err);
    }
  };

  //Redeem voucher
  const redeemVoucher = async (voucher) => {
    try {
      const stakingContract = new web3.eth.Contract(
        STAKING_ABI,
        STAKING_ADDRESS
      );
      const costWei = web3.utils.toWei(voucher.cost, "ether");
      await stakingContract.methods
        .redeemVoucher(voucher.id, costWei)
        .send({ from: account });

      const code = `https://sovicoeco.com/voucher/${
        voucher.id
      }?code=${Math.random().toString(36).substring(2, 10).toUpperCase()}`;
      setQrData(code);
      setSelectedVoucher(voucher);
      alert("Đổi voucher thành công!");
    } catch (err) {
      console.error("Lỗi khi đổi voucher:", err);
    }
  };

  return (
    <div className="app-container">
      <div className="app-header">
        <h1 className="app-title">HDGold Vault DApp</h1>
      </div>

      {!account ? (
        <div className="main-card">
          <button className="connect-wallet-btn" onClick={connectWallet}>
            Kết nối ví
          </button>
        </div>
      ) : (
        <div className="main-card">
          <div className="wallet-info">
            <div className="wallet-address">Wallet: {account}</div>
            <div className="balance-info">
              <div className="balance-item">
                USDT: {Number(usdtBalance).toFixed(6)}
              </div>
              <div className="balance-item">
                HDG: {Number(hdgBalance).toFixed(6)}
              </div>
            </div>
          </div>

          {errorMessage && <div className="error-message">{errorMessage}</div>}

          <div className="tab-nav">
            <button
              className={`tab-btn ${tab === "kyc" ? "active" : ""}`}
              onClick={() => setTab("kyc")}
            >
              KYC
            </button>
            <button
              className={`tab-btn ${tab === "mint" ? "active" : ""}`}
              onClick={() => {
                setTab("mint");
                setUsdtValue("");
                setHdgValue("");
                setErrorMessage("");
                setIsApproved(false);
              }}
            >
              Mint
            </button>
            <button
              className={`tab-btn ${tab === "burn" ? "active" : ""}`}
              onClick={() => {
                setTab("burn");
                setUsdtValue("");
                setHdgValue("");
                setErrorMessage("");
              }}
            >
              Burn
            </button>
            <button
              className={`tab-btn ${tab === "redeemPhysical" ? "active" : ""}`}
              onClick={() => {
                setTab("redeemPhysical");
                setUsdtValue("");
                setHdgValue("");
                setErrorMessage("");
              }}
            >
              Redeem Physical
            </button>
            <button
              className={`tab-btn ${tab === "staking" ? "active" : ""}`}
              onClick={() => setTab("staking")}
            >
              Staking
            </button>
            <button
              className={`tab-btn ${tab === "voucher" ? "active" : ""}`}
              onClick={() => setTab("voucher")}
            >
              Voucher
            </button>
          </div>
          {tab === "kyc" && (
            <div className="form-section">
              {kycStatus ? (
                <div className="wallet-info">✅ Ví của bạn đã có KYC SBT</div>
              ) : (
                <button className="action-btn btn-mint" onClick={requestKYC}>
                  Đăng ký KYC
                </button>
              )}
              <div style={{ marginTop: "1rem", color: "#da0e0eff" }}>
                (KYC là bắt buộc để sử dụng các chức năng khác)
              </div>
            </div>
          )}

          {tab === "mint" && (
            <div className="form-section">
              <div
                style={{
                  marginBottom: "1rem",
                  fontWeight: "600",
                  color: "#444",
                }}
              >
                Giá vàng hiện tại: {goldPrice} VND / chỉ
              </div>
              <div className="input-group">
                <input
                  type="text"
                  className="form-input"
                  placeholder="Nhập USDT muốn nạp"
                  value={usdtValue}
                  onChange={(e) => handleUsdtInput(e.target.value)}
                />
                <button className="max-btn" onClick={setMaxUsdt}>
                  Max
                </button>
              </div>
              <div className="input-group">
                <input
                  type="text"
                  className="form-input"
                  placeholder="HDG sẽ nhận"
                  value={hdgValue}
                  readOnly
                />
              </div>
              <button className="action-btn btn-mint" onClick={mint}>
                Mint HDG
              </button>
            </div>
          )}

          {tab === "burn" && (
            <div className="form-section">
              <div
                style={{
                  marginBottom: "1rem",
                  fontWeight: "600",
                  color: "#444",
                }}
              >
                Giá vàng hiện tại: {goldPrice} VND / chỉ
              </div>
              <div className="input-group">
                <input
                  type="text"
                  className="form-input"
                  placeholder="Nhập HDG muốn burn"
                  value={hdgValue}
                  onChange={(e) => handleHdgInput(e.target.value)}
                />
                <button className="max-btn" onClick={setMaxHdg}>
                  Max
                </button>
              </div>
              <div className="input-group">
                <input
                  type="text"
                  className="form-input"
                  placeholder="USDT sẽ nhận"
                  value={usdtValue}
                  readOnly
                />
              </div>
              <button className="action-btn btn-burn" onClick={burn}>
                Burn HDG
              </button>
            </div>
          )}

          {tab === "redeemPhysical" && (
            <div className="form-section">
              <div
                style={{
                  marginBottom: "1rem",
                  fontWeight: "600",
                  color: "#444",
                }}
              >
                Giá vàng hiện tại: {goldPrice} VND / chỉ
              </div>
              <div className="input-group">
                <input
                  type="text"
                  className="form-input"
                  placeholder="Nhập HDG muốn redeem (nguyên chỉ)"
                  value={hdgValue}
                  onChange={(e) => setHdgValue(e.target.value)}
                />
                <button
                  className="max-btn"
                  onClick={() =>
                    setHdgValue(Math.floor(parseFloat(hdgBalance)).toString())
                  }
                >
                  Max
                </button>
              </div>
              <button
                className="action-btn btn-redeem"
                onClick={redeemPhysical}
              >
                Redeem Physical
              </button>
              {qrData && (
                <div className="qr-section">
                  <h3 className="qr-title">Mã QR để đổi vàng tại HDBank</h3>
                  <div className="qr-code">
                    <QRCodeCanvas
                      value={qrData}
                      size={200}
                      includeMargin={true}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {tab === "staking" && (
            <div className="staking-dashboard">
              <h3 className="dashboard-title">Staking Dashboard</h3>

              <div className="stats-grid">
                <div className="stat-card">
                  <div className="stat-label">Total Staked</div>
                  <div className="stat-value">{totalStaked} HDG</div>
                </div>
                <div className="stat-card">
                  <div className="stat-label">APY USDT</div>
                  <div className="stat-value">{apyUSDT}%</div>
                </div>
                <div className="stat-card">
                  <div className="stat-label">APY Sovico</div>
                  <div className="stat-value">{apySOVI} SOVI</div>
                </div>
                <div className="stat-card">
                  <div className="stat-label">My Staked</div>
                  <div className="stat-value">{myStaked} HDG</div>
                </div>
              </div>

              <div className="stat-card" style={{ marginBottom: "1rem" }}>
                <div className="stat-label">My Rewards</div>
                <div className="stat-value">
                  {pendingUSDT} USDT + {pendingSOVI} SOVI
                </div>
              </div>

              <div className="input-group">
                <input
                  type="text"
                  className="form-input"
                  placeholder="Nhập số lượng HDG"
                  value={hdgValue}
                  onChange={(e) => setHdgValue(e.target.value)}
                />
              </div>

              <div className="button-group">
                <button
                  className="btn-secondary"
                  onClick={async () => {
                    const amount = web3.utils.toWei(
                      hdgValue.toString(),
                      "ether"
                    );
                    await vault.methods
                      .approve(STAKING_ADDRESS, amount)
                      .send({ from: account });
                    const stakingContract = new web3.eth.Contract(
                      STAKING_ABI,
                      STAKING_ADDRESS
                    );
                    await stakingContract.methods
                      .stake(amount)
                      .send({ from: account });
                    alert("Stake thành công!");
                    await fetchStakingInfo();
                    await fetchBalances();
                  }}
                >
                  Stake
                </button>

                <button
                  className="btn-secondary"
                  onClick={async () => {
                    const amount = web3.utils.toWei(
                      hdgValue.toString(),
                      "ether"
                    );
                    const stakingContract = new web3.eth.Contract(
                      STAKING_ABI,
                      STAKING_ADDRESS
                    );
                    await stakingContract.methods
                      .unstake(amount)
                      .send({ from: account });
                    alert("Unstake thành công!");
                    await fetchStakingInfo();
                    await fetchBalances();
                  }}
                >
                  Unstake
                </button>

                <button
                  className="btn-secondary"
                  onClick={async () => {
                    const stakingContract = new web3.eth.Contract(
                      STAKING_ABI,
                      STAKING_ADDRESS
                    );
                    await stakingContract.methods
                      .claimReward()
                      .send({ from: account });
                    alert("Claim reward thành công!");
                    fetchStakingInfo();
                  }}
                >
                  Claim
                </button>
              </div>
            </div>
          )}

          {tab === "voucher" && (
            <div className="voucher-list">
              <h3 className="dashboard-title">Voucher List</h3>
              {voucherList.map((v) => (
                <div key={v.id} className="voucher-item">
                  <div className="voucher-info">
                    <h4>{v.name}</h4>
                    <div className="voucher-cost">Cost: {v.cost} SOVI</div>
                  </div>
                  <button
                    className="voucher-btn"
                    onClick={() => redeemVoucher(v)}
                  >
                    Đổi ngay
                  </button>
                </div>
              ))}
              {qrData && selectedVoucher && (
                <div className="qr-section">
                  <h4 className="qr-title">
                    QR Code cho {selectedVoucher.name}
                  </h4>
                  <div className="qr-code">
                    <QRCodeCanvas value={qrData} size={200} />
                  </div>
                  <div className="qr-link">{qrData}</div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default App;
