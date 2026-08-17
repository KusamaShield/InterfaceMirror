import { ApiPromise, WsProvider } from "@polkadot/api";
import { Keyring } from "@polkadot/keyring";
import { cryptoWaitReady, decodeAddress } from "@polkadot/util-crypto";
import * as dotenv from "dotenv";
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

console.log("=== Checking ethSubstrateCall ===");
console.log("SS58:", ss58Address);
console.log("Derived H160:", derivedH160);

const WS_RPC = "wss://asset-hub-polkadot-rpc.n.dwellir.com";
const wsProvider = new WsProvider(WS_RPC);
const api = await ApiPromise.create({ provider: wsProvider });

console.log("\n--- Available pallet methods ---");
console.log("revive.ethSubstrateCall:", api.tx.revive.ethSubstrateCall ? "YES" : "NO");
console.log("revive.ethTransact:", api.tx.revive.ethTransact ? "YES" : "NO");

// Try ethSubstrateCall - allows EVM tx to execute Substrate call
if (api.tx.revive.ethSubstrateCall) {
  console.log("\nethSubstrateCall args:", 
    api.tx.revive.ethSubstrateCall.meta.args.map((a: any) => `${a.name}: ${a.type}`).join(", ")
  );
  
  // This allows executing a Substrate call from EVM context
  // Could transfer DOT from the caller's Substrate balance
  const callTx = api.tx.balances.transferAllowDeath(
    "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY", // some recipient
    1e10 // 1 DOT
  );
  
  console.log("\nTrying ethSubstrateCall with balances.transfer...");
  const tx = api.tx.revive.ethSubstrateCall(callTx.method.toHex());
  console.log("Method hex:", tx.method.toHex().slice(0, 80) + "...");
  console.log("(This requires signing with ECDSA key, not sr25519)");
}

console.log("\n--- Conclusion ---");
console.log("Path A (sr25519 -> revive.call): The value param transfers from Substrate");
console.log("balance but EVM execution sees 0 because mapped H160 has 0 EVM balance.");
console.log("This is a known limitation of the revive pallet for value transfers.");
console.log("");
console.log("Path B (ECDSA -> eth_sendRawTransaction): The correct way -");
console.log("ECDSA key controls an address with EVM balance.");

await api.disconnect();