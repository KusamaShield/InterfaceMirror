import { ApiPromise, WsProvider } from "@polkadot/api";
import { Keyring } from "@polkadot/keyring";
import { cryptoWaitReady, encodeAddress } from "@polkadot/util-crypto";
import * as dotenv from "dotenv";
dotenv.config();
await cryptoWaitReady();

const seed = process.env.FORWARDER_SEED;
const keyring = new Keyring({ type: "sr25519" });
const pair = keyring.addFromUri(seed!);

const ws = new WsProvider("wss://asset-hub-polkadot-rpc.n.dwellir.com");
const api = await ApiPromise.create({ provider: ws });

const info: any = await api.query.system.account(pair.address);
console.log("Forwarder balance:", Number(info.data.free) / 1e10, "DOT");
console.log("Forwarder nonce:", info.nonce.toNumber());

// Check the tx from the last run
const txHash = "0xc02e7fc1f76fbfe710366d06db44b49c868157080e5aec919718e5eec5fa1c76";
const events = await api.query.system.events.at(txHash);
console.log("\nTx events for", txHash);
(events as any).forEach(({ event }: any) => {
  console.log(`  ${event.section}.${event.method}:`, event.data.toHuman?.());
});

// Check the fallback address from last run
const addrHex = "0x8c6cfa351fdd084b7ac4bdadbf58a0a9d520f983eeeeeeeeeeeeeeeeeeeeeeee";
const ss58 = encodeAddress(addrHex, 0);
console.log("\nFallback SS58:", ss58);
const fbInfo: any = await api.query.system.account(ss58);
console.log("Fallback balance:", Number(fbInfo.data.free) / 1e10, "DOT");

// Also check prev successful fallback
const prevHex = "0xbe748f4b4fd3ec74b2ed0c71117fec8e7bac8788eeeeeeeeeeeeeeeeeeeeeeee";
const prevSs58 = encodeAddress(prevHex, 0);
const prevInfo: any = await api.query.system.account(prevSs58);
console.log("Prev fallback balance:", Number(prevInfo.data.free) / 1e10, "DOT");

await api.disconnect();