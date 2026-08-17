/*
 * Copyright 2025 Kusama Shield Developers on behalf of the Kusama DAO, see LICENSE in main folder.
 *
 * Query the Substrate (SS58) native balance over WSS — no EVM/H160 conversion.
 *
 * Nova Wallet users on Polkadot Asset Hub hold DOT in their raw AccountId32;
 * the derived H160 has 0 balance, so we query api.query.system.account(ss58)
 * directly over a WebSocket RPC endpoint.
 *
 * Run:
 *   npx tsx src/tests/check_ss58_balance.ts [ss58Address]
 *
 * Env (optional):
 *   WS_RPC  single endpoint override
 */

import { ApiPromise, WsProvider } from "@polkadot/api";
import { cryptoWaitReady } from "@polkadot/util-crypto";

const DEFAULT_SS58 = "155KxucBz9PxAinQMUGJBRLFUM6neixkBXQEn9oUsQ8w8M4Y";

const WS_RPCS = [
  process.env.WS_RPC,
  "wss://polkadot-asset-hub-rpc.polkadot.io",
  "wss://rpc-asset-hub-polkadot.stakeworld.io",
  "wss://rpc-asset-hub-polkadot.luckyfriday.io",
].filter(Boolean) as string[];

async function main() {
  await cryptoWaitReady();

  const ss58 = process.argv[2] || DEFAULT_SS58;
  console.log("SS58 address:", ss58);

  // Random endpoint selection (load-balancing)
  const shuffled = [...WS_RPCS].sort(() => Math.random() - 0.5);

  for (const wsUrl of shuffled) {
      const wsProvider = new WsProvider(wsUrl);
      const api = new ApiPromise({
        provider: wsProvider,
        noInitWarn: true,
      });
      try {
        await Promise.race([
          api.isReady,
          new Promise<never>((_, rej) =>
            setTimeout(() => rej(new Error("timeout")), 15000),
          ),
        ]);
      console.log("Connected to", wsUrl);

      const account = (await api.query.system.account(ss58)) as any;
      const free = BigInt(account.data.free.toString());
      const reserved = BigInt(account.data.reserved.toString());
      const decimals = api.registry.chainDecimals[0] || 10;
      const tokenSymbol = api.registry.chainTokens[0] || "DOT";

      console.log(`Free balance:      ${free} planck`);
      console.log(`Reserved balance:  ${reserved} planck`);
      console.log(
        `Free balance:      ${(Number(free) / 10 ** decimals).toFixed(6)} ${tokenSymbol}`,
      );

      // Also show the raw AccountId32 + first-20-bytes H160 for reference
      const { decodeAddress } = await import("@polkadot/util-crypto");
      const raw = Buffer.from(decodeAddress(ss58)).toString("hex");
      console.log("AccountId32:       0x" + raw);
      console.log("H160 (first 20):   0x" + raw.slice(0, 40));

      await api.disconnect();
      return;
    } catch (e: any) {
      console.warn(`  WS ${wsUrl}: ${e?.message || e}`);
      try {
        await api.disconnect();
      } catch (_) {}
    }
  }

  throw new Error("All WS endpoints unreachable.");
}

main().catch((e) => {
  console.error("Fatal:", e?.message || e);
  process.exitCode = 1;
});
