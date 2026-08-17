/*
 * Copyright 2025 Kusama Shield Developers on behalf of the Kusama DAO, see LICENSE in main folder.
 *
 * Diagnose the Polkadot Asset Hub SS58 balance query used by queryUserAssets
 * (App.tsx). Tries every known WS endpoint and reports the balance (or the
 * failure) per endpoint, so you can see which public RPCs are currently
 * reachable instead of relying on the first one that answers.
 *
 * Run:
 *   npx tsx src/tests/check_polkadot_balance.ts [ss58Address]
 */

import { ApiPromise, WsProvider } from "@polkadot/api";
import { cryptoWaitReady, decodeAddress } from "@polkadot/util-crypto";

const DEFAULT_SS58 = "155KxucBz9PxAinQMUGJBRLFUM6neixkBXQEn9oUsQ8w8M4Y";

const WS_RPCS = [
  "wss://polkadot-asset-hub-rpc.polkadot.io",
  "wss://rpc-asset-hub-polkadot.stakeworld.io",
  "wss://rpc-asset-hub-polkadot.luckyfriday.io",
  "wss://asset-hub-polkadot-rpc.n.dwellir.com",
].filter((v, i, a) => v && a.indexOf(v) === i);

const EVM_RPCS = [
  "https://polkadot-assethub-rpc.laissez-faire.trade",
  "https://eth-rpc.polkadot.io/",
];

async function querySubstrate(wsUrl: string, ss58: string) {
  const wsProvider = new WsProvider(wsUrl);
  const api = new ApiPromise({ provider: wsProvider, noInitWarn: true });
  try {
    await Promise.race([
      api.isReady,
      new Promise<never>((_, rej) =>
        setTimeout(() => rej(new Error("timeout after 15s")), 15000),
      ),
    ]);

    const account = (await api.query.system.account(ss58)) as any;
    const free = BigInt(account.data.free.toString());
    const reserved = BigInt(account.data.reserved.toString());
    const decimals = api.registry.chainDecimals[0] || 10;
    const symbol = api.registry.chainTokens[0] || "DOT";

    return {
      ok: true,
      free,
      reserved,
      decimals,
      symbol,
      freeHuman: Number(free) / 10 ** decimals,
      genesis: api.genesisHash.toHex(),
    };
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) };
  } finally {
    try { await api.disconnect(); } catch (_) {}
  }
}

async function queryEvm(rpcUrl: string, h160: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_getBalance",
        params: [h160, "latest"],
      }),
      signal: controller.signal,
    });
    const d = await res.json();
    return { ok: true, wei: d.result ? BigInt(d.result) : 0n };
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) };
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  await cryptoWaitReady();
  const ss58 = process.argv[2] || DEFAULT_SS58;

  const raw = Buffer.from(decodeAddress(ss58)).toString("hex");
  const h160 = "0x" + raw.slice(0, 40);
  console.log("SS58 address:     ", ss58);
  console.log("AccountId32:      0x" + raw);
  console.log("Derived H160:     ", h160);
  console.log("");

  console.log("=== Substrate balance (api.query.system.account) ===");
  const results: any[] = [];
  for (const wsUrl of WS_RPCS) {
    process.stdout.write(`  ${wsUrl} ... `);
    const r = await querySubstrate(wsUrl, ss58);
    results.push({ wsUrl, ...r });
    if (r.ok) {
      console.log(
        `OK  ${r.freeHuman.toFixed(6)} ${r.symbol} (${r.free} planck, ${r.decimals} dp)`,
      );
    } else {
      console.log(`FAIL  ${r.error}`);
    }
  }

  console.log("");
  console.log("=== EVM balance (eth_getBalance on derived H160) ===");
  for (const rpcUrl of EVM_RPCS) {
    process.stdout.write(`  ${rpcUrl} ... `);
    const r = await queryEvm(rpcUrl, h160);
    if (r.ok) {
      console.log(
        `OK  ${r.wei} wei (${(Number(r.wei) / 1e18).toFixed(6)} DOT)`,
      );
    } else {
      console.log(`FAIL  ${r.error}`);
    }
  }

  console.log("");
  console.log("=== Summary ===");
  const reachable = results.filter((r) => r.ok);
  for (const r of results) {
    console.log(
      `${r.ok ? "OK " : "FAIL"} ${r.wsUrl}${
        r.ok ? ` -> ${r.freeHuman.toFixed(6)} ${r.symbol}` : ` -> ${r.error}`
      }`,
    );
  }
  console.log(`${reachable.length}/${WS_RPCS.length} WS endpoints reachable`);
}

main().catch((e) => {
  console.error("Fatal:", e?.message || e);
  process.exitCode = 1;
});
