import { ApiPromise, WsProvider } from "@polkadot/api";
import { Keyring } from "@polkadot/keyring";
import { cryptoWaitReady } from "@polkadot/util-crypto";
import { ethers } from "ethers";
import * as dotenv from "dotenv";
import { poseidon2 } from "poseidon-lite";
dotenv.config();

await cryptoWaitReady();

const ethPrivateKey = process.env.ETH_PRIVATE_KEY;
if (!ethPrivateKey) throw new Error("ETH_PRIVATE_KEY not set");

const CONTRACT = "0x0D694Da746e73D1e255c1894F90e38170db45809";
const EVM_RPC = "https://polkadot-assethub-rpc.laissez-faire.trade/";
const WS_RPC = "wss://asset-hub-polkadot-rpc.n.dwellir.com";
const CHAIN_ID = 420_420_419n;

console.log("=== Path B: Using revive.ethTransact ===\n");

const provider = new ethers.JsonRpcProvider(EVM_RPC, CHAIN_ID, { staticNetwork: true });
const wallet = new ethers.Wallet(ethPrivateKey, provider);

console.log("ETH address:", wallet.address);

// Check balances
const ethBalance = await provider.getBalance(wallet.address);
console.log("ETH wallet balance:", ethers.formatEther(ethBalance));

// Pool state
const poolIface = new ethers.Interface(["function treeSize() external view returns (uint256)"]);
const sizeResult = await provider.call({ to: CONTRACT, data: poolIface.encodeFunctionData("treeSize") });
console.log("Pool size:", parseInt(sizeResult, 16));

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

console.log("\n=== Building EVM Transaction ===");
console.log("Commitment:", commitmentHex);

// Get nonce from RPC - should be the fallback account's nonce
const nonce = await provider.getTransactionCount(wallet.address);
console.log("Nonce:", nonce);

// Build LEGACY transaction (type 0)
const tx = {
  to: CONTRACT,
  value: amountWei,
  gasLimit: 150000,
  gasPrice: 100000000n,
  nonce,
  chainId: CHAIN_ID,
  data: evmCallData,
};

// For revive.ethTransact, pass just the call data (not full RLP)
// The pallet will construct the transaction internally
console.log("Using just calldata (no RLP):", evmCallData);

// Now submit via revive.ethTransact
const wsProvider = new WsProvider(WS_RPC);
const api = await ApiPromise.create({ provider: wsProvider });

// Use the keyring for signing (we need a Substrate signer for the extrinsic)
const seed = process.env.FORWARDER_SEED;
const keyring = new Keyring({ type: "sr25519" });
const pair = keyring.addFromUri(seed!);

console.log("\n=== Submitting via revive.ethTransact ===");

const ethTransactTx = api.tx.revive.ethTransact(
  api.createType("Bytes", evmCallData)
);

console.log("ethTransact tx hex:", ethTransactTx.method.toHex().slice(0, 60) + "...");

const hash = await new Promise<string>((resolve, reject) => {
  ethTransactTx.signAndSend(pair, ({ status, txHash, dispatchError }: any) => {
    console.log("Status:", status.type, "Hash:", txHash?.toHex());
    if (dispatchError) {
      console.log("Error:", dispatchError.toString());
    }
    if (status.isInBlock || status.isFinalized) resolve(txHash.toHex());
  }).catch(reject);
});

console.log("\nFinalized! Hash:", hash);

// Check final balances
const ethBalance2 = await provider.getBalance(wallet.address);
console.log("New ETH balance:", ethers.formatEther(ethBalance2));
console.log("Cost:", ethers.formatEther(ethBalance - ethBalance2), "DOT");

// Check pool
const sizeResult2 = await provider.call({ to: CONTRACT, data: poolIface.encodeFunctionData("treeSize") });
console.log("New pool size:", parseInt(sizeResult2, 16));

console.log("\n=== Deposit Note ===");
console.log("Secret:", secretHex);
console.log("Commitment:", commitmentHex);
console.log("Amount:", amountWei.toString());

await api.disconnect();