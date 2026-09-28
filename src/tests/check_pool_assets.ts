/*
 * Diagnostic: scan AssetHub pools for pallet-asset exposure.
 * Mirrors the UI privacy dashboard discovery (App.tsx fetchPoolComposition):
 *   - assets.metadata.entries() over Substrate WS -> real assetIds
 *   - precompile = 0x{assetId:08x}00000000000000000000000001200000
 *   - batched contract.escrow(precompile) + balanceOf(pool)
 *
 * Usage: npx tsx src/tests/check_pool_assets.ts
 * Read-only: eth_call / storage queries only.
 */

import { ApiPromise, WsProvider } from "@polkadot/api";
import { ethers } from "ethers";

const POOLS = [
  {
    name: "POLKADOT v7",
    pool: "0x0D694Da746e73D1e255c1894F90e38170db45809",
    rpcs: [
      "https://polkadot-assethub-rpc.laissez-faire.trade/",
      "https://eth-rpc.polkadot.io/",
    ],
    wsEndpoints: [
      "wss://asset-hub-polkadot-rpc.n.dwellir.com",
      "wss://polkadot-asset-hub-rpc.polkadot.io",
      "wss://rpc-asset-hub-polkadot.stakeworld.io",
    ],
  },
  {
    name: "KUSAMA v7",
    pool: "0xC86A3B1A2EbBEc8d32949A1E75e3BafE50b5f1D4",
    rpcs: ["https://kusama-rpc.laissez-faire.trade/"],
    wsEndpoints: [
      "wss://asset-hub-kusama.rotko.net/",
      "wss://kusama-asset-hub-rpc.polkadot.io",
      "wss://asset-hub-kusama-rpc.n.dwellir.com",
    ],
  },
  {
    name: "PASEO v7 (old 0x3068)",
    pool: "0x3068490C79708D0725E3D4Aa9C35Da708f09071e",
    rpcs: ["https://paseo-assethub-rpc.laissez-faire.trade/"],
    wsEndpoints: ["wss://asset-hub-paseo-rpc.n.dwellir.com"],
  },
  {
    name: "PASEO v7 (old 0xbcE0)",
    pool: "0xbcE09D4De052b2816df1285663ac89528DF45380",
    rpcs: ["https://paseo-assethub-rpc.laissez-faire.trade/"],
    wsEndpoints: ["wss://asset-hub-paseo-rpc.n.dwellir.com"],
  },
  {
    name: "PASEO v7 (fixed 0x05d9)",
    pool: "0x05d96B6566D2872e66F8f1a58464CDC8ab7f871F",
    rpcs: ["https://paseo-assethub-rpc.laissez-faire.trade/"],
    wsEndpoints: ["wss://asset-hub-paseo-rpc.n.dwellir.com"],
  },
  {
    name: "PASEO v5",
    pool: "0xE433f84B086faefD0034C4C4C759F3d31adC18E8",
    rpcs: ["https://paseo-assethub-rpc.laissez-faire.trade/"],
    wsEndpoints: ["wss://asset-hub-paseo-rpc.n.dwellir.com"],
  },
];

const iface = new ethers.Interface([
  "function escrow(address) external view returns (uint256)",
  "function treeSize() external view returns (uint256)",
  "function spentNullifiers(bytes32) external view returns (bool)",
]);
const erc20 = new ethers.Interface([
  "function balanceOf(address) external view returns (uint256)",
]);

const ZERO_ADDR = "0x" + "00".repeat(20);
const FAKE_FROM = "0x" + "00".repeat(19) + "01";

async function connectSubstrate(
  wsEndpoints: string[],
): Promise<ApiPromise | null> {
  for (const endpoint of wsEndpoints) {
    try {
      const api = new ApiPromise({
        provider: new WsProvider(endpoint),
        noInitWarn: true,
      });
      await Promise.race([api.isReady, new Promise((r) => setTimeout(r, 12000))]);
      if (api.isConnected) {
        console.log(`  [ws] connected ${endpoint}`);
        return api;
      }
    } catch (_) {
      console.log(`  [ws] failed ${endpoint}`);
    }
  }
  return null;
}

