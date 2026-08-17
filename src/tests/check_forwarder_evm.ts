import { Keyring } from "@polkadot/keyring";
import { cryptoWaitReady } from "@polkadot/util-crypto";
import * as dotenv from "dotenv";
dotenv.config();

await cryptoWaitReady();

const seed = process.env.FORWARDER_SEED;
const keyring = new Keyring({ type: "sr25519" });
const pair = keyring.addFromUri(seed!);

console.log("Forwarder SS58:", pair.address);

const RPC = "https://polkadot-assethub-rpc.laissez-faire.trade/";
const res = await fetch(RPC, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "eth_getBalance",
    params: [pair.address, "latest"],
  }),
});
const data = await res.json();
console.log("Full response:", JSON.stringify(data));
console.log("Forwarder EVM balance (raw):", data.result);