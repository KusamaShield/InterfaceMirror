import { ApiPromise, WsProvider } from "@polkadot/api";
import { Keyring } from "@polkadot/keyring";
import { cryptoWaitReady } from "@polkadot/util-crypto";
import * as dotenv from "dotenv";
dotenv.config();

await cryptoWaitReady();

// Forwarder key (has 4.28 DOT)
const seed = process.env.FORWARDER_SEED;
const keyring = new Keyring({ type: "sr25519" });
const pair = keyring.addFromUri(seed!);

// Fallback SS58
const fallbackSS58 = "16QHNj77MogcUniEWh1VT44V7m5RyRJ2yQH3epFW4RcQRQhV";

// ECDSA address to fund (for EVM)
const ethAddr = "0x96c2223f6318830F3Ed24eFe0a1E1fdcB64E5d17";

const wsProvider = new WsProvider("wss://asset-hub-polkadot-rpc.n.dwellir.com");
const api = await ApiPromise.create({ provider: wsProvider });

// Check forwarder balance
const forwarderInfo: any = await api.query.system.account(pair.address);
console.log("Forwarder balance:", (Number(forwarderInfo.data.free) / 1e10).toFixed(4), "DOT");

// Transfer 0.5 DOT to fallback's Substrate address
console.log("\n=== Transferring 0.5 DOT to fallback (Substrate) ===");
const transferTx = api.tx.balances.transferAllowDeath(fallbackSS58, 5_000_000_000n);

await new Promise((resolve, reject) => {
  transferTx.signAndSend(pair, ({ status, txHash, dispatchError }: any) => {
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

// Check new balances
const fallbackInfo: any = await api.query.system.account(fallbackSS58);
console.log("\nFallback Substrate balance:", (Number(fallbackInfo.data.free) / 1e10).toFixed(4), "DOT");

// Now we need to also fund the EVM balance
// Use eth_call to check if we can do a direct EVM transfer via eth_transact
// Actually, revive has a way to fund EVM accounts - through the EVM pallet
// Let's check if we can use api.tx.evm.deposit

console.log("\n=== Funding EVM balance via evm.deposit ===");
// Convert DOT to planck (1 DOT = 10^10 planck)
// We want to deposit 0.1 DOT = 1_000_000_000 planck to EVM
const depositAmount = 1_000_000_000n; // 0.1 DOT in planck

const evmDepositTx = api.tx.evm.deposit(ethAddr.replace("0x", ""), depositAmount);

await new Promise((resolve, reject) => {
  evmDepositTx.signAndSend(pair, ({ status, txHash, dispatchError }: any) => {
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

await api.disconnect();
console.log("\nDone! Fallback should now have EVM balance.");