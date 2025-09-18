const PullServiceClient = require("./pullServiceClient");
const { Web3 } = require("web3");
const fs = require("fs");
require("dotenv").config({ path: "../../../../.env" });

async function main() {
  const address = "testnet-dora-2.supra.com:443"; // Set the gRPC server address
  const pairIndexes = [5500, 5014]; // Set the pair indexes as an array
  const chainType = "evm"; // Set the chain type (evm, sui, aptos)

  const client = new PullServiceClient(address);

  const request = {
    pair_indexes: pairIndexes,
    chain_type: chainType,
  };
  console.log("Requesting proof for price index : ", request.pair_indexes);
  client.getProof(request, (err, response) => {
    if (err) {
      console.error("Error:", err.details);
      return;
    }
    console.log("Calling contract to verify the proofs.. ");
    callContract(response.evm);
  });
}

async function callContract(response) {
  const web3 = new Web3(
    new Web3.providers.HttpProvider(
      "https://data-seed-prebsc-1-s1.binance.org:8545"
    )
  ); // Rpc url for desired chain

  const contractJson = require("../../resources/PriceFeeder.json");
  const contractAbi = contractJson.abi;

  const contractAddress = "0x570b30768B77709686afA1F8c7d3AE42cb35aa41"; // Address of your smart contract

  const contract = new web3.eth.Contract(contractAbi, contractAddress);

  const hex = web3.utils.bytesToHex(response.proof_bytes);

  /////////////////////////////////////////////////// Utility code to deserialise the oracle proof bytes (Optional) ///////////////////////////////////////////////////////////////////

  const OracleProofABI = require("../../resources/oracleProof.json"); // Interface for the Oracle Proof data

  let proof_data = web3.eth.abi.decodeParameters(OracleProofABI, hex); // Deserialising the Oracle Proof data

  let pairId = []; // list of all the pair ids requested
  let pairPrice = []; // list of prices for the corresponding pair ids
  let pairDecimal = []; // list of pair decimals for the corresponding pair ids
  let pairTimestamp = []; // list of pair last updated timestamp for the corresponding pair ids

  for (let i = 0; i < proof_data[0].data.length; ++i) {
    for (
      let j = 0;
      j < proof_data[0].data[i].committee_data.committee_feed.length;
      j++
    ) {
      pairId.push(
        proof_data[0].data[i].committee_data.committee_feed[j].pair.toString(10)
      ); // pushing the pair ids requested in the output vector

      pairPrice.push(
        proof_data[0].data[i].committee_data.committee_feed[j].price.toString(
          10
        )
      ); // pushing the pair price for the corresponding ids

      pairDecimal.push(
        proof_data[0].data[i].committee_data.committee_feed[
          j
        ].decimals.toString(10)
      ); // pushing the pair decimals for the corresponding ids requested

      pairTimestamp.push(
        proof_data[0].data[i].committee_data.committee_feed[
          j
        ].timestamp.toString(10)
      ); // pushing the pair timestamp for the corresponding ids requested
    }
  }

  console.log("Pair index : ", pairId);
  console.log("Pair Price : ", pairPrice);
  console.log("Pair Decimal : ", pairDecimal);
  console.log("Pair Timestamp : ", pairTimestamp);

  /////////////////////////////////////////////////// End of the utility code to deserialise the oracle proof bytes (Optional) ////////////////////////////////////////////////////////////////
  // lấy ra đúng giá XAU/USD và USD/VND
  let xauUsd, usdVnd;
  for (let i = 0; i < pairId.length; i++) {
    if (pairId[i] === "5500") xauUsd = pairPrice[i];
    if (pairId[i] === "5014") usdVnd = pairPrice[i];
  }

  if (!xauUsd || !usdVnd) {
    console.error("Không tìm thấy giá trị XAUUSD hoặc USDVND");
    return;
  }

  const xauUsdBN = web3.utils.toBigInt(xauUsd);
  const usdVndBN = web3.utils.toBigInt(usdVnd);

  console.log("XAU/USD:", xauUsdBN.toString());
  console.log("USD/VND:", usdVndBN.toString());

  const txData = contract.methods.updatePrice(xauUsdBN, usdVndBN).encodeABI();

  const gasEstimate = await contract.methods
    .updatePrice(xauUsdBN, usdVndBN)
    .estimateGas({ from: process.env.Wallet_Address });

  const transactionObject = {
    from: process.env.Wallet_Address,
    to: contractAddress,
    data: txData,
    gas: gasEstimate,
    gasPrice: await web3.eth.getGasPrice(),
  };

  const signedTransaction = await web3.eth.accounts.signTransaction(
    transactionObject,
    process.env.Private_Key
  );

  const receipt = await web3.eth.sendSignedTransaction(
    signedTransaction.rawTransaction
  );

  console.log("Transaction receipt:", receipt);

  // Ghi log ra file oracle_updates.log
  const now = new Date().toISOString();
  const logLine = `[${now}] XAU/USD: ${xauUsdBN.toString()} | USD/VND: ${usdVndBN.toString()} | Tx: ${
    receipt.transactionHash
  }\n`;
  fs.appendFileSync("oracle_updates.log", logLine, "utf8");
  console.log("Đã ghi log vào oracle_updates.log");
}

const intervalMs = 5 * 60 * 1000;

main();

setInterval(() => {
  console.log(
    `\n=== Bắt đầu cập nhật mới lúc ${new Date().toLocaleTimeString()} ===`
  );
  main();
}, intervalMs);
