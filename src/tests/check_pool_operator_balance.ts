import { ethers } from "ethers";
import { ApiPromise, WsProvider } from "@polkadot/api";
import { cryptoWaitReady, decodeAddress, encodeAddress } from "@polkadot/util-crypto";
import * as dotenv from "dotenv";
dotenv.config();

const PK = process.env.SHIELDED_PRIV_KEY || process.env.ETH_PRIVATE_KEY;
if (!PK) throw new Error("Set SHIELDED_PRIV_KEY or ETH_PRIVATE_KEY in .env");
const EVM_RPC = "https://polkadot-assethub-rpc.laissez-faire.trade";
const WS_RPC = "wss://asset-hub-polkadot-rpc.n.dwellir.com";

async function main() {
  await cryptoWaitReady();

  const wallet = new ethers.Wallet(PK);
  const address = wallet.address;
  console.log("=== Pool Operator Account ===");
  console.log("EVM address:", address);

  const provider = new ethers.JsonRpcProvider(EVM_RPC);
  const evmBalance = await provider.getBalance(address);
  console.log("EVM balance:", ethers.formatEther(evmBalance), "DOT");

  const wsProvider = new WsProvider(WS_RPC);
  const api = await ApiPromise.create({ provider: wsProvider });
  try {
    const h160 = address;
    const pairPk = Buffer.from(decodeAddress(h160));
    const pk = new Uint8Array(32);
    pk.set(pairPk.slice(0, 20), 0);
    for (let i = 20; i < 32; i++) pk[i] = 0xEE;
    const ss58 = encodeAddress(pk, 0);
    console.log("SS58 address:", ss58);

    const accountInfo: any = await api.query.system.account(ss58);
    const free = accountInfo.data.free;
    const bal = Number(free.toString()) / 1e10;
    console.log("Substrate balance:", bal.toFixed(6), "DOT");
    console.log("Nonce:", accountInfo.nonce.toString());

    // Check revive mapping
    const mapping: any = await api.query.revive?.accountInfoOf(h160);
    if (mapping && !mapping.isEmpty) {
      const m = mapping.toHuman();
      console.log("revive mapped:", m?.owner || "yes");
    } else {
      console.log("revive mapped: NO");
    }

    console.log("Reserved:", (Number(accountInfo.data.reserved.toString()) / 1e10).toFixed(6), "DOT");
    console.log("Total:", ((Number(free.toString()) + Number(accountInfo.data.reserved.toString())) / 1e10).toFixed(6), "DOT");
  } finally {
    await api.disconnect();
    wsProvider.disconnect();
    process.exit(0);
  }
}

main().catch(e => { console.error("Fatal:", e); process.exit(1); });