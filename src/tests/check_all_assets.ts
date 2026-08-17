/*
 * Copyright 2025 Kusama Shield Developers on behalf of the Kusama DAO, see LICENSE in main folder.
 *
 * Query ALL assets (local `assets` pallet) and foreign assets (`foreignAssets`
 * pallet) held by a Polkadot AssetHub account, with metadata (symbol/name/
 * decimals) for each.
 *
 * Strategy: iterate asset metadata entries (small, 1 per asset), then query
 * account balance for each assetId/location. Avoids iterating the full
 * double-map which has entries for every account.
 *
 * Run:
 *   npx tsx src/tests/check_all_assets.ts [ss58Address]
 */

import { ApiPromise, WsProvider } from "@polkadot/api";
import { cryptoWaitReady, decodeAddress } from "@polkadot/util-crypto";

const DEFAULT_SS58 = "155KxucBz9PxAinQMUGJBRLFUM6neixkBXQEn9oUsQ8w8M4Y";

const WS_RPCS = [
  "wss://polkadot-asset-hub-rpc.polkadot.io",
  "wss://rpc-asset-hub-polkadot.stakeworld.io",
  "wss://rpc-asset-hub-polkadot.luckyfriday.io",
  "wss://asset-hub-polkadot-rpc.n.dwellir.com",
];

function decodeHexToText(hexString: string): string {
  if (!hexString || !hexString.startsWith("0x")) return hexString;
  try {
    const hex = hexString.slice(2);
    let result = "";
    for (let i = 0; i < hex.length; i += 2) {
      const byte = parseInt(hex.substr(i, 2), 16);
      if (byte >= 32 && byte <= 126) result += String.fromCharCode(byte);
    }
    return result.trim() || hexString;
  } catch {
    return hexString;
  }
}

async function connect(wsRpcList: string[]) {
  for (const wsUrl of wsRpcList) {
    const wsProvider = new WsProvider(wsUrl);
    const api = new ApiPromise({ provider: wsProvider, noInitWarn: true });
    try {
      await Promise.race([
        api.isReady,
        new Promise<never>((_, rej) =>
          setTimeout(() => rej(new Error("timeout after 20s")), 20000),
        ),
      ]);
      console.log(`Connected to ${wsUrl}`);
      return api;
    } catch (e: any) {
      console.warn(`  ${wsUrl}: ${e?.message || e}`);
      try { await api.disconnect(); } catch (_) {}
    }
  }
  throw new Error("All WS endpoints unreachable.");
}

async function main() {
  await cryptoWaitReady();
  const ss58 = process.argv[2] || DEFAULT_SS58;
  const accountId32 = "0x" + Buffer.from(decodeAddress(ss58)).toString("hex");
  console.log("SS58:        ", ss58);
  console.log("AccountId32: ", accountId32);

  const api = await connect(WS_RPCS);

  // ---- Local assets (assets pallet) ----
  console.log("\n=== Local assets (assets pallet) ===");
  try {
    const metaEntries = await api.query.assets.metadata.entries();
    console.log(`  Scanning ${metaEntries.length} local assets...`);
    let found = 0;
    for (const [key, value] of metaEntries) {
      const assetId = (key.args[0] as any).toString();
      const meta = value.toJSON() as any;
      if (!meta) continue;
      const acct = (await api.query.assets.account(assetId, accountId32)).toJSON() as any;
      if (!acct || BigInt(acct.balance || 0) === 0n) continue;
      found++;
      const symbol = decodeHexToText(meta.symbol);
      const name = decodeHexToText(meta.name);
      const decimals = meta.decimals ?? 0;
      const human = Number(acct.balance) / 10 ** decimals;
      console.log(
        `  asset ${assetId}: ${human.toFixed(Math.min(decimals, 8))} ${symbol} ("${name}") | raw=${acct.balance} decimals=${decimals} frozen=${acct.isFrozen}`,
      );
    }
    if (found === 0) console.log("  (none)");
  } catch (e: any) {
    console.error("  Error:", e?.message || e);
  }

  // ---- Foreign assets (foreignAssets pallet) ----
  console.log("\n=== Foreign assets (foreignAssets pallet) ===");
  try {
    const metaEntries = await api.query.foreignAssets.metadata.entries();
    console.log(`  Scanning ${metaEntries.length} foreign assets...`);
    let found = 0;
    for (const [key, value] of metaEntries) {
      const loc = key.args[0] as any;
      const meta = value.toJSON() as any;
      if (!meta) continue;
      let acct: any;
      try {
        acct = (await api.query.foreignAssets.account(loc, accountId32)).toJSON() as any;
      } catch {
        continue;
      }
      if (!acct || BigInt(acct.balance || 0) === 0n) continue;
      found++;
      const symbol = decodeHexToText(meta.symbol);
      const name = decodeHexToText(meta.name);
      const decimals = meta.decimals ?? 0;
      const human = Number(acct.balance) / 10 ** decimals;
      console.log(
        `  ${JSON.stringify(loc.toHuman())}: ${human.toFixed(Math.min(decimals, 8))} ${symbol} ("${name}") | raw=${acct.balance} decimals=${decimals}`,
      );
    }
    if (found === 0) console.log("  (none)");
  } catch (e: any) {
    console.error("  Error:", e?.message || e);
  }

  await api.disconnect();
  console.log("\nDone.");
}

main().catch((e) => {
  console.error("Fatal:", e?.message || e);
  process.exitCode = 1;
});