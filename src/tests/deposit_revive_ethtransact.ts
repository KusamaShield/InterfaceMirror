import { ApiPromise, WsProvider } from "@polkadot/api";
import { Keyring } from "@polkadot/keyring";
import { cryptoWaitReady, encodeAddress } from "@polkadot/util-crypto";
import { ethers } from "ethers";
import { poseidon2 } from "poseidon-lite";
import * as dotenv from "dotenv";
dotenv.config();

await cryptoWaitReady();

const CONTRACT = "0x0D694Da746e73D1e255c1894F90e38170db45809";
const EVM_RPC = "https://polkadot-assethub-rpc.laissez-faire.trade/";
const WS_RPC = "wss://asset-hub-polkadot-rpc.n.dwellir.com";
const CHAIN_ID = 420420419;
const DEPOSIT_AMOUNT_DOT = 0.1;
const FUND_AMOUNT_DOT = 1;

// ===================== STEP 1: Generate ETH wallet =====================

console.log("=== Step 1: Generate ETH Wallet ===");
const ethWallet = ethers.Wallet.createRandom();
console.log("ETH address:", ethWallet.address);

const ethAddrNoPrefix = ethWallet.address.replace("0x", "").toLowerCase();
const substrateFallbackHex = "0x" + ethAddrNoPrefix + "ee".repeat(12);
const substrateFallbackSS58 = encodeAddress(substrateFallbackHex, 0);
console.log("Substrate AccountId32:", substrateFallbackSS58);

// ===================== STEP 2: Fund from forwarder =====================

console.log("\n=== Step 2: Fund ETH Account ===");
const seed = process.env.FORWARDER_SEED;
const keyring = new Keyring({ type: "sr25519" });
const forwarderPair = keyring.addFromUri(seed!);

const wsProvider = new WsProvider(WS_RPC);
const api = await ApiPromise.create({ provider: wsProvider });

const amountPlanck = BigInt(Math.floor(FUND_AMOUNT_DOT * 1e10));
const transferTx = api.tx.balances.transferAllowDeath(substrateFallbackSS58, amountPlanck);

await new Promise((resolve, reject) => {
  transferTx.signAndSend(forwarderPair, ({ status, txHash }: any) => {
    console.log("Transfer status:", status.type);
    if (status.isInBlock || status.isFinalized) {
      console.log("Transfer tx:", txHash.toHex());
      resolve(true);
    }
  }).catch(reject);
});

// Verify ETH balance
const provider = new ethers.JsonRpcProvider(EVM_RPC, CHAIN_ID, {
  staticNetwork: ethers.Network.from(CHAIN_ID),
});
for (let i = 0; i < 10; i++) {
  await new Promise(r => setTimeout(r, 2000));
  const bal = await provider.getBalance(ethWallet.address);
  if (bal > 0n) {
    console.log("ETH balance:", ethers.formatEther(bal), "DOT");
    break;
  }
}

// ===================== STEP 3: Deposit via revive.ethTransact =====================

console.log("\n=== Step 3: Deposit via revive.ethTransact ===");

const poolIface = new ethers.Interface(["function treeSize() external view returns (uint256)"]);
const beforeSize = parseInt(await provider.call({ to: CONTRACT, data: poolIface.encodeFunctionData("treeSize") }), 16);
console.log("Pool size before:", beforeSize);

// Generate commitment
const secretBytes = ethers.randomBytes(31);
const secretHex = "0x" + Array.from(secretBytes).map(b => b.toString(16).padStart(2, "0")).join("");
const secretBN = BigInt(secretHex);
const amountWei = ethers.parseEther(DEPOSIT_AMOUNT_DOT.toString());
const nullifier = poseidon2([secretBN, 1n]);
const precommitment = poseidon2([nullifier, secretBN]);
const valueAssetHash = poseidon2([amountWei.toString(), 0n]);
const commitment = poseidon2([valueAssetHash, precommitment]);
const commitmentHex = "0x" + commitment.toString(16).padStart(64, "0");

const depositIface = new ethers.Interface(["function depositNative(bytes32 commitment) external payable"]);
const calldata = depositIface.encodeFunctionData("depositNative", [commitmentHex]);

// Build and SIGN the ETH transaction with the ECDSA key
const nonce = await provider.getTransactionCount(ethWallet.address);
const gasPrice = 500000000n; // Lower gas price for revive.ethTransact
const gasLimit = 200000n;

// Build an unsigned ETH transaction, then sign it
const txUnsigned = ethers.Transaction.from({
  to: CONTRACT,
  value: amountWei,
  data: calldata,
  gasLimit,
  gasPrice,
  nonce,
  chainId: CHAIN_ID,
  type: 0, // legacy
});

// Sign with ECDSA key to get the serialized signed transaction
const signingKey = new ethers.SigningKey(ethWallet.privateKey);
const txSignature = signingKey.sign(txUnsigned.unsignedHash);
const signedTx = ethers.Transaction.from({
  ...txUnsigned.toJSON(),
  signature: txSignature,
});

console.log("Commitment:", commitmentHex);
console.log("Amount:", DEPOSIT_AMOUNT_DOT, "DOT");
console.log("Signed RLP length:", signedTx.serialized.length);

// Submit via revive.ethTransact - forwarder signs the Substrate extrinsic
const ethTransactTx = api.tx.revive.ethTransact(
  api.createType("Bytes", signedTx.serialized)
);

console.log("\nSubmitting revive.ethTransact...");

let depositHash = "";
await new Promise((resolve, reject) => {
  ethTransactTx.signAndSend(forwarderPair, ({ status, txHash, dispatchError }: any) => {
    if (dispatchError) {
      console.log("Dispatch error:", dispatchError.toString());
      resolve(true); // Don't reject - let's see the error
    }
    if (txHash) depositHash = txHash.toHex();
    if (status.isInBlock) {
      console.log("Status:", status.type, "Hash:", txHash?.toHex());
      // Check for events
      status.events.forEach(({ event }: any) => {
        if (event.section === "revive") {
          console.log(`  Event: revive.${event.method}`, event.data.toHuman?.());
        }
        if (event.section === "system" && event.method === "ExtrinsicFailed") {
          console.log("  ExtrinsicFailed:", event.data.toHuman?.());
        }
      });
    }
    if (status.isFinalized) {
      console.log("Status:", status.type, "Hash:", txHash?.toHex());
      resolve(true);
    }
  }).catch(reject);
});

// Check final state
const afterSize = parseInt(await provider.call({ to: CONTRACT, data: poolIface.encodeFunctionData("treeSize") }), 16);
console.log("Pool size after:", afterSize);

await api.disconnect();

// ===================== Deposit note =====================

console.log("\n=== Deposit Note ===");
console.log(JSON.stringify({
  secret: secretHex,
  nullifier: "0x" + nullifier.toString(16).padStart(64, "0"),
  commitment: commitmentHex,
  amount: ethers.formatEther(amountWei),
  ethAddress: ethWallet.address,
  ethPrivateKey: ethWallet.privateKey,
  substrateFallback: substrateFallbackSS58,
  txHash: depositHash,
  poolSize: afterSize,
  success: afterSize > beforeSize,
}, null, 2));