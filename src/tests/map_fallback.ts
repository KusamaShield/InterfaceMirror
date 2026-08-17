import { ApiPromise, WsProvider } from "@polkadot/api";
import { Keyring } from "@polkadot/keyring";
import { cryptoWaitReady, encodeAddress } from "@polkadot/util-crypto";
import * as dotenv from "dotenv";
dotenv.config();

await cryptoWaitReady();

const seed = process.env.FORWARDER_SEED;
const keyring = new Keyring({ type: "sr25519" });
const pair = keyring.addFromUri(seed!);

// Fallback SS58
const fallbackSS58 = "16QHNj77MogcUniEWh1VT44V7m5RyRJ2yQH3epFW4RcQRQhV";
const ethAddr = "0x96c2223f6318830F3Ed24eFe0a1E1fdcB64E5d17";

console.log("=== Mapping Fallback Account ===");
console.log("Fallback SS58:", fallbackSS58);
console.log("Target ETH address:", ethAddr);

const wsProvider = new WsProvider("wss://asset-hub-polkadot-rpc.n.dwellir.com");
const api = await ApiPromise.create({ provider: wsProvider });

// Try to map the fallback account
const mapTx = api.tx.revive.mapAccount(
  api.createType("Option<Address>", null),
  api.createType("bool", true) // allow erotic mapping
);

console.log("Map tx hex:", mapTx.method.toHex().slice(0, 60) + "...");

await new Promise((resolve, reject) => {
  mapTx.signAndSend(pair, ({ status, txHash, dispatchError }: any) => {
    console.log("Status:", status.type);
    if (dispatchError) {
      console.log("Error:", dispatchError.toString());
    }
    if (status.isInBlock || status.isFinalized) {
      console.log("Tx hash:", txHash.toHex());
      resolve(true);
    }
  }).catch(reject);
});

// Check if there's now EVM balance
const RPC = "https://polkadot-assethub-rpc.laissez-faire.trade/";
const res = await fetch(RPC, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "eth_getBalance",
    params: [ethAddr, "latest"],
  }),
});
const data = await res.json();
console.log("\nEVM balance after mapping:", data.result);

await api.disconnect();