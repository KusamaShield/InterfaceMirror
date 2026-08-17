/*
 * Copyright 2025 Kusama Shield Developers on behalf of the Kusama DAO, see LICENSE in main folder.
 *
 * Test privacy chart asset scanning with WebSocket endpoint
 * Run with: npx tsx src/tests/test_privacy_chart.ts
 */

import { ethers } from "ethers";
import { ApiPromise, WsProvider } from "@polkadot/api";
import { Buffer } from "buffer";

// Pool configuration
const POLKADOT_CONFIG = {
  name: "Polkadot AssetHub",
  shieldAddress: "0x0D694Da746e73D1e255c1894F90e38170db45809",
  // Substrate address (H160 + 0xEE*12)
  substrateAddress: "5CNHm7DdUYxj1cPR51raDjJAdjGTXX7omMn3Yy1uJwCrMGd8",
  rpcEndpoints: [
    "https://polkadot-assethub-rpc.laissez-faire.trade",
    "https://eth-rpc.polkadot.io/",
  ],
  wsEndpoints: [
    "wss://polkadot-asset-hub-rpc.polkadot.io",
    "wss://rpc-asset-hub-polkadot.stakeworld.io",
    "wss://asset-hub-polkadot-rpc.n.dwellir.com",
  ],
  nativeAsset: "DOT",
  chainId: 420420419,
};

const PASEO_CONFIG = {
  name: "Paseo AssetHub",
  shieldAddress: "0xbcE09D4De052b2816df1285663ac89528DF45380",
  // Substrate address (H160 + 0xEE*12)
  substrateAddress: "5GLMapZNHpBoXgo8xnBwXhxk9eoQV2RCdjLvXGuNrkGF9a56",
  rpcEndpoints: [
    "https://paseo-assethub-rpc.laissez-faire.trade/",
    "https://eth-asset-hub-paseo.dotters.network",
  ],
  wsEndpoints: [
    "wss://asset-hub-paseo-rpc.n.dwellir.com",
  ],
  nativeAsset: "DOT",
  chainId: 420420421,
};

// Helper functions from App.tsx
function getPrecompileAddress(assetId: number): string {
  const assetIdHex = assetId.toString(16).padStart(8, "0");
  return `0x${assetIdHex}00000000000000000000000001200000`;
}

function decodeSymbol(
  hexString: string | null | undefined,
  assetId: number,
): string {
  if (!hexString || hexString === "0x") return `Asset-${assetId}`;

  if (typeof hexString === "string" && hexString.startsWith("0x")) {
    try {
      const hex = hexString.slice(2);
      if (!hex) return `Asset-${assetId}`;

      // Use Buffer for proper UTF-8 decoding
      const decoded = Buffer.from(hex, "hex")
        .toString("utf8")
        .replace(/\0/g, "")
        .trim();

      return decoded || `Asset-${assetId}`;
    } catch {
      return `Asset-${assetId}`;
    }
  }

  // If it's already a string (not hex), return it
  return hexString;
}

async function tryConnectRpc(rpcEndpoints: string[]): Promise<{ provider: ethers.JsonRpcProvider; endpoint: string } | null> {
  for (const endpoint of rpcEndpoints) {
    try {
      console.log(`   Trying RPC: ${endpoint}`);
      const provider = new ethers.JsonRpcProvider(endpoint);
      await provider.getBlockNumber();
      console.log(`   ✅ Connected to: ${endpoint}`);
      return { provider, endpoint };
    } catch (e) {
      console.log(`   ❌ Failed: ${endpoint}`);
    }
  }
  return null;
}

async function tryConnectWs(wsEndpoints: string[]): Promise<{ api: ApiPromise; endpoint: string } | null> {
  for (const endpoint of wsEndpoints) {
    try {
      console.log(`   Trying WS: ${endpoint}`);
      const wsProvider = new WsProvider(endpoint);
      const api = await ApiPromise.create({ provider: wsProvider, noInitWarn: true });
      await api.isReady;
      console.log(`   ✅ Connected to: ${endpoint}`);
      return { api, endpoint };
    } catch (e) {
      console.log(`   ❌ Failed: ${endpoint}`);
    }
  }
  return null;
}

