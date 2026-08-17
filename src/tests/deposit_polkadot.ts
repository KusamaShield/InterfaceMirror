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

async function rpcCall(method: string, params: any[]) {
  const res = await fetch(EVM_RPC, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
  const d = await res.json();
  if (d.error) throw new Error(`${method}: ${d.error.message}`);
  return d.result;
}

// ===================== STEP 1: Generate ETH wallet =====================

console.log("=== Step 1: Generate ETH Wallet ===");
const ethWallet = ethers.Wallet.createRandom();
console.log("ETH address:", ethWallet.address);

const ethAddrNoPrefix = ethWallet.address.replace("0x", "").toLowerCase();
const substrateFallbackHex = "0x" + ethAddrNoPrefix + "ee".repeat(12);
const substrateFallbackSS58 = encodeAddress(substrateFallbackHex, 0);
console.log("Substrate fallback:", substrateFallbackSS58);

// ===================== STEP 2: Fund =====================

console.log("\n=== Step 2: Fund from forwarder ===");
const seed = process.env.FORWARDER_SEED;
const keyring = new Keyring({ type: "sr25519" });
const forwarderPair = keyring.addFromUri(seed!);

const wsProvider = new WsProvider(WS_RPC);
const api = await ApiPromise.create({ provider: wsProvider });

// Check forwarder balance and cap
const fwdInfo: any = await api.query.system.account(forwarderPair.address);
const fwdBalance = Number(fwdInfo.data.free) / 1e10;
console.log("Forwarder balance:", fwdBalance.toFixed(4), "DOT");

// Keep 0.5 DOT reserve, send the rest
const FUND_AMOUNT_DOT = Math.max(0, Math.floor((fwdBalance - 0.5) * 10) / 10); // round to 0.1
if (FUND_AMOUNT_DOT < 0.2) throw new Error(`Forwarder balance too low: ${fwdBalance}`);
console.log("Funding amount:", FUND_AMOUNT_DOT.toFixed(1), "DOT");

const amountPlanck = BigInt(Math.floor(FUND_AMOUNT_DOT * 1e10));
const transferTx = api.tx.balances.transferAllowDeath(substrateFallbackSS58, amountPlanck);

let transferHash = "";
await new Promise((resolve, reject) => {
  transferTx.signAndSend(forwarderPair, ({ status, txHash, dispatchError }: any) => {
    console.log("Transfer:", status.type);
    if (dispatchError) {
      console.log("Transfer error:", dispatchError.toString());
      return reject(new Error(dispatchError.toString()));
    }
    if (txHash) transferHash = txHash.toHex();
    if (status.isFinalized) {
      console.log("Transfer finalized:", transferHash);
      resolve(true);
    }
  }).catch(reject);
});

const subBal: any = await api.query.system.account(substrateFallbackSS58);
console.log("Substrate balance:", (Number(subBal.data.free) / 1e10).toFixed(4), "DOT");

await api.disconnect();

// Wait for ETH balance to appear
console.log("\n=== Waiting for ETH balance ===");
for (let i = 0; i < 15; i++) {
  await new Promise(r => setTimeout(r, 4000));
  const bal = await rpcCall("eth_getBalance", [ethWallet.address, "latest"]);
  const ethBal = parseInt(bal, 16);
  console.log(`  attempt ${i + 1}: ${(ethBal / 1e18).toFixed(4)} DOT`);
  if (ethBal > 0) break;
}

// ===================== STEP 3: Deposit =====================

console.log("\n=== Step 3: Deposit to Pool ===");

const provider = new ethers.JsonRpcProvider(EVM_RPC, CHAIN_ID, {
  staticNetwork: ethers.Network.from(CHAIN_ID),
});
const wallet = ethWallet.connect(provider);

const poolIface = new ethers.Interface(["function treeSize() external view returns (uint256)"]);
const beforeSize = parseInt(await provider.call({ to: CONTRACT, data: poolIface.encodeFunctionData("treeSize") }), 16);
console.log("Pool size:", beforeSize);

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

const nonce = await provider.getTransactionCount(wallet.address);
const gasPrice = (await provider.getFeeData()).gasPrice!;
let gasLimit = 200000n;
try { gasLimit = await provider.estimateGas({ from: wallet.address, to: CONTRACT, value: amountWei, data: calldata }); } catch (_) {}

console.log("Commitment:", commitmentHex);
console.log("Amount:", DEPOSIT_AMOUNT_DOT, "DOT");

const tx = await wallet.sendTransaction({
  to: CONTRACT, value: amountWei, data: calldata, gasLimit, gasPrice,
});

console.log("Deposit tx:", tx.hash);
const receipt = await tx.wait();
console.log("Status:", receipt?.status === 1 ? "SUCCESS" : "FAILED");

const afterSize = parseInt(await provider.call({ to: CONTRACT, data: poolIface.encodeFunctionData("treeSize") }), 16);
console.log("Pool size:", afterSize);

console.log("\n=== Deposit Note ===");
console.log(JSON.stringify({
  secret: secretHex,
  nullifier: "0x" + nullifier.toString(16).padStart(64, "0"),
  commitment: commitmentHex,
  amount: DEPOSIT_AMOUNT_DOT,
  txHash: tx.hash,
  poolSize: afterSize,
}, null, 2));