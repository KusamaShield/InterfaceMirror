/*
 * Copyright 2025 Kusama Shield Developers on behalf of the Kusama DAO, see LICENSE in main folder.
 *
 * Query Polkadot AssetHub shield pool composition
 * Run with: npx tsx src/tests/query_polkadot_pool.ts
 */

import { ethers } from "ethers";
import { ApiPromise, WsProvider } from "@polkadot/api";
import { Buffer } from "buffer";

const CONFIG = {
  network: "Polkadot AssetHub",
  // v7 Pool (FixedIlopPhase2Paseo_v7_Polkadot.sol) - linkability fix, 8 signals
  shieldAddress: "0x6f54d64C5619363722e4D1E4E53176F7f2FD57bf",
  rpcEndpoint: "https://polkadot-assethub-rpc.laissez-faire.trade",
  wsEndpoint: "wss://asset-hub-polkadot-rpc.polkadot.io",
  nativeAsset: "DOT",
  chainId: 420420419,
  abi: [
    "function escrow(address) external view returns (uint256)",
    "function getEscrowBalance(address) external view returns (uint256)",
    "function currentRoot() external view returns (uint256)",
    "function treeSize() external view returns (uint256)",
    "function isNullifierSpent(bytes32) external view returns (bool)",
    "function isKnownRoot(uint256) external view returns (bool)",
    "function getPrecompileAddress(uint256 assetId) external pure returns (address)",
    "function verifier() external view returns (address)",
  ],
};

function getPrecompileAddress(assetId: number): string {
  const assetIdHex = assetId.toString(16).padStart(8, "0");
  return `0x${assetIdHex}00000000000000000000000001200000`;
}

function decodeHexToText(hexString: string): string {
  if (!hexString || hexString === "0x") return hexString;

  if (typeof hexString === "string" && hexString.startsWith("0x")) {
    try {
      const hex = hexString.slice(2);
      if (!hex) return hexString;

      const decoded = Buffer.from(hex, "hex")
        .toString("utf8")
        .replace(/\0/g, "")
        .trim();

      return decoded || hexString;
    } catch {
      return hexString;
    }
  }

  return hexString;
}

