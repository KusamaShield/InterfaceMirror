import { ApiPromise, WsProvider } from "@polkadot/api";
import { Keyring } from "@polkadot/keyring";
import { cryptoWaitReady, decodeAddress, encodeAddress } from "@polkadot/util-crypto";
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

// Derived H160 from forwarder
const pubkey = decodeAddress(ss58Address);
const derivedH160 = "0x" + Buffer.from(pubkey.slice(0, 20)).toString("hex");

console.log("=== Testing Path A workaround: Pre-fund contract account ===\n");
console.log("Forwarder SS58:", ss58Address);
console.log("Derived H160:", derivedH160);

const CONTRACT = "0x0D694Da746e73D1e255c1894F90e38170db45809";
const WS_RPC = "wss://asset-hub-polkadot-rpc.n.dwellir.com";
const EVM_RPC = "https://polkadot-assethub-rpc.laissez-faire.trade/";

const wsProvider = new WsProvider(WS_RPC);
const api = await ApiPromise.create({ provider: wsProvider });

// Check forwarder balance
const accountInfo: any = await api.query.system.account(ss58Address);
console.log("Forwarder Substrate balance:", (Number(accountInfo.data.free) / 1e10).toFixed(4), "DOT");

// Convert contract H160 to Substrate account
// For addresses in regular format, we use the fallback: 0xEE...EE + address
const contractFallbackH160 = "0x" + "ee".repeat(12) + CONTRACT.slice(2);
console.log("Contract fallback H160:", contractFallbackH160);

// Convert to Substrate SS58
const contractSubstrate = encodeAddress(contractFallbackH160, 0);
console.log("Contract Substrate address:", contractSubstrate);

// Check contract's Substrate balance
const contractInfo: any = await api.query.system.account(contractSubstrate);
console.log("Contract Substrate balance:", (Number(contractInfo.data.free) / 1e10).toFixed(4), "DOT");

// Check contract's EVM balance
const provider = new ethers.JsonRpcProvider(EVM_RPC);
const contractEvmBalance = await provider.getBalance(CONTRACT);
console.log("Contract EVM balance:", ethers.formatEther(contractEvmBalance));

// Step 1: Transfer 1 DOT to the contract's Substrate address
console.log("\n=== Step 1: Transfer 1 DOT to contract's Substrate address ===");
const transferTx = api.tx.balances.transferAllowDeath(contractSubstrate, String(1e10));

console.log("Signing transfer...");
const hash1 = await new Promise<string>((resolve, reject) => {
  transferTx.signAndSend(pair, ({ status, txHash, dispatchError }: any) => {
    console.log("Transfer status:", status.type);
    if (dispatchError) {
      console.log("Transfer error:", dispatchError.toString());
    }
    if (status.isInBlock || status.isFinalized) resolve(txHash.toHex());
  }).catch(reject);
});
console.log("Transfer done! Hash:", hash1);

// Check balances after transfer
const contractInfo2: any = await api.query.system.account(contractSubstrate);
console.log("Contract Substrate balance after:", (Number(contractInfo2.data.free) / 1e10).toFixed(4), "DOT");

const contractEvmBalance2 = await provider.getBalance(CONTRACT);
console.log("Contract EVM balance after:", ethers.formatEther(contractEvmBalance2));

// Step 2: Now call revive.call - contract should have EVM balance now
console.log("\n=== Step 2: Call revive.call to execute deposit ===");

// Generate commitment
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

// This time with value=0 - contract should have EVM balance to use
const tx = api.tx.revive.call(
  CONTRACT,
  "0", // value: 0 - but contract has EVM balance now!
  { refTime: 1000000000000n, proofSize: 1000000n },
  null,
  evmCallData
);

console.log("Tx method hex:", tx.method.toHex());
console.log("Signing and sending...");

const hash2 = await new Promise<string>((resolve, reject) => {
  tx.signAndSend(pair, ({ status, txHash, dispatchError }: any) => {
    console.log("revive.call status:", status.type);
    if (dispatchError) {
      console.log("Dispatch error:", dispatchError.toString());
    }
    if (status.isInBlock || status.isFinalized) resolve(txHash.toHex());
  }).catch(reject);
});
console.log("revive.call done! Hash:", hash2);

// Check final balances
const accountInfo2: any = await api.query.system.account(ss58Address);
console.log("\nForwarder final balance:", (Number(accountInfo2.data.free) / 1e10).toFixed(4), "DOT");

const contractInfo3: any = await api.query.system.account(contractSubstrate);
console.log("Contract final Substrate balance:", (Number(contractInfo3.data.free) / 1e10).toFixed(4), "DOT");

const contractEvmBalance3 = await provider.getBalance(CONTRACT);
console.log("Contract final EVM balance:", ethers.formatEther(contractEvmBalance3));

// Check pool size
const poolIface = new ethers.Interface(["function treeSize() external view returns (uint256)"]);
const sizeResult = await provider.call({ to: CONTRACT, data: poolIface.encodeFunctionData("treeSize") });
console.log("Pool size:", parseInt(sizeResult, 16));

console.log("\n=== Deposit Note ===");
console.log("Secret:", secretHex);
console.log("Commitment:", commitmentHex);
console.log("Amount:", amountWei.toString());

await api.disconnect();