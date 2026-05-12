/*
 * Copyright 2025 Kusama Shield Developers on behalf of the Kusama DAO, see LICENSE in main folder.
 *
 * Test script to debug asset scanning in Paseo v3 shield pool
 * Run with: npx tsx src/tests/debug_asset_scan.ts
 */

import { ethers } from "ethers";
import { ApiPromise, WsProvider } from "@polkadot/api";

// Paseo v3 network configuration
const CONFIG = {
  name: "Paseo AssetHub v3",
  shieldAddress: "0x3099889C1538f0200B831181cbfb532a4e9A418F",
  rpcEndpoint: "http://localhost:5173/api/rpc-proxy", // Use Vite proxy
  wsEndpoint: "wss://asset-hub-paseo-rpc.n.dwellir.com",
  nativeAsset: "PAS",
};

// Shield contract ABI
const SHIELD_ABI = ["function escrow(address) external view returns (uint256)"];

/**
 * Construct precompile address for Asset Hub ERC-20 precompiles
 */
function getPrecompileAddress(assetId: number): string {
  const assetIdHex = assetId.toString(16).padStart(8, "0");
  return `0x${assetIdHex}00000000000000000000000001200000`;
}

/**
 * Decode hex string to UTF-8 text
 */
function decodeHexToText(hexString: string): string {
  if (!hexString || hexString === "0x") return hexString;

  if (typeof hexString === "string" && hexString.startsWith("0x")) {
    try {
      const hex = hexString.slice(2);
      if (!hex) return hexString;

      // Browser-compatible hex decoding
      let result = "";
      for (let i = 0; i < hex.length; i += 2) {
        const byte = parseInt(hex.substr(i, 2), 16);
        if (byte >= 32 && byte <= 126) {
          // Printable ASCII
          result += String.fromCharCode(byte);
        }
      }
      return result.trim() || hexString;
    } catch {
      return hexString;
    }
  }

  return hexString;
}

/**
 * Test native asset query
 */
async function testNativeAsset(
  provider: ethers.JsonRpcProvider,
  contract: ethers.Contract,
) {
  console.log("\n💰 Testing native asset query...");
  try {
    const nativeBalance = await contract.escrow(ethers.ZeroAddress);
    console.log(`✅ Native balance: ${nativeBalance.toString()}`);
    const nativeAmount = Number(ethers.formatUnits(nativeBalance, 18));
    console.log(`✅ Native amount (formatted): ${nativeAmount}`);
    return nativeAmount > 0;
  } catch (error) {
    console.error("❌ Failed to query native asset:", error);
    return false;
  }
}

/**
 * Test specific asset ID query
 */
async function testSpecificAsset(
  provider: ethers.JsonRpcProvider,
  contract: ethers.Contract,
  assetId: number,
  decimals: number = 18,
) {
  console.log(`\n🔍 Testing asset ${assetId}...`);
  try {
    const precompileAddr = getPrecompileAddress(assetId);
    console.log(`   Precompile address: ${precompileAddr}`);

    const balance = await contract.escrow(precompileAddr);
    console.log(`   Raw balance: ${balance.toString()}`);

    if (balance > 0) {
      const amount = Number(ethers.formatUnits(balance, decimals));
      console.log(`✅ Asset ${assetId}: ${amount} (balance > 0)`);
      return { assetId, amount, balance: balance.toString() };
    } else {
      console.log(`ℹ️ Asset ${assetId}: 0 (no balance)`);
      return null;
    }
  } catch (error) {
    console.error(
      `❌ Failed to query asset ${assetId}:`,
      error.message?.slice(0, 100),
    );
    return null;
  }
}

/**
 * Test WebSocket connection and asset metadata
 */
