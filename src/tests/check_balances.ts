import { ApiPromise, WsProvider } from "@polkadot/api";
import { Keyring } from "@polkadot/keyring";
import { cryptoWaitReady, encodeAddress } from "@polkadot/util-crypto";
import * as dotenv from "dotenv";
dotenv.config();

await cryptoWaitReady();

const seed = process.env.FORWARDER_SEED;
const keyring = new Keyring({ type: "sr25519" });
const pair = keyring.addFromUri(seed);

const ethAddr = "0x96c2223f6318830F3Ed24eFe0a1E1fdcB64E5d17".replace("0x", "").toLowerCase();
const fallbackHex = "0x" + "ee".repeat(12) + ethAddr;
const fallbackSS58 = encodeAddress(fallbackHex, 0);

console.log("ECDSA address:", "0x" + ethAddr);
console.log("Fallback SS58:", fallbackSS58);

const wsProvider = new WsProvider("wss://asset-hub-polkadot-rpc.n.dwellir.com");
const api = await ApiPromise.create({ provider: wsProvider });

const forwarderInfo: any = await api.query.system.account(pair.address);
console.log("Forwarder balance:", (Number(forwarderInfo.data.free) / 1e10).toFixed(4), "DOT");

const fallbackInfo: any = await api.query.system.account(fallbackSS58);
console.log("Fallback balance:", (Number(fallbackInfo.data.free) / 1e10).toFixed(4), "DOT");
console.log("Fallback nonce:", fallbackInfo.nonce.toString());

await api.disconnect();