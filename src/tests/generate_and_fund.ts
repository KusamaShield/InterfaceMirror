import { ApiPromise, WsProvider } from "@polkadot/api";
import { Keyring } from "@polkadot/keyring";
import { cryptoWaitReady, encodeAddress } from "@polkadot/util-crypto";
import { ethers } from "ethers";
import * as dotenv from "dotenv";
dotenv.config();

await cryptoWaitReady();

// Step 1: Generate fresh ETH wallet
const ethWallet = ethers.Wallet.createRandom();
console.log("=== Generated ETH Wallet ===");
console.log("ETH address:", ethWallet.address);
console.log("ETH private key:", ethWallet.privateKey);

// Step 2: Compute Substrate AccountId32 = eth_addr_bytes + pad (12 bytes of 0xEE)
const ethAddrNoPrefix = ethWallet.address.replace("0x", "").toLowerCase();
const substrateHex = "0x" + ethAddrNoPrefix + "ee".repeat(12);
const substrateSS58 = encodeAddress(substrateHex, 0);
console.log("Substrate AccountId32:", substrateSS58);

// Step 3: Send 1 DOT from forwarder
const seed = process.env.FORWARDER_SEED;
const keyring = new Keyring({ type: "sr25519" });
const pair = keyring.addFromUri(seed!);

const wsProvider = new WsProvider("wss://asset-hub-polkadot-rpc.n.dwellir.com");
const api = await ApiPromise.create({ provider: wsProvider });

const forwarderInfo: any = await api.query.system.account(pair.address);
console.log("\nForwarder balance:", (Number(forwarderInfo.data.free) / 1e10).toFixed(4), "DOT");

console.log("\n=== Sending 1 DOT to new ETH account ===");
const transferTx = api.tx.balances.transferAllowDeath(substrateSS58, 10_000_000_000n);

await new Promise((resolve, reject) => {
  transferTx.signAndSend(pair, ({ status, txHash, dispatchError }: any) => {
    console.log("Status:", status.type);
    if (dispatchError) console.log("Error:", dispatchError.toString());
    if (status.isInBlock || status.isFinalized) {
      console.log("Tx:", txHash.toHex());
      resolve(true);
    }
  }).catch(reject);
});

const newBalance: any = await api.query.system.account(substrateSS58);
console.log("New Substrate balance:", (Number(newBalance.data.free) / 1e10).toFixed(4), "DOT");

await api.disconnect();

// Step 4: Wait for and check ETH balance
console.log("\n=== Waiting for ETH balance ===");
const RPC = "https://polkadot-assethub-rpc.laissez-faire.trade/";
async function rpcCall(method: string, params: any[]) {
  const res = await fetch(RPC, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
  const d = await res.json();
  return d.result;
}

for (let i = 0; i < 5; i++) {
  await new Promise(r => setTimeout(r, 3000));
  const bal = await rpcCall("eth_getBalance", [ethWallet.address, "latest"]);
  console.log(`Attempt ${i + 1}: ETH balance = ${parseInt(bal, 16) / 1e18} DOT`);
  if (parseInt(bal, 16) > 0) break;
}

// Save the keys for later use
console.log("\n=== Save these values ===");
console.log(`ETH_PRIVATE_KEY=${ethWallet.privateKey}`);
console.log(`ETH_ADDRESS=${ethWallet.address}`);