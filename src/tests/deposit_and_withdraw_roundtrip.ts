/**
 * Polkadot AssetHub Deposit + Withdraw Roundtrip
 *
 * Deposit: forwarder funds a fresh ETH wallet, which calls depositNative()
 * Withdraw: forwarder funds a 2nd fresh ETH wallet, which calls withdraw()
 *           paying gas from its EVM balance. Funds go to the forwarder's H160.
 *
 * Uses LeanIMT from transactions/merkle.ts for proper Merkle tree sync.
 *
 * Usage: npx tsx src/tests/deposit_and_withdraw_roundtrip.ts
 */

import { ApiPromise, WsProvider } from "@polkadot/api";
import { Keyring } from "@polkadot/keyring";
import { cryptoWaitReady, encodeAddress, decodeAddress } from "@polkadot/util-crypto";
import { ethers } from "ethers";
import { poseidon1, poseidon2 } from "poseidon-lite";
import * as snarkjs from "snarkjs";
import * as dotenv from "dotenv";
import * as path from "path";
import * as fs from "fs";
import { buildMerkleTreeFromContract } from "../transactions/merkle";
dotenv.config();

await cryptoWaitReady();

const CONTRACT = "0x0D694Da746e73D1e255c1894F90e38170db45809";
const EVM_RPC = "https://polkadot-assethub-rpc.laissez-faire.trade/";
const WS_RPC = "wss://asset-hub-polkadot-rpc.n.dwellir.com";
const CHAIN_ID = 420420419;
const DEPLOYMENT_BLOCK = 18697500;
const DEPOSIT_AMOUNT_DOT = 0.5;
const BN254_R = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;

