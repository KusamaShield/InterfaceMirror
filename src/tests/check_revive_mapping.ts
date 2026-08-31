/**
 * Check whether an SS58 account is mapped for pallet-revive.
 *
 * pallet-revive stores the mapping in `Revive.originalAccount(H160)`.
 * An empty value (None) means the AccountId32 is NOT mapped yet.
 *
 * Usage:
 *   npx tsx src/tests/check_revive_mapping.ts <SS58_ADDRESS>
 *   npx tsx src/tests/check_revive_mapping.ts 5Dxr9EoL7ChvxPJAsQ8gZe1Dfbwh9AEeDmB3KpbCrihLU85u
 *
 * Also verifies the H160 derivation (ss58ToEth) used by the UI.
 */

import { ApiPromise, WsProvider } from "@polkadot/api";
import { decodeAddress } from "@polkadot/util-crypto";
import { ethers } from "ethers";

const WS_ENDPOINTS = [
  "wss://asset-hub-polkadot-rpc.n.dwellir.com",
  "wss://asset-hub-polkadot.gatotech.network",
  "wss://rpc-asset-hub-polkadot.helixstreet.io",
  "wss://rpc-asset-hub-polkadot.luckyfriday.io",
  "wss://statemint.api.onfinality.io/public-ws",
  "wss://polkadot-asset-hub-rpc.polkadot.io",
  "wss://rpc-asset-hub-polkadot.stakeworld.io",
];

function ss58ToEth(ss58: string): string {
  const pubkey = decodeAddress(ss58);
  if (pubkey.length >= 32 && !pubkey.slice(12).every((b) => b === 0xee)) {
    return "0x" + ethers.keccak256(Buffer.from(pubkey)).slice(2).slice(24);
  }
  return "0x" + Buffer.from(pubkey.slice(0, 20)).toString("hex");
}

async function connect(): Promise<ApiPromise> {
  for (const url of WS_ENDPOINTS) {
    try {
      const api = await ApiPromise.create({
        provider: new WsProvider(url),
        noInitWarn: true,
      });
      return api;
    } catch (e: any) {
      console.warn(`  WS ${url} failed: ${e?.message || e}`);
    }
  }
  throw new Error("All WS endpoints unreachable");
}

async function main() {
  const ss58 = process.argv[2];
  if (!ss58) {
    console.error("Usage: npx tsx src/tests/check_revive_mapping.ts <SS58_ADDRESS>");
    process.exit(1);
  }

  const h160 = ss58ToEth(ss58);
  console.log("=== Revive Account Mapping Check ===");
  console.log(`SS58: ${ss58}`);
  console.log(`H160 (ss58ToEth): ${h160}\n`);

  const api = await connect();
  try {
    // 1. originalAccount (correct storage — None => unmapped)
    const original = (await api.query.revive.originalAccount(h160)) as any;
    const originalIsMapped = !original.isEmpty;
    console.log(`[originalAccount] mapped=${originalIsMapped}`);
    if (originalIsMapped) {
      console.log(`  -> value: ${original.toHuman?.() ?? original.toString()}`);
    }

    // 2. accountInfoOf (what the UI currently uses)
    try {
      const info = (await api.query.revive.accountInfoOf(h160)) as any;
      const infoIsMapped = !info.isEmpty;
      console.log(`[accountInfoOf]    mapped=${infoIsMapped}`);
      if (infoIsMapped) {
        console.log(`  -> value: ${info.toHuman?.() ?? info.toString()}`);
      }
    } catch (e: any) {
      console.log(`[accountInfoOf]    ERROR: ${e?.message || e}`);
    }

    console.log("");
    console.log(
      `RESULT: ${
        originalIsMapped
          ? "MAPPED ✅ (no mapAccount needed)"
          : "NOT MAPPED ❌ (mapAccount required)"
      }`,
    );
  } finally {
    await api.disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
