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

// Derived H160
const pubkey = decodeAddress(ss58Address);
const derivedH160 = "0x" + Buffer.from(pubkey.slice(0, 20)).toString("hex");

console.log("=== Testing revive Path A with batch_map_accounts ===\n");
console.log("SS58:", ss58Address);
console.log("Derived H160:", derivedH160);

const CONTRACT = "0x0D694Da746e73D1e255c1894F90e38170db45809";
const WS_RPC = "wss://asset-hub-polkadot-rpc.n.dwellir.com";
const EVM_RPC = "https://polkadot-assethub-rpc.laissez-faire.trade/";

const wsProvider = new WsProvider(WS_RPC);
const api = await ApiPromise.create({ provider: wsProvider });

// Check current mapping status
console.log("\n--- Checking mapping status ---");
const isMapped = (api.query.revive as any)?.originalAccount?.(derivedH160);
console.log("Checking OriginalAccount storage for:", derivedH160);

try {
  const mapping: any = await (api.query.revive as any).originalAccount(derivedH160);
  console.log("OriginalAccount result:", mapping.isEmpty ? "NOT MAPPED" : mapping.toHuman());
} catch (e) {
  console.log("Could not query OriginalAccount:", e);
}

// Use batch_map_accounts to ensure mapping works (works even with AutoMap enabled)
console.log("\n--- Attempting batch_map_accounts ---");
const batchTx = api.tx.revive.batchMapAccounts([ss58Address]);
console.log("batchMapAccounts tx hex:", batchTx.method.toHex());

try {
  await new Promise<void>((resolve, reject) => {
    batchTx.signAndSend(pair, ({ status, events, txHash }: any) => {
      console.log("Batch map status:", status.type, "Hash:", txHash?.toHex());
      
      // Check for errors in events
      for (const event of events || []) {
        if (event.event.section === 'system' && event.event.method === 'ExtrinsicFailed') {
          console.log("Extrinsic failed:", JSON.stringify(event.event.data));
        }
      }
      
      if (status.isInBlock || status.isFinalized) {
        console.log("✅ Batch map done!");
        resolve();
      }
    }).catch(reject);
  });
} catch (e) {
  console.log("Batch map error (may be ok):", e);
}

// Check mapping again
console.log("\n--- Checking mapping after batch ---");
try {
  const mapping: any = await (api.query.revive as any).originalAccount(derivedH160);
  console.log("OriginalAccount result:", mapping.isEmpty ? "NOT MAPPED" : mapping.toHuman());
} catch (e) {
  console.log("Could not query OriginalAccount:", e);
}

// Check balances
const accountInfo: any = await api.query.system.account(ss58Address);
console.log("\nSubstrate balance:", (Number(accountInfo.data.free) / 1e10).toFixed(4), "DOT");

const provider = new ethers.JsonRpcProvider(EVM_RPC);
const derivedBalance = await provider.getBalance(derivedH160);
console.log("EVM balance at derived H160:", ethers.formatEther(derivedBalance));

// Build commitment
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

console.log("\n--- Submitting revive.call with value ---");
// 1 DOT in planck = 10^10
const planckValue = BigInt(1e10);
console.log("Sending value (planck):", planckValue.toString());

const tx = api.tx.revive.call(
  CONTRACT,
  planckValue.toString(),
  { refTime: 1000000000000n, proofSize: 1000000n },
  null,
  evmCallData
);

console.log("Tx method hex:", tx.method.toHex());
console.log("Signing and sending...");

const hash = await new Promise<string>((resolve, reject) => {
  tx.signAndSend(pair, ({ status, txHash, dispatchError }: any) => {
    console.log("Status:", status.type, "Hash:", txHash?.toHex());
    if (dispatchError) {
      console.log("Dispatch error:", dispatchError.toString());
    }
    if (status.isInBlock) resolve(txHash.toHex());
    else if (status.isFinalized) resolve(txHash.toHex());
  }).catch(e => reject(e));
});

console.log("Finalized! Hash:", hash);

// Check balances after
const accountInfo2: any = await api.query.system.account(ss58Address);
console.log("\nNew Substrate balance:", (Number(accountInfo2.data.free) / 1e10).toFixed(4), "DOT");

const derivedBalance2 = await provider.getBalance(derivedH160);
console.log("New EVM balance at derived H160:", ethers.formatEther(derivedBalance2));

// Check pool
const poolIface = new ethers.Interface(["function treeSize() external view returns (uint256)"]);
const sizeResult = await provider.call({ to: CONTRACT, data: poolIface.encodeFunctionData("treeSize") });
console.log("Pool size:", parseInt(sizeResult, 16));

console.log("\n=== Deposit Note ===");
console.log("Secret:", secretHex);
console.log("Commitment:", commitmentHex);
console.log("Amount:", amountWei.toString());

await api.disconnect();