async function scanPool(config: typeof POLKADOT_CONFIG) {
  console.log(`\n🛡️  Scanning ${config.name} Privacy Pool`);
  console.log(`   Shield: ${config.shieldAddress}`);
  
  const assets: Array<{
    symbol: string;
    amount: number;
    decimals: number;
    assetId: number;
  }> = [];

  const abi = [
    "function escrow(address) external view returns (uint256)",
    "function getEscrowBalance(address) external view returns (uint256)",
  ];

  // 1. Connect to RPC
  console.log("\n📡 Step 1: Connecting to RPC...");
  const rpcResult = await tryConnectRpc(config.rpcEndpoints);
  if (!rpcResult) {
    console.error("❌ All RPC endpoints failed");
    return;
  }
  const { provider: rpcProvider } = rpcResult;

  const contract = new ethers.Contract(config.shieldAddress, abi, rpcProvider);

  // 2. Query native asset (EVM)
  console.log("\n💰 Step 2a: Query native asset (EVM contract)...");
  try {
    const nativeBalance = await contract.getEscrowBalance(ethers.ZeroAddress);
    console.log(`   Raw balance: ${nativeBalance.toString()}`);
    
    if (nativeBalance > 0n) {
      const nativeAmount = Number(ethers.formatUnits(nativeBalance, 18));
      console.log(`   ✅ ${nativeAmount} ${config.nativeAsset}`);
      assets.push({
        symbol: config.nativeAsset,
        amount: nativeAmount,
        decimals: 18,
        assetId: 0,
      });
    } else {
      console.log(`   ℹ️  No EVM balance for native asset`);
    }
  } catch (e) {
    console.error("   ❌ Query failed:", e);
  }

  // 2b. Query Substrate pallet-assets for native token (DOT in account)
  console.log("\n💰 Step 2b: Query native asset (Substrate pallet-assets)...");

  // 3. Connect to WebSocket for asset discovery
  console.log("\n🔗 Step 3: Connecting to WebSocket...");
  const wsResult = await tryConnectWs(config.wsEndpoints);
  if (!wsResult) {
    console.error("❌ All WebSocket endpoints failed");
    console.log("⚠️  Continuing without asset metadata...");
  } else {
    const { api } = wsResult;
    
    try {
      if (!api.query.assets || !api.query.assets.metadata) {
        console.error("❌ Assets metadata pallet not available");
      } else {
        console.log("\n📊 Querying assets metadata...");
        const startTime = Date.now();
        const assetsMetadata = await api.query.assets.metadata.entries();
        console.log(`✅ Found ${assetsMetadata.length} assets with metadata`);
        console.log(`⏱️  Metadata query took: ${Date.now() - startTime}ms`);

        // Process assets
        const assetIds: number[] = [];
        const assetSymbols: Record<number, string> = {};
        const assetDecimals: Record<number, number> = {};
        const precompileAddrs: Record<number, string> = {};

        console.log("\n📋 Processing metadata...");
        for (const [key, value] of assetsMetadata) {
          const assetId = (key.args[0] as any).toNumber();
          assetIds.push(assetId);
          const metadata = value.toJSON() as any;
          if (!metadata) continue;

          const symbol = decodeSymbol(metadata.symbol, assetId);
          const name = decodeSymbol(metadata.name, assetId);
          const decimals = metadata.decimals || 18;

          const displayName =
            symbol && symbol !== `Asset-${assetId}`
              ? symbol
              : name && name !== `Asset-${assetId}`
                ? name
                : `Asset-${assetId}`;

          assetSymbols[assetId] = displayName;
          assetDecimals[assetId] = decimals;
          precompileAddrs[assetId] = getPrecompileAddress(assetId);
        }

        console.log(`\n📈 Scanning ${assetIds.length} assets for pool balances...`);

        const batchSize = 50;
        let found = 0;
        
        for (let i = 0; i < assetIds.length; i += batchSize) {
          const batch = assetIds.slice(i, i + batchSize);
          const progress = Math.round(((i + batchSize) / assetIds.length) * 100);
          process.stdout.write(`\r   Progress: ${Math.min(progress, 100)}%`);

          const batchPromises = batch.map(async (assetId) => {
            let amount = 0;
            let source = "";
            
            // Try EVM contract
            try {
              const bal = await contract.getEscrowBalance(precompileAddrs[assetId]);
              if (bal > 0n) {
                amount = Number(ethers.formatUnits(bal, assetDecimals[assetId]));
                source = "EVM";
              }
            } catch {}

            // Try Substrate pallet-assets
            if (amount === 0) {
              try {
                const accountData = await api.query.assets.account(assetId, config.substrateAddress);
                const account = accountData.toJSON() as any;
                if (account && account.balance !== undefined) {
                  amount = Number(ethers.formatUnits(account.balance.toString(), assetDecimals[assetId]));
                  source = "Substrate";
                }
              } catch {}
            }

            if (amount > 0) {
              return {
                symbol: assetSymbols[assetId],
                amount,
                decimals: assetDecimals[assetId],
                assetId,
                source,
              };
            }
            return null;
          });

          const results = await Promise.all(batchPromises);
          for (const result of results) {
            if (result) {
              assets.push(result);
              found++;
              console.log(`\n   ✅ ${result.symbol} (${result.assetId}): ${result.amount.toFixed(4)}`);
            }
          }
        }
        console.log(`\n   Total assets with balance: ${found}`);
      }
    } catch (wsError) {
      console.error("❌ WebSocket error:", wsError);
    }

    await api.disconnect();
    console.log("\n🔗 WebSocket disconnected");
  }

  // 4. Results
  console.log("\n" + "=".repeat(50));
  console.log("📊 FINAL RESULTS:");
  console.log("=".repeat(50));
  console.log(`   Total assets in pool: ${assets.length}`);
  console.log(`   Assets found:`);

  const sortedAssets = assets.sort((a, b) => b.amount - a.amount);
  let totalAmount = 0;

  for (const asset of sortedAssets) {
    console.log(`   • ${asset.symbol}: ${asset.amount.toFixed(4)} (ID: ${asset.assetId})`);
    totalAmount += asset.amount;
  }

  console.log(`\n   💰 TOTAL POOL VALUE: ${totalAmount.toFixed(4)} ${config.nativeAsset}`);
  console.log("=".repeat(50));

  return assets;
}

async function main() {
  console.log("🚀 Privacy Pool Scanner");
  console.log("========================\n");
  
  // Scan Polkadot
  await scanPool(POLKADOT_CONFIG);
  
  console.log("\n" + "=".repeat(50) + "\n");
  
  // Scan Paseo
  await scanPool(PASEO_CONFIG);
}

main().catch(console.error);
