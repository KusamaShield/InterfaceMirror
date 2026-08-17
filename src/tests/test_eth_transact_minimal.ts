import { ApiPromise, WsProvider } from "@polkadot/api";
import { Keyring } from "@polkadot/keyring";
import { cryptoWaitReady } from "@polkadot/util-crypto";
import { ethers } from "ethers";
import * as dotenv from "dotenv";
dotenv.config();

await cryptoWaitReady();

const ethPrivateKey = process.env.ETH_PRIVATE_KEY;
if (!ethPrivateKey) throw new Error("ETH_PRIVATE_KEY not set");

const CONTRACT = "0x0D694Da746e73D1e255c1894F90e38170db45809";
const WS_RPC = "wss://asset-hub-polkadot-rpc.n.dwellir.com";
const CHAIN_ID = 420_420_419n;

console.log("=== Testing revive.ethTransact with minimal tx ===\n");

const provider = new ethers.JsonRpcProvider("https://polkadot-assethub-rpc.laissez-faire.trade/", CHAIN_ID);
const wallet = new ethers.Wallet(ethPrivateKey, provider);

// The fallback address is the EVM address we're using
const fromAddress = wallet.address;

console.log("From address:", fromAddress);

// Get nonce - should be 0 for fresh account
const nonce = await provider.getTransactionCount(fromAddress);
console.log("Nonce:", nonce);

// Try a simple contract read (eth_call) first
const poolIface = new ethers.Interface(["function treeSize() external view returns (uint256)"]);
const readResult = await provider.call({
  to: CONTRACT,
  data: poolIface.encodeFunctionData("treeSize"),
});
console.log("Pool size (via eth_call):", parseInt(readResult, 16));

// Now try to do a minimal eth_transact - just send 0.001 DOT to the contract (no data)
const minimalTx = {
  to: CONTRACT,
  value: ethers.parseEther("0.001"),
  gasLimit: 21000, // minimal gas for simple transfer
  gasPrice: 100000000n,
  nonce,
  chainId: CHAIN_ID,
};

const serialized = ethers.Transaction.from(minimalTx).unsignedSerialized;
console.log("\n=== Minimal EVM Transaction ===");
console.log("To:", minimalTx.to);
console.log("Value:", ethers.formatEther(minimalTx.value), "DOT");
console.log("Serialized:", serialized.slice(0, 50) + "...");

// Now submit via revive.ethTransact
const wsProvider = new WsProvider(WS_RPC);
const api = await ApiPromise.create({ provider: wsProvider });

const seed = process.env.FORWARDER_SEED;
const keyring = new Keyring({ type: "sr25519" });
const pair = keyring.addFromUri(seed!);

console.log("\n=== Submitting via revive.ethTransact ===");

const ethTransactTx = api.tx.revive.ethTransact(
  api.createType("Bytes", serialized)
);

await new Promise((resolve, reject) => {
  ethTransactTx.signAndSend(pair, ({ status, txHash, dispatchError }: any) => {
    console.log("Status:", status.type, "Hash:", txHash?.toHex?.());
    if (dispatchError) {
      console.log("DispatchError:", dispatchError.toString());
    }
    if (status.isInBlock || status.isFinalized) {
      console.log("Finalized! Block:", status.asInBlock?.toHex?.() || status.asFinalized?.toHex?.());
      resolve(true);
    }
  }).catch((e: any) => {
    console.log("Error:", e.message);
    reject(e);
  });
});

await api.disconnect();