async function queryShieldPool() {
  console.log("🚀 Querying Polkadot AssetHub shield pool...");
  console.log(`📍 Address: ${CONFIG.shieldAddress}`);
  console.log(`🔗 RPC: ${CONFIG.rpcEndpoint}`);
  console.log(`🔗 WS: ${CONFIG.wsEndpoint}`);

  const provider = new ethers.JsonRpcProvider(CONFIG.rpcEndpoint);
  const contract = new ethers.Contract(
    CONFIG.shieldAddress,
    CONFIG.abi,
    provider,
  );

  const assets: Array<{
    symbol: string;
    amount: number;
    decimals: number;
    assetId: number;
    address: string;
  }> = [];

  try {
    // 1. Verify contract exists
    console.log("\n📄 Verifying contract...");
    const code = await provider.getCode(CONFIG.shieldAddress);
    if (code === "0x" || code === "0x0" || code === "0x00") {
      console.error("❌ No contract code!");
      return;
    }
    console.log(
      `✅ Contract code: ${code.slice(0, 20)}... (${code.length} bytes)`,
    );

    // 2. Get contract state
    console.log("\n📊 Contract state:");
    try {
      const root = await contract.currentRoot();
      console.log(`   Current root: ${root.toString().slice(0, 20)}...`);
    } catch {}

    try {
      const treeSize = await contract.treeSize();
      console.log(`   Tree size: ${treeSize.toString()}`);
    } catch {}

    // 3. Query native DOT balance
    console.log("\n💰 Native DOT balance:");
    try {
      const nativeBalance = await contract.escrow(ethers.ZeroAddress);
      const nativeAmount = Number(ethers.formatUnits(nativeBalance, 18));
      console.log(`   Raw: ${nativeBalance.toString()}`);
      console.log(`   Formatted: ${nativeAmount} ${CONFIG.nativeAsset}`);

      if (nativeAmount > 0) {
        assets.push({
          symbol: CONFIG.nativeAsset,
          amount: nativeAmount,
          decimals: 18,
          assetId: 0,
          address: ethers.ZeroAddress,
        });
      }
    } catch (err) {
      console.error(`   ❌ Failed: ${err.message?.slice(0, 100)}`);
    }

    // 4. Discover assets via WebSocket
    console.log("\n🔍 Discovering assets via WebSocket...");
    try {
      const wsProvider = new WsProvider(CONFIG.wsEndpoint);
      const api = await ApiPromise.create({ provider: wsProvider });
      await api.isReady;
      console.log("✅ WebSocket connected");

      if (api.query.assets && api.query.assets.metadata) {
        console.log("\n📊 Querying asset metadata...");
        const startTime = Date.now();
        const assetsMetadata = await api.query.assets.metadata.entries();
        console.log(
          `✅ Found ${assetsMetadata.length} assets with metadata (${Date.now() - startTime}ms)`,
        );

        // Process first 50 assets to check balances
        const testAssetIds: number[] = [];
        const assetSymbols: Record<number, string> = {};
        const assetDecimals: Record<number, number> = {};

        for (const [key, value] of assetsMetadata.slice(0, 50)) {
          const assetId = (key.args[0] as any).toNumber();
          testAssetIds.push(assetId);

          const metadata = value.toJSON() as any;
          if (metadata) {
            const symbol = decodeHexToText(metadata.symbol);
            const name = decodeHexToText(metadata.name);
            const decimals = metadata.decimals || 18;

            const displayName =
              symbol && symbol !== "0x"
                ? symbol
                : name && name !== "0x"
                  ? name
                  : `Asset-${assetId}`;

            assetSymbols[assetId] = displayName;
            assetDecimals[assetId] = decimals;
          }
        }

        // Query balances for test assets
        console.log(
          `\n💰 Checking balances for ${testAssetIds.length} assets...`,
        );
        for (const assetId of testAssetIds) {
          const precompileAddr = getPrecompileAddress(assetId);

          try {
            const balance = await contract.escrow(precompileAddr);
            if (balance > 0) {
              const amount = Number(
                ethers.formatUnits(balance, assetDecimals[assetId] || 18),
              );
              const symbol = assetSymbols[assetId] || `Asset-${assetId}`;

              console.log(`   ✅ ${symbol} (${assetId}): ${amount}`);

              assets.push({
                symbol,
                amount,
                decimals: assetDecimals[assetId] || 18,
                assetId,
                address: precompileAddr,
              });
            }
          } catch (err) {
            // Silent fail for assets that can't be queried
          }
        }

        await api.disconnect();
        console.log("🔗 WebSocket disconnected");
      } else {
        console.error("❌ Assets metadata pallet not available");
      }
    } catch (wsError) {
      console.error("❌ WebSocket error:", wsError.message);
    }

    // 5. Results
    console.log("\n📊 POOL COMPOSITION RESULTS:");
    console.log(`   Total assets with balance: ${assets.length}`);

    if (assets.length > 0) {
      const sortedAssets = assets.sort((a, b) => b.amount - a.amount);
      let totalValue = 0;

      console.log("\n   Asset breakdown:");
      for (const asset of sortedAssets) {
        console.log(
          `   • ${asset.symbol.padEnd(10)}: ${asset.amount.toFixed(8).padEnd(15)} (ID: ${asset.assetId.toString().padStart(8)})`,
        );
        totalValue += asset.amount;
      }

      console.log(`\n   💰 TOTAL POOL VALUE: ${totalValue.toFixed(8)}`);

      // Check if pool has deposits
      console.log("\n🔍 Pool analysis:");
      if (totalValue === 0) {
        console.log("   ℹ️ Pool is empty - no deposits yet");
      } else if (assets.length === 1 && assets[0].assetId === 0) {
        console.log("   ℹ️ Only native DOT in pool");
      } else {
        console.log(`   ✅ Pool has ${assets.length} different assets`);
      }
    } else {
      console.log("   ℹ️ No assets with balance found in shield pool");
    }

    // 6. Block explorer links
    console.log("\n🔗 Block Explorer Links:");
    console.log(
      `   https://blockscout.polkadot.io/address/${CONFIG.shieldAddress}`,
    );
    console.log(
      `   https://polkadot.assethub.subscan.io/account/${CONFIG.shieldAddress}`,
    );
    console.log(
      `   https://assethub.polkadot.network/assets?account=${CONFIG.shieldAddress}`,
    );
  } catch (error) {
    console.error("❌ Main error:", error);
  }
}

queryShieldPool().catch(console.error);
