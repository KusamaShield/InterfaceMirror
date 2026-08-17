import { ApiPromise, WsProvider } from "@polkadot/api";
import { Keyring } from "@polkadot/keyring";
import { cryptoWaitReady } from "@polkadot/util-crypto";
import * as dotenv from "dotenv";
dotenv.config();

const SEED = process.env.FORWARDER_SEED;
if (!SEED) throw new Error("Set FORWARDER_SEED in .env");
const WS_RPC = "wss://asset-hub-polkadot-rpc.n.dwellir.com";

async function main() {
  await cryptoWaitReady();

  const keyring = new Keyring({ type: "sr25519" });
  const pair = keyring.addFromUri(SEED);
  const ss58 = pair.address;
  console.log("=== Forwarder (Account 1) ===");
  console.log("SS58:", ss58);

  // Derive fallback H160
  const { decodeAddress } = await import("@polkadot/util-crypto");
  const pk = decodeAddress(ss58);
  const keccak = (await import("ethers")).ethers.keccak256(pk);
  const h160 = "0x" + keccak.slice(-40);
  console.log("H160 (fallback):", h160);

  const wsProvider = new WsProvider(WS_RPC);
  const api = await ApiPromise.create({ provider: wsProvider });
  try {
    const accountInfo: any = await api.query.system.account(ss58);
    const free = Number(accountInfo.data.free.toString()) / 1e10;
    console.log("Substrate balance:", free.toFixed(6), "DOT");
    console.log("Nonce:", accountInfo.nonce.toString());
    console.log("Reserved:", (Number(accountInfo.data.reserved.toString()) / 1e10).toFixed(6), "DOT");
    console.log("Total:", ((Number(accountInfo.data.free.toString()) + Number(accountInfo.data.reserved.toString())) / 1e10).toFixed(6), "DOT");

    // EVM balance
    const provider = new (await import("ethers")).ethers.JsonRpcProvider("https://polkadot-assethub-rpc.laissez-faire.trade");
    try {
      const evmBal = await provider.getBalance(h160);
      console.log("EVM balance:", (await import("ethers")).ethers.formatEther(evmBal), "DOT");
    } catch { console.log("EVM balance: N/A"); }

    // revive mapping
    const mapping: any = await api.query.revive?.accountInfoOf(h160);
    if (mapping && !mapping.isEmpty) {
      console.log("revive mapped:", mapping.toHuman()?.owner || "yes");
    } else {
      console.log("revive mapped: NO");
    }
  } finally {
    await api.disconnect();
    wsProvider.disconnect();
    process.exit(0);
  }
}

main().catch(e => { console.error("Fatal:", e); process.exit(1); });