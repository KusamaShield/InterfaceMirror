import { ApiPromise, WsProvider } from "@polkadot/api";
import { Keyring } from "@polkadot/keyring";
import { cryptoWaitReady, decodeAddress } from "@polkadot/util-crypto";
import * as dotenv from "dotenv";
import { ethers } from "ethers";
dotenv.config();

async function main() {
  await cryptoWaitReady();
  const seed = process.env.FORWARDER_SEED!;
  const keyring = new Keyring({ type: "sr25519" });
  const pair = keyring.addFromUri(seed);

  const ws = new WsProvider("wss://asset-hub-polkadot-rpc.n.dwellir.com");
  const api = await ApiPromise.create({ provider: ws });

  const info: any = await api.query.system.account(pair.address);
  const free = BigInt(info.data.free.toString());
  console.log("Address:", pair.address);
  console.log("Balance:", (Number(free) / 1e10).toFixed(4), "DOT");

  const pubkey = decodeAddress(pair.address);
  const h160 = "0x" + Buffer.from(pubkey.slice(0, 20)).toString("hex");
  const mapped: any = await api.query.revive.accountInfoOf(h160);
  console.log("H160:", h160, mapped.isEmpty ? "NOT MAPPED" : "MAPPED");

  const provider = new ethers.JsonRpcProvider("https://polkadot-assethub-rpc.laissez-faire.trade");
  const evmBal = await provider.getBalance(h160);
  console.log("EVM balance:", ethers.formatEther(evmBal), "DOT");

  await api.disconnect();
}
main().catch(console.error);