async function fetchAssetIds(api: ApiPromise): Promise<number[]> {
  if (!api.query.assets?.metadata) {
    console.warn("  [ws] no assets.metadata pallet");
    return [];
  }
  const ids: number[] = [];
  try {
    const entries = await api.query.assets.metadata.entries();
    for (const [key, value] of entries) {
      if (!value) continue;
      const assetId = (key.args[0] as any).toNumber();
      if (!assetId) continue;
      ids.push(assetId);
    }
  } catch (e) {
    console.warn("  [ws] metadata.entries failed:", String(e).slice(0, 120));
  }
  return ids;
}

async function ethView(
  provider: ethers.JsonRpcProvider,
  to: string,
  data: string,
): Promise<bigint> {
  const res = await provider.call({ from: FAKE_FROM, to, data });
  return BigInt(res ?? "0x0");
}

async function scanPool(cfg: (typeof POOLS)[0]) {
  console.log(`=== ${cfg.name} ${cfg.pool} ===`);
  const provider = new ethers.JsonRpcProvider(cfg.rpcs[0]);

  try {
    const size = await ethView(provider, cfg.pool, iface.encodeFunctionData("treeSize"));
    console.log("  treeSize:", size);
  } catch (e: any) {
    console.log("  treeSize err:", String(e?.message || e).slice(0, 100));
  }
  try {
    const native = await ethView(provider, cfg.pool, iface.encodeFunctionData("escrow", [ZERO_ADDR]));
    console.log("  escrow[native]:", native);
  } catch (e: any) {
    console.log("  escrow[native] err:", String(e?.message || e).slice(0, 100));
  }

  const api = await connectSubstrate(cfg.wsEndpoints);
  let assetIds: number[] = [];
  if (api) {
    assetIds = await fetchAssetIds(api);
    console.log("  registry assetIds:", assetIds);
    try {
      await api.disconnect();
    } catch (_) {}
  }
  if (!assetIds.length) {
    console.log("  (registry unavailable; probing assetIds 1..64)");
    assetIds = Array.from({ length: 64 }, (_, i) => i + 1);
  }

  const found: Array<{ id: number; pre: string; bal: bigint | null; esc: bigint | null }> = [];
  const BATCH = 25;
  for (let i = 0; i < assetIds.length; i += BATCH) {
    const batch = assetIds.slice(i, i + BATCH);
    const results = await Promise.all(
      batch.map(async (assetId) => {
        const pre = `0x${assetId.toString(16).padStart(8, "0")}00000000000000000000000001200000`;
        let bal: bigint | null = null;
        let esc: bigint | null = null;
        try {
          const b = await ethView(provider, pre, erc20.encodeFunctionData("balanceOf", [cfg.pool.toLowerCase()]));
          if (b > 0n) bal = b;
        } catch (_) {}
        try {
          const e = await ethView(provider, cfg.pool, iface.encodeFunctionData("escrow", [pre.toLowerCase()]));
          if (e > 0n) esc = e;
        } catch (_) {}
        if (bal || esc) return { id: assetId, pre, bal, esc };
        return null;
      }),
    );
    for (const r of results) {
      if (r) found.push(r);
    }
  }

  if (found.length) {
    for (const f of found) {
      console.log(`  >> asset ${f.id} ${f.pre}: poolBalanceOf=${f.bal ?? 0} escrow=${f.esc ?? 0}`);
    }
  } else {
    console.log("  no registered asset has pool balance/escrow > 0");
  }
  console.log("");
}

for (const cfg of POOLS) {
  await scanPool(cfg).catch((e) => {
    console.log(`  ERROR: ${String(e).slice(0, 200)}`);
  });
}
console.log("done");