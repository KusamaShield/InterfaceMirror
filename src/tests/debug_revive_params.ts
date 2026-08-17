import { ApiPromise, WsProvider } from "@polkadot/api";
import { Keyring } from "@polkadot/keyring";
import { cryptoWaitReady, decodeAddress } from "@polkadot/util-crypto";
import { ethers } from "ethers";
import * as dotenv from "dotenv";
import { poseidon2 } from "poseidon-lite";
dotenv.config();

await cryptoWaitReady();

const seed = process.env.FORWARDER_SEED;
if (!seed) throw new Error("FORWARDER_SEED not set");

const keyring = new Keyring({ type: "sr25519" });
const pair = keyring.addFromUri(seed);
const ss58Address = pair.address;

const CONTRACT = "0x0D694Da746e73D1e255c1894F90e38170db45809";
const WS_RPC = "wss://asset-hub-polkadot-rpc.n.dwellir.com";
const EVM_RPC = "https://polkadot-assethub-rpc.laissez-faire.trade/";

console.log("=== Testing revive pallet methods ===\n");
console.log("SS58:", ss58Address);

// Derived H160 (stateless, from sr25519 key)
const pubkey = decodeAddress(ss58Address);
const derivedH160 = "0x" + Buffer.from(pubkey.slice(0, 20)).toString("hex");
console.log("Derived H160 (stateless):", derivedH160);

// The fallback account: 0xEE...EE + derived H160
const fallbackH160 = "0x" + "ee".repeat(12) + derivedH160.slice(2);
console.log("Fallback H160 (0xEE...EE + derived):", fallbackH160);

const wsProvider = new WsProvider(WS_RPC);
const api = await ApiPromise.create({ provider: wsProvider });

console.log("\n--- Checking revive pallet methods ---");
const reviveMethods = Object.keys(api.tx.revive || {}).sort();
console.log("Methods:", reviveMethods.join(", "));

// Check account mapping
console.log("\n--- Checking account info ---");
const accountInfo: any = await api.query.system.account(ss58Address);
console.log("Substrate balance:", (Number(accountInfo.data.free) / 1e10).toFixed(4), "DOT");

// Check mapped account
const mappedInfo: any = await api.query.revive.accountInfoOf(derivedH160);
if (mappedInfo.isEmpty) {
  console.log("No mapping found for derived H160");
} else {
  console.log("Mapped account info:", mappedInfo.toHuman());
}

// Check fallback account info  
const fallbackInfo: any = await api.query.revive.accountInfoOf(fallbackH160);
if (fallbackInfo.isEmpty) {
  console.log("No mapping found for fallback H160");
} else {
  console.log("Fallback account info:", fallbackInfo.toHuman());
}

// Check balances via EVM
const provider = new ethers.JsonRpcProvider(EVM_RPC);
const derivedBalance = await provider.getBalance(derivedH160);
console.log("\nEVM balance at derived H160:", ethers.formatEther(derivedBalance));

const fallbackBalance = await provider.getBalance(fallbackH160);
console.log("EVM balance at fallback H160:", ethers.formatEther(fallbackBalance));

// Build test deposit
console.log("\n--- Building test deposit ---");
const secretBytes = ethers.randomBytes(31);
const secretHex = "0x" + Array.from(secretBytes).map(b => b.toString(16).padStart(2, '0')).join('');
const secretBN = BigInt(secretHex);
const amountWei = BigInt(1e18);
const nullifier = poseidon2([secretBN, 1n]);
const precommitment = poseidon2([nullifier, secretBN]);
const valueAssetHash = poseidon2([amountWei.toString(), 0n]);
const commitment = poseidon2([valueAssetHash, precommitment]);
const commitmentHex = "0x" + commitment.toString(16).padStart(64, "0");

const depositIface = new ethers.Interface(["function depositNative(bytes32 commitment) external payable"]);
const evmCallData = depositIface.encodeFunctionData("depositNative", [commitmentHex]);

console.log("Commitment:", commitmentHex);
console.log("EVM calldata:", evmCallData);

// Try different approaches
console.log("\n--- Testing different revive.call approaches ---");

// Approach 1: Using native value (planck)
console.log("\n1. revive.call with native value (planck):");
const tx1 = api.tx.revive.call(
  CONTRACT,
  String(1e10), // 1 DOT in planck (10^10)
  { refTime: 1000000000000n, proofSize: 1000000n },
  BigInt(10 * 1e10),
  evmCallData
);
console.log("   method:", tx1.method.toHex().slice(0, 60) + "...");

// Approach 2: Using wei value (wei)
console.log("\n2. revive.call with wei value:");
const tx2 = api.tx.revive.call(
  CONTRACT,
  String(amountWei), // 1 DOT in wei (10^18)
  { refTime: 1000000000000n, proofSize: 1000000n },
  BigInt(10 * 1e10),
  evmCallData
);
console.log("   method:", tx2.method.toHex().slice(0, 60) + "...");

// Approach 3: Try ethTransact - need to pass RLP
console.log("\n3. Trying ethTransact with RLP:");
try {
  // Build EVM tx for ethers
  const evmTx = {
    to: CONTRACT,
    value: amountWei,
    gasLimit: 200000,
    nonce: Number(accountInfo.nonce),
    data: evmCallData,
  };
  const rlpData = ethers.Transaction.from(evmTx).unsignedSerialized;
  console.log("   RLP:", rlpData.slice(0, 40) + "...");
  
  const tx3 = api.tx.revive.ethTransact(
    api.createType("Bytes", rlpData)
  );
  console.log("   method:", tx3.method.toHex().slice(0, 60) + "...");
} catch (e: any) {
  console.log("   Error:", e.message);
}

// Approach 4: Try ethCall (read-only, no execution)
// This won't actually execute but let's see if it's available

console.log("\n--- Done. Choose approach and modify test. ---");

await api.disconnect();