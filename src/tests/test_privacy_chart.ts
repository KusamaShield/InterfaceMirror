/*
 * Copyright 2025 Kusama Shield Developers on behalf of the Kusama DAO, see LICENSE in main folder.
 *
 * Test privacy chart asset scanning with WebSocket endpoint
 * Run with: npx tsx src/tests/test_privacy_chart.ts
 */

import { ethers } from "ethers";
import { ApiPromise, WsProvider } from "@polkadot/api";
import { Buffer } from "buffer";

// Test configuration matching App.tsx logic
const TEST_CONFIG = {
  shieldAddress: "0x4f862778245e6C684AcE9cc32e1B870b6AF04b34",
  rpcEndpoint: "https://paseo-assethub-rpc.laissez-faire.trade/",
  wsEndpoint: "wss://asset-hub-paseo-rpc.n.dwellir.com",
  nativeAsset: "PAS",
  abi: ["function escrow(address) external view returns (uint256)"],
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

async function simulatePrivacyChartScan() {
  console.log("🚀 Simulating privacy chart asset scanning...");
  console.log("🔗 Using RPC proxy:", TEST_CONFIG.rpcEndpoint);
  console.log("🔗 Using WS endpoint:", TEST_CONFIG.wsEndpoint);

  const assets: Array<{
    symbol: string;
    amount: number;
    decimals: number;
    assetId: number;
  }> = [];

  try {
    // 1. Native asset
    const provider = new ethers.JsonRpcProvider(TEST_CONFIG.rpcEndpoint);
    const contract = new ethers.Contract(
      TEST_CONFIG.shieldAddress,
      TEST_CONFIG.abi,
      provider,
    );

    console.log("\n💰 Step 1: Query native asset...");
    try {
      const nativeBalance = await contract.escrow(ethers.ZeroAddress);
      console.log(`✅ Native balance: ${nativeBalance.toString()}`);

      if (nativeBalance > 0) {
        const nativeAmount = Number(ethers.formatUnits(nativeBalance, 18));
        console.log(
          `✅ Native amount: ${nativeAmount} ${TEST_CONFIG.nativeAsset}`,
        );
        assets.push({
          symbol: TEST_CONFIG.nativeAsset,
          amount: nativeAmount,
          decimals: 18,
          assetId: 0,
        });
      }
    } catch (e) {
      console.error("❌ Native asset query failed:", e);
    }

    // 2. WebSocket asset discovery
    console.log("\n🔗 Step 2: Connecting to WebSocket for asset discovery...");
    try {
      const wsProvider = new WsProvider(TEST_CONFIG.wsEndpoint);
      const api = await ApiPromise.create({ provider: wsProvider });
      await api.isReady;
      console.log("✅ WebSocket connected");

      if (api.query.assets && api.query.assets.metadata) {
        console.log("\n📊 Querying assets metadata...");
        const startTime = Date.now();
        const assetsMetadata = await api.query.assets.metadata.entries();
        console.log(`✅ Found ${assetsMetadata.length} assets with metadata`);
        console.log(`⏱️ Metadata query took: ${Date.now() - startTime}ms`);

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

        console.log(
          `📈 Processing ${assetIds.length} assets with known balances...`,
        );

        // Check specific assets we know have balance
        const knownAssets = [
          { assetId: 50000867, expectedName: "PSILV", decimals: 18 },
          { assetId: 50000926, expectedName: "CAP", decimals: 18 },
        ];

        for (const testAsset of knownAssets) {
          const assetId = testAsset.assetId;
          console.log(`\n🔍 Testing asset ${assetId}...`);

          // Check if we have metadata
          if (assetSymbols[assetId]) {
            console.log(`   Metadata: ${assetSymbols[assetId]}`);
            console.log(`   Decimals: ${assetDecimals[assetId]}`);
            console.log(`   Precompile: ${precompileAddrs[assetId]}`);

            try {
              const balance = await contract.escrow(precompileAddrs[assetId]);
              console.log(`   Raw balance: ${balance.toString()}`);

              if (balance > 0) {
                const amount = Number(
                  ethers.formatUnits(balance, assetDecimals[assetId]),
                );
                console.log(
                  `   ✅ Balance found: ${amount} ${assetSymbols[assetId]}`,
                );
                assets.push({
                  symbol: assetSymbols[assetId],
                  amount,
                  decimals: assetDecimals[assetId],
                  assetId,
                });
              } else {
                console.log(`   ℹ️ No balance for ${assetSymbols[assetId]}`);
              }
            } catch (e) {
              console.error(`   ❌ Query failed:`, e.message?.slice(0, 100));
            }
          } else {
            console.log(`   ⚠️ No metadata found for asset ${assetId}`);
          }
        }

        // Test some other assets
        console.log("\n🎯 Testing additional assets from metadata...");
        const testAssetIds = assetIds.slice(0, 10); // First 10 for testing
        for (let i = 0; i < testAssetIds.length; i++) {
          const assetId = testAssetIds[i];
          const progress = Math.round(((i + 1) / testAssetIds.length) * 100);
          process.stdout.write(
            `\r   Progress: ${progress}% (${i + 1}/${testAssetIds.length})`,
          );

          try {
            const balance = await contract.escrow(precompileAddrs[assetId]);
            if (balance > 0) {
              const amount = Number(
                ethers.formatUnits(balance, assetDecimals[assetId]),
              );
              console.log(
                `\n   ✅ ${assetSymbols[assetId]} (${assetId}): ${amount}`,
              );
              assets.push({
                symbol: assetSymbols[assetId],
                amount,
                decimals: assetDecimals[assetId],
                assetId,
              });
            }
          } catch {
            // Silent fail
          }
        }
        console.log();
      } else {
        console.error("❌ Assets metadata pallet not available");
      }

      await api.disconnect();
      console.log("\n🔗 WebSocket disconnected");
    } catch (wsError) {
      console.error("❌ WebSocket connection error:", wsError.message);
    }

    // 3. Results
    console.log("\n📊 FINAL RESULTS:");
    console.log(`   Total assets in pool: ${assets.length}`);
    console.log(`   Assets found:`);

    const sortedAssets = assets.sort((a, b) => b.amount - a.amount);
    let totalAmount = 0;

    for (const asset of sortedAssets) {
      console.log(
        `   • ${asset.symbol}: ${asset.amount.toFixed(3)} (${asset.assetId})`,
      );
      totalAmount += asset.amount;
    }

    console.log(`\n   💰 TOTAL POOL VALUE: ${totalAmount.toFixed(3)}`);

    // 4. Validation
    console.log("\n✅ VALIDATION:");
    console.log(
      `   ✓ Native PAS: ${assets.some((a) => a.symbol === "PAS") ? "FOUND" : "MISSING"}`,
    );
    console.log(
      `   ✓ PSILV (50000867): ${assets.some((a) => a.symbol === "PSILV") ? "FOUND" : "MISSING"}`,
    );
    console.log(
      `   ✓ CAP (50000926): ${assets.some((a) => a.symbol === "CAP") ? "FOUND" : "MISSING"}`,
    );

    if (
      assets.length >= 3 &&
      assets.some((a) => a.symbol === "PAS") &&
      assets.some((a) => a.symbol === "PSILV") &&
      assets.some((a) => a.symbol === "CAP")
    ) {
      console.log("\n🎉 SUCCESS: All expected assets found!");
    } else {
      console.log("\n⚠️ WARNING: Some expected assets missing!");
    }
  } catch (error) {
    console.error("❌ Main test error:", error);
    process.exit(1);
  }
}

// Run test
simulatePrivacyChartScan().catch(console.error);