async function testWebSocketAssets() {
  console.log("\n🔗 Testing WebSocket connection...");
  try {
    const wsProvider = new WsProvider(CONFIG.wsEndpoint);
    const api = await ApiPromise.create({ provider: wsProvider });

    console.log("✅ Substrate API connected");

    // Check available pallets
    console.log("\n📋 Available pallets:");
    const pallets = Object.keys(api.query).sort();
    console.log(`   Total pallets: ${pallets.length}`);
    console.log(`   Assets pallet available: ${"assets" in api.query}`);
    console.log(
      `   Assets.metadata available: ${api.query.assets?.metadata ? "YES" : "NO"}`,
    );
    console.log(
      `   Assets.asset available: ${api.query.assets?.asset ? "YES" : "NO"}`,
    );

    if (api.query.assets && api.query.assets.metadata) {
      console.log("\n📊 Querying asset metadata...");
      const assetsMetadata = await api.query.assets.metadata.entries();
      console.log(`✅ Found ${assetsMetadata.length} assets with metadata`);

      // Show first 10 assets
      console.log("\n📋 First 10 assets metadata:");
      for (let i = 0; i < Math.min(10, assetsMetadata.length); i++) {
        const [key, value] = assetsMetadata[i];
        const assetId = (key.args[0] as any).toNumber();
        const metadata = value.toJSON() as any;

        if (metadata) {
          const symbol = decodeHexToText(metadata.symbol);
          const name = decodeHexToText(metadata.name);
          console.log(
            `   ${assetId}: "${symbol}" ("${name}") - ${metadata.decimals} decimals`,
          );
        }
      }

      // Test specific asset IDs from earlier logs
      const testAssetIds = [
        50000867, // PSILV from earlier test
        50000926, // CAP from earlier test
        50000381, // fUSDCx from earlier test
        1, // Common first asset
        100, // VAR from earlier test
      ];

      console.log("\n🔍 Testing specific asset metadata:");
      for (const assetId of testAssetIds) {
        const metadata = await api.query.assets.metadata(assetId);
        const metadataJson = metadata.toJSON() as any;

        if (metadataJson) {
          const symbol = decodeHexToText(metadataJson.symbol);
          const name = decodeHexToText(metadataJson.name);
          console.log(
            `   ${assetId}: "${symbol}" ("${name}") - ${metadataJson.decimals} decimals`,
          );
        } else {
          console.log(`   ${assetId}: No metadata found`);
        }
      }
    }

    await api.disconnect();
    console.log("\n🔗 Substrate API disconnected");
    return true;
  } catch (error) {
    console.error("❌ WebSocket test failed:", error);
    return false;
  }
}

/**
 * Main test function
 */
async function main() {
  console.log("🚀 Starting asset scan debug test...");
  console.log(`🔗 Using RPC: ${CONFIG.rpcEndpoint}`);
  console.log(`🔗 Using WS: ${CONFIG.wsEndpoint}`);

  try {
    // Create provider and contract
    const provider = new ethers.JsonRpcProvider(CONFIG.rpcEndpoint);
    const contract = new ethers.Contract(
      CONFIG.shieldAddress,
      SHIELD_ABI,
      provider,
    );

    console.log(`📝 Contract address: ${CONFIG.shieldAddress}`);

    // Test contract code
    try {
      const code = await provider.getCode(CONFIG.shieldAddress);
      console.log(
        `📄 Contract code: ${code ? `${code.slice(0, 50)}...` : "NO CODE"}`,
      );
      if (code === "0x" || code === "0x0" || code === "0x00") {
        console.error(
          "❌ No contract code at address! Contract doesn't exist!",
        );
      }
    } catch (codeError) {
      console.warn("⚠️ Could not check contract code:", codeError);
    }

    // Test native asset
    const hasNative = await testNativeAsset(provider, contract);

    // Test specific assets that should have balance
    const testAssets = [
      { assetId: 50000867, decimals: 18 }, // PSILV
      { assetId: 50000926, decimals: 18 }, // CAP
      { assetId: 50000381, decimals: 6 }, // fUSDCx
      { assetId: 1, decimals: 18 },
      { assetId: 100, decimals: 10 }, // VAR
    ];

    console.log("\n🧪 Testing specific asset balances...");
    const results = [];
    for (const asset of testAssets) {
      const result = await testSpecificAsset(
        provider,
        contract,
        asset.assetId,
        asset.decimals,
      );
      if (result) results.push(result);
    }

    console.log(
      `\n📊 Summary: Found ${results.length} assets with balance out of ${testAssets.length} tested`,
    );
    if (results.length > 0) {
      console.log("✅ Assets with balance:");
      results.forEach((r) => console.log(`   ${r.assetId}: ${r.amount}`));
    }

    // Test WebSocket connection
    console.log("\n🌐 Testing WebSocket asset discovery...");
    const wsSuccess = await testWebSocketAssets();

    if (!wsSuccess) {
      console.log("\n⚠️ WebSocket test failed. Possible issues:");
      console.log("   1. WebSocket endpoint unreachable");
      console.log("   2. CORS/network issues");
      console.log("   3. Assets pallet not available on this chain");
    }

    console.log("\n✅ Debug test completed");
  } catch (error) {
    console.error("❌ Main test error:", error);
    process.exit(1);
  }
}

// Run the test
main().catch(console.error);
