import { ApiPromise, WsProvider } from "@polkadot/api";

const wsProvider = new WsProvider("wss://asset-hub-polkadot-rpc.n.dwellir.com");
const api = await ApiPromise.create({ provider: wsProvider });

console.log("revive:", api.tx.revive ? "exists" : "NOT FOUND");
if (api.tx.revive) {
  console.log("revive methods:", Object.keys(api.tx.revive).join(", "));
}

await api.disconnect();