async function rpcCall(method: string, params: any[]) {
  const res = await fetch(EVM_RPC, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
  const d = await res.json();
  if (d.error) throw new Error(`${method}: ${d.error.message}`);
  return d.result;
}

const POOL_ABI = [
  "function currentRoot() external view returns (uint256)",
  "function treeSize() external view returns (uint256)",
  "function depositNative(bytes32 commitment) external payable",
  "function withdraw(uint256[2] calldata pA, uint256[2][2] calldata pB, uint256[2] calldata pC, uint[8] calldata pubSignals, address recipient) external",
  "event Deposit(address indexed asset, bytes32 commitment, uint256 nullifierHash)",
  "event Withdrawal(address indexed asset, uint256 amount, address indexed recipient, uint256 newCommitment)",
  "event NewCommitment(bytes32 newCommitmentHash)",
];

// Forwarder setup
const seed = process.env.FORWARDER_SEED;
if (!seed) throw new Error("Set FORWARDER_SEED in .env");
const keyring = new Keyring({ type: "sr25519" });
const forwarderPair = keyring.addFromUri(seed);
const forwarderSS58 = forwarderPair.address;

// Derive forwarder H160 — keccak256(pubkey), last 20 bytes
const fwdPubkey = decodeAddress(forwarderSS58);
const forwarderH160 = "0x" + ethers.keccak256(fwdPubkey).slice(-40);
console.log("Forwarder SS58:", forwarderSS58);
console.log("Forwarder H160:", forwarderH160);

// ===================== STEP 1: Generate deposit wallet =====================
console.log("\n=== Step 1: Generate Deposit Wallet ===");
const depositWallet = ethers.Wallet.createRandom();
console.log("Deposit ETH address:", depositWallet.address);

const depEthAddrNoPrefix = depositWallet.address.replace("0x", "").toLowerCase();
const depSubstrateHex = "0x" + depEthAddrNoPrefix + "ee".repeat(12);
const depSubstrateSS58 = encodeAddress(depSubstrateHex, 0);
console.log("Deposit fallback SS58:", depSubstrateSS58);

// ===================== STEP 2: Fund deposit wallet =====================
console.log("\n=== Step 2: Fund Deposit Wallet ===");
const wsProvider = new WsProvider(WS_RPC);
const api = await ApiPromise.create({ provider: wsProvider });

const fwdInfo: any = await api.query.system.account(forwarderPair.address);
const fwdBalance = Number(fwdInfo.data.free) / 1e10;
console.log("Forwarder balance:", fwdBalance.toFixed(4), "DOT");

const FUND_DEPOSIT_DOT = Math.min(DEPOSIT_AMOUNT_DOT + 0.2, Math.floor((fwdBalance - 0.3) * 10) / 10);
if (FUND_DEPOSIT_DOT < DEPOSIT_AMOUNT_DOT + 0.05) throw new Error(`Forwarder balance too low: ${fwdBalance}`);
console.log("Funding deposit wallet with:", FUND_DEPOSIT_DOT.toFixed(1), "DOT");

const depFundPlanck = BigInt(Math.floor(FUND_DEPOSIT_DOT * 1e10));
const depTransferTx = api.tx.balances.transferAllowDeath(depSubstrateSS58, depFundPlanck);
await new Promise((resolve, reject) => {
  depTransferTx.signAndSend(forwarderPair, ({ status, txHash, dispatchError }: any) => {
    console.log("  Deposit funding:", status.type);
    if (dispatchError) return reject(new Error(dispatchError.toString()));
    if (status.isFinalized) resolve(true);
  }).catch(reject);
});

const depSubBal: any = await api.query.system.account(depSubstrateSS58);
console.log("Deposit Substrate balance:", (Number(depSubBal.data.free) / 1e10).toFixed(4), "DOT");
await api.disconnect();

// Wait for ETH balance
console.log("Waiting for deposit ETH balance...");
for (let i = 0; i < 15; i++) {
  await new Promise(r => setTimeout(r, 4000));
  const bal = await rpcCall("eth_getBalance", [depositWallet.address, "latest"]);
  const ethBal = parseInt(bal, 16);
  console.log(`  attempt ${i + 1}: ${(ethBal / 1e18).toFixed(4)} DOT`);
  if (ethBal > 0) break;
}

// ===================== STEP 3: Deposit =====================
console.log("\n=== Step 3: Deposit to Pool ===");
const provider = new ethers.JsonRpcProvider(EVM_RPC, CHAIN_ID, {
  staticNetwork: ethers.Network.from(CHAIN_ID),
});

const poolIface = new ethers.Interface(["function treeSize() external view returns (uint256)"]);
const beforeSize = parseInt(await provider.call({ to: CONTRACT, data: poolIface.encodeFunctionData("treeSize") }), 16);
console.log("Pool size before:", beforeSize);

const secretBytes = ethers.randomBytes(31);
const secretHex = "0x" + Array.from(secretBytes).map(b => b.toString(16).padStart(2, "0")).join("");
const secretBN = BigInt(secretHex);
const amountWei = ethers.parseEther(DEPOSIT_AMOUNT_DOT.toString());
const nullifier = poseidon2([secretBN, 1n]);
const nullifierHash = poseidon1([nullifier]);
const precommitment = poseidon2([nullifier, secretBN]);
const valueAssetHash = poseidon2([amountWei.toString(), 0n]);
const commitment = poseidon2([valueAssetHash, precommitment]);
const commitmentHex = "0x" + commitment.toString(16).padStart(64, "0");

const depositIface = new ethers.Interface(["function depositNative(bytes32 commitment) external payable"]);
const depositCalldata = depositIface.encodeFunctionData("depositNative", [commitmentHex]);

const depositSigner = depositWallet.connect(provider);

const depEthBal = await provider.getBalance(depositWallet.address);
console.log("Deposit wallet ETH balance:", ethers.formatEther(depEthBal), "DOT");
console.log("Deposit amount:", ethers.formatEther(amountWei), "DOT");

const depNonce = await provider.getTransactionCount(depositWallet.address);
const depFeeData = await provider.getFeeData();
const depGasPrice = depFeeData.gasPrice!;
let depGasLimit = 200000n;
try { depGasLimit = await provider.estimateGas({ from: depositWallet.address, to: CONTRACT, value: amountWei, data: depositCalldata }); } catch (_) {}

console.log("Commitment:", commitmentHex);
console.log("Gas limit:", depGasLimit, "Gas price:", depGasPrice, "Nonce:", depNonce);

const depMaxCost = amountWei + depGasLimit * depGasPrice;
if (depEthBal < depMaxCost) throw new Error(`Insufficient funds: have ${ethers.formatEther(depEthBal)}, need ${ethers.formatEther(depMaxCost)}`);

const depositTx = await depositSigner.sendTransaction({
  to: CONTRACT, value: amountWei, data: depositCalldata,
  gasLimit: depGasLimit,
  gasPrice: depGasPrice,
  nonce: depNonce,
});
console.log("Deposit tx:", depositTx.hash);
const depositRec = await depositTx.wait();
console.log("Deposit status:", depositRec?.status === 1 ? "SUCCESS" : "FAILED");

const afterDepositSize = parseInt(await provider.call({ to: CONTRACT, data: poolIface.encodeFunctionData("treeSize") }), 16);
console.log("Pool size after:", afterDepositSize);

console.log("\n=== Deposit Note ===");
console.log(JSON.stringify({
  secret: secretHex,
  nullifier: "0x" + nullifier.toString(16).padStart(64, "0"),
  commitment: commitmentHex,
  amount: DEPOSIT_AMOUNT_DOT,
  amountWei: amountWei.toString(),
  assetId: 0,
  txHash: depositTx.hash,
}, null, 2));

// Sweep leftover deposit wallet balance back to forwarder
const depSweepBal = await provider.getBalance(depositWallet.address);
const depSweepGas = 21000n * depGasPrice;
if (depSweepBal > depSweepGas) {
  const depSweepAmount = depSweepBal - depSweepGas;
  console.log(`\nSweeping ${ethers.formatEther(depSweepAmount)} DOT from deposit wallet to forwarder...`);
  const sweepNonce = await provider.getTransactionCount(depositWallet.address);
  const sweepTx = await depositSigner.sendTransaction({
    to: forwarderH160,
    value: depSweepAmount,
    gasLimit: 21000n,
    gasPrice: depGasPrice,
    nonce: sweepNonce,
  });
  await sweepTx.wait();
  console.log("  Sweep tx:", sweepTx.hash);
}

// Wait for event indexing
console.log("\nWaiting for events to index (15s)...");
await new Promise(r => setTimeout(r, 15000));

// ===================== STEP 4: Generate withdraw wallet =====================
console.log("\n=== Step 4: Generate Withdraw Wallet ===");
const withdrawWallet = ethers.Wallet.createRandom();
console.log("Withdraw ETH address:", withdrawWallet.address);

const wdEthAddrNoPrefix = withdrawWallet.address.replace("0x", "").toLowerCase();
const wdSubstrateHex = "0x" + wdEthAddrNoPrefix + "ee".repeat(12);
const wdSubstrateSS58 = encodeAddress(wdSubstrateHex, 0);
console.log("Withdraw fallback SS58:", wdSubstrateSS58);

// ===================== STEP 5: Fund withdraw wallet =====================
console.log("\n=== Step 5: Fund Withdraw Wallet ===");
const wsProvider2 = new WsProvider(WS_RPC);
const api2 = await ApiPromise.create({ provider: wsProvider2 });

const fwdInfo2: any = await api2.query.system.account(forwarderPair.address);
const fwdBalance2 = Number(fwdInfo2.data.free) / 1e10;
console.log("Forwarder balance:", fwdBalance2.toFixed(4), "DOT");

const WITHDRAW_GAS_DOT = 0.2;
if (fwdBalance2 < WITHDRAW_GAS_DOT + 0.3) throw new Error(`Forwarder balance too low for gas funding: ${fwdBalance2}`);
console.log("Funding withdraw wallet with:", WITHDRAW_GAS_DOT.toFixed(1), "DOT");

const wdFundPlanck = BigInt(Math.floor(WITHDRAW_GAS_DOT * 1e10));
const wdTransferTx = api2.tx.balances.transferAllowDeath(wdSubstrateSS58, wdFundPlanck);
await new Promise((resolve, reject) => {
  wdTransferTx.signAndSend(forwarderPair, ({ status, txHash, dispatchError }: any) => {
    console.log("  Withdraw funding:", status.type);
    if (dispatchError) return reject(new Error(dispatchError.toString()));
    if (status.isFinalized) resolve(true);
  }).catch(reject);
});

const wdSubBal: any = await api2.query.system.account(wdSubstrateSS58);
console.log("Withdraw Substrate balance:", (Number(wdSubBal.data.free) / 1e10).toFixed(4), "DOT");
await api2.disconnect();

// Wait for ETH balance
console.log("Waiting for withdraw ETH balance...");
for (let i = 0; i < 15; i++) {
  await new Promise(r => setTimeout(r, 4000));
  const bal = await rpcCall("eth_getBalance", [withdrawWallet.address, "latest"]);
  const ethBal = parseInt(bal, 16);
  console.log(`  attempt ${i + 1}: ${(ethBal / 1e18).toFixed(4)} DOT`);
  if (ethBal > 0) break;
}

// ===================== STEP 6: Build Merkle Tree from on-chain =====================
console.log("\n=== Step 6: Build Merkle Tree ===");
const tree = await buildMerkleTreeFromContract(provider, CONTRACT, POOL_ABI, true, EVM_RPC, DEPLOYMENT_BLOCK);
console.log(`  Tree size: ${tree.size}, root: ${tree.root}`);

const onChainRoot = BigInt(await provider.call({ to: CONTRACT, data: "0xfdab463d" }));
console.log(`  Chain root: ${onChainRoot}`);
if (tree.root.toString() !== onChainRoot.toString()) {
  console.log(`  WARNING: Local tree root does not match on-chain root — will use chain root for proof`);
}

const commitmentBN = BigInt(commitmentHex);
const leafIdx = tree.findLeafIndex(commitmentBN);
if (leafIdx === -1) throw new Error("Commitment not found in tree!");
console.log(`  Leaf index: ${leafIdx}`);

const merkleProof = tree.getProof(leafIdx);
console.log(`  Siblings: ${merkleProof.siblings.length} (${merkleProof.siblings.filter((s: string) => s !== "0").length} non-zero)`);

// ===================== STEP 7: Generate ZK Proof =====================
console.log("\n=== Step 7: Generate ZK Proof ===");
const wasmPath = path.join(process.cwd(), "public", "withdraw_phase2_fixed_v7.wasm");
const zkeyPath = path.join(process.cwd(), "public", "withdraw_phase2_fixed_v7_0001.zkey");
if (!fs.existsSync(wasmPath) || !fs.existsSync(zkeyPath)) throw new Error("Circuit files missing");

const context = BigInt(ethers.keccak256(ethers.solidityPacked(["address"], [forwarderH160]))) % BN254_R;
const newSecret = ethers.hexlify(ethers.randomBytes(31));
const newNullifier = poseidon2([BigInt(newSecret), 1n]).toString();

const circuitInput = {
  withdrawnValue: amountWei.toString(),
  root: onChainRoot.toString(),
  treeDepth: "128",
  context: context.toString(),
  asset: "0x0000000000000000000000000000000000000000",
  existingValue: amountWei.toString(),
  existingNullifier: nullifier.toString(),
  existingSecret: secretBN.toString(),
  newNullifier,
  newSecret: BigInt(newSecret).toString(),
  siblings: merkleProof.siblings,
  leafIndex: leafIdx.toString(),
};

console.log("Proving...");
const t0 = Date.now();
const { proof, publicSignals } = await snarkjs.groth16.fullProve(circuitInput, wasmPath, zkeyPath);
console.log(`  Done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

const formattedProof = [
  [BigInt(proof.pi_a[0]), BigInt(proof.pi_a[1])],
  [
    [BigInt(proof.pi_b[0][1]), BigInt(proof.pi_b[0][0])],
    [BigInt(proof.pi_b[1][1]), BigInt(proof.pi_b[1][0])],
  ],
  [BigInt(proof.pi_c[0]), BigInt(proof.pi_c[1])],
];

const hexPubSignals = publicSignals.map((s: string) => BigInt(s).toString(16).padStart(64, "0"));
console.log("Public signals:", hexPubSignals.join("|"));

// ===================== STEP 8: Withdraw =====================
console.log("\n=== Step 8: Withdraw ===");

const withdrawIface = new ethers.Interface([
  "function withdraw(uint256[2] calldata pA, uint256[2][2] calldata pB, uint256[2] calldata pC, uint[8] calldata pubSignals, address recipient) external",
]);
const withdrawCalldata = withdrawIface.encodeFunctionData("withdraw", [
  formattedProof[0],
  formattedProof[1],
  formattedProof[2],
  publicSignals.map((s: string) => BigInt(s)),
  forwarderH160,
]);

const wdBalBefore = await provider.getBalance(withdrawWallet.address);
console.log("Withdraw wallet DOT before:", ethers.formatEther(wdBalBefore));

const wdSigner = withdrawWallet.connect(provider);
const wdNonce = await provider.getTransactionCount(withdrawWallet.address);

let wdGasLimit = 2000000n;
try {
  wdGasLimit = await provider.estimateGas({ from: withdrawWallet.address, to: CONTRACT, data: withdrawCalldata });
  console.log("Estimated gas:", wdGasLimit);
} catch (e: any) {
  console.log("estimateGas failed:", e.shortMessage || e.message);
  if (e.revert) console.log("  revert reason:", e.revert);
}

const wdFeeData = await provider.getFeeData();
const wdGasPrice = wdFeeData.gasPrice!;
const wdMaxCost = wdGasLimit * wdGasPrice;
console.log("Gas limit:", wdGasLimit, "Gas price:", wdGasPrice, "Nonce:", wdNonce);
console.log("Max gas cost:", ethers.formatEther(wdMaxCost), "DOT");
console.log("Wallet balance:", ethers.formatEther(wdBalBefore), "DOT");

if (wdBalBefore < wdMaxCost) throw new Error(`Insufficient funds: have ${ethers.formatEther(wdBalBefore)}, need at least ${ethers.formatEther(wdMaxCost)}`);

const wdTx = await wdSigner.sendTransaction({
  to: CONTRACT,
  data: withdrawCalldata,
  gasLimit: wdGasLimit,
  gasPrice: wdGasPrice,
  nonce: wdNonce,
});
console.log("Withdraw tx:", wdTx.hash);
const wdRec = await wdTx.wait();
console.log("Withdraw status:", wdRec?.status === 1 ? "SUCCESS" : "FAILED");
console.log("Gas used:", wdRec?.gasUsed.toString());

// Sweep leftover withdraw wallet balance back to forwarder
const wdSweepBal = await provider.getBalance(withdrawWallet.address);
const wdSweepGas = 21000n * wdGasPrice;
if (wdSweepBal > wdSweepGas) {
  const wdSweepAmount = wdSweepBal - wdSweepGas;
  console.log(`\nSweeping ${ethers.formatEther(wdSweepAmount)} DOT from withdraw wallet to forwarder...`);
  const wdSweepNonce = await provider.getTransactionCount(withdrawWallet.address);
  const wdSweepTx = await wdSigner.sendTransaction({
    to: forwarderH160,
    value: wdSweepAmount,
    gasLimit: 21000n,
    gasPrice: wdGasPrice,
    nonce: wdSweepNonce,
  });
  await wdSweepTx.wait();
  console.log("  Sweep tx:", wdSweepTx.hash);
}

// ===================== STEP 9: Check balances =====================
console.log("\n=== Step 9: Check Balances ===");

const wdBalAfter = await provider.getBalance(withdrawWallet.address);
console.log("Withdraw wallet DOT after sweep:", ethers.formatEther(wdBalAfter));

const fwdEvmBal = await provider.getBalance(forwarderH160);
console.log("Forwarder H160 EVM balance:", ethers.formatEther(fwdEvmBal), "DOT");

const wsProvider3 = new WsProvider(WS_RPC);
const api3 = await ApiPromise.create({ provider: wsProvider3 });
const fwdInfo3: any = await api3.query.system.account(forwarderPair.address);
console.log("Forwarder SS58 Substrate balance:", (Number(fwdInfo3.data.free) / 1e10).toFixed(4), "DOT");
await api3.disconnect();

const finalPoolSize = parseInt(await provider.call({ to: CONTRACT, data: poolIface.encodeFunctionData("treeSize") }), 16);
console.log("Pool size:", finalPoolSize);

console.log("\n=== Roundtrip Complete ===");

// Print gas details
console.log("\nGas summary:");
console.log(`  Deposit tx gas: ${depositRec.gasUsed}`);
console.log(`  Withdraw tx gas: ${wdRec.gasUsed}`);
console.log(`  Gas price: ${ethers.formatUnits(wdGasPrice, "gwei")} gwei`);