import { ApiPromise, WsProvider } from "@polkadot/api";
import { Keyring } from "@polkadot/keyring";
import { cryptoWaitReady, encodeAddress } from "@polkadot/util-crypto";
import * as dotenv from "dotenv";
dotenv.config();

await cryptoWaitReady();

const seed = process.env.FORWARDER_SEED;
if (!seed) throw new Error("FORWARDER_SEED not set");

const keyring = new Keyring({ type: "sr25519" });
const pair = keyring.addFromUri(seed);

const fallbackHex = "0xeeeeeeeeeeeeeeeeeeeeeeee96c2223f6318830f3ed24efe0a1e1fdcb64e5d17";
const fallbackSS58 = encodeAddress(fallbackHex, 0);

console.log("From (forwarder):", pair.address);
console.log("To (fallback SS58):", fallbackSS58);
console.log("To (fallback hex):", fallbackHex);

const wsProvider = new WsProvider("wss://asset-hub-polkadot-rpc.n.dwellir.com");
const api = await ApiPromise.create({ provider: wsProvider });

// Check forwarder balance
const info: any = await api.query.system.account(pair.address);
console.log("Forwarder balance:", (Number(info.data.free) / 1e10).toFixed(4), "DOT");

// Send 2 DOT
const tx = api.tx.balances.transferAllowDeath(fallbackSS58, String(2 * 1e10));

console.log("Sending 2 DOT...");
const hash = await new Promise<string>((resolve, reject) => {
  tx.signAndSend(pair, ({ status, txHash, dispatchError }: any) => {
    console.log("Status:", status.type, "Hash:", txHash?.toHex());
    if (dispatchError) {
      console.log("Error:", dispatchError.toString());
      reject(new Error("Tx failed"));
      return;
    }
    if (status.isInBlock) resolve(txHash.toHex());
    else if (status.isFinalized) resolve(txHash.toHex());
  }).catch(reject);
});

console.log("Transfer tx:", hash);
await api.disconnect();