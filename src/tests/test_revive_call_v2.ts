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

console.log("=== Testing revive Path A properly ===\n");
console.log("SS58:", ss58Address);

// Derived H160 (stateless, from sr25519 key)
const pubkey = decodeAddress(ss58Address);
const derivedH160 = "0x" + Buffer.from(pubkey.slice(0, 20)).toString("hex");
console.log("Derived H160 (stateless):", derivedH160);

const wsProvider = new WsProvider(WS_RPC);
const api = await ApiPromise.create({ provider: wsProvider });

// Check account mapping
console.log("\n--- Checking mapping status ---");
const mappedInfo: any = await api.query.revive.accountInfoOf(derivedH160);
console.log("Mapping for derived H160:", mappedInfo.isEmpty ? "NOT MAPPED" : "MAPPED");
if (!mappedInfo.isEmpty) {
  console.log("  Mapping details:", JSON.stringify(mappedInfo.toHuman(), null, 2));
}

// Check balances
const accountInfo: any = await api.query.system.account(ss58Address);
console.log("Substrate balance:", (Number(accountInfo.data.free) / 1e10).toFixed(4), "DOT");

const provider = new ethers.JsonRpcProvider(EVM_RPC);
const derivedBalance = await provider.getBalance(derivedH160);
console.log("\nEVM balance at derived H160:", ethers.formatEther(derivedBalance));

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

console.log("\n--- Testing revive.call with correct NativeToEthRatio ---");
// PAH: NativeToEthRatio = 100_000_000 (1 DOT = 10^10 planck = 10^18 wei / 10^8 = 10^10)
// So 1 DOT in planck = 10^10, and 1 DOT in wei = 10^18
// The pallet converts: value (planck) / NativeToEthRatio = wei
// So if we pass 10^10 planck, it becomes 10^18 / 10^8 = 10^10 wei... wait that's wrong

// Actually: NativeToEthRatio = 100_000_000 = 10^8
// So: wei = planck / 10^8
// To send 1 DOT (10^18 wei), we need: planck = 10^18 * 10^8 = 10^26 planck
// But that's way more than we have!

// Wait, let me re-read: "value is in native units (10^10 plancks per DOT on AH); 
// it is converted to wei with NativeToEthRatio"
// NativeToEthRatio = 10^8 means: 1 planck = 10^8 wei
// So 1 DOT (10^10 planck) = 10^10 * 10^8 = 10^18 wei (correct!)

// So to send 1 DOT to the contract, we pass value = 10^10 (planck)
const planckValue = BigInt(1e10); // 1 DOT in planck
console.log("Sending value (planck):", planckValue.toString());

// Now let's try with the correct storage deposit limit format
// PAH has Deposit = () so storage deposits don't work the same
// Let's try with null (unlimited)
console.log("\n--- Submitting revive.call ---");
const tx = api.tx.revive.call(
  CONTRACT,
  planckValue.toString(), // 1 DOT in planck = 10^10
  { refTime: 1000000000000n, proofSize: 1000000n },
  null, // no storage deposit limit
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