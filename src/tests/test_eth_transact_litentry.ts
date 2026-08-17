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
const WS_RPC = "wss://rpc-asset-hub-polkadot.litentry.io";
const CHAIN_ID = 420_420_419n;

console.log("=== Testing with Litentry RPC ===\n");

const provider = new ethers.JsonRpcProvider("https://rpc-asset-hub-polkadot.litentry.io", CHAIN_ID);
const wallet = new ethers.Wallet(ethPrivateKey, provider);

console.log("From address:", wallet.address);

const nonce = await provider.getTransactionCount(wallet.address);
console.log("Nonce:", nonce);

// Minimal transaction
const minimalTx = {
  to: CONTRACT,
  value: ethers.parseEther("0.001"),
  gasLimit: 21000,
  gasPrice: 100000000n,
  nonce,
  chainId: CHAIN_ID,
};

const serialized = ethers.Transaction.from(minimalTx).unsignedSerialized;
console.log("Serialized:", serialized.slice(0, 40) + "...");

// Submit via revive.ethTransact
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
    console.log("Status:", status.type);
    if (dispatchError) console.log("Error:", dispatchError.toString());
    if (status.isInBlock || status.isFinalized) resolve(true);
  }).catch(reject);
});

await api.disconnect();