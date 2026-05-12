/*
 * Copyright 2025 Kusama Shield Developers on behalf of the Kusama DAO, see LICENSE in main folder.
 *
 * Test script to get asset metadata from Substrate assets pallet
 * Query assets.metadata(assetId) to get name, symbol, decimals
 */

import { ApiPromise, WsProvider } from "@polkadot/api";

// Network configuration
const CONFIG = {
  name: "Paseo AssetHub v3",
  wsEndpoint: "wss://asset-hub-paseo-rpc.n.dwellir.com",
};

/**
 * Decode hex string to UTF-8 text
 */
function decodeHexToText(hexString: string): string {
  if (!hexString || !hexString.startsWith("0x")) return hexString;

  try {
    const hex = hexString.slice(2);
    let result = "";
    for (let i = 0; i < hex.length; i += 2) {
      const byte = parseInt(hex.substr(i, 2), 16);
      if (byte >= 32 && byte <= 126) {
        // Printable ASCII range
        result += String.fromCharCode(byte);
      }
    }
    return result.trim() || hexString;
  } catch {
    return hexString;
  }
}

/**
 * Get metadata for a specific asset ID
 */
async function getAssetMetadata(api: ApiPromise, assetId: number) {
  try {
    console.log(`\n🔍 Querying metadata for asset ${assetId}...`);

    // Method 1: Query assets.metadata storage
    const metadata = await api.query.assets.metadata(assetId);
    const metadataJson = metadata.toJSON() as any;

    console.log(`📋 Raw metadata for asset ${assetId}:`, metadataJson);

    if (metadataJson) {
      const name = decodeHexToText(metadataJson.name);
      const symbol = decodeHexToText(metadataJson.symbol);
      const decimals = metadataJson.decimals || 18;

      console.log(`✅ Asset ${assetId}:`);
      console.log(`   Name: "${name}" (hex: ${metadataJson.name})`);
      console.log(`   Symbol: "${symbol}" (hex: ${metadataJson.symbol})`);
      console.log(`   Decimals: ${decimals}`);
      console.log(`   Deposit: ${metadataJson.deposit}`);
      console.log(`   Frozen: ${metadataJson.isFrozen}`);

      return { assetId, name, symbol, decimals, metadataJson };
    } else {
      console.log(`❌ No metadata found for asset ${assetId}`);
      return null;
    }
  } catch (error) {
    console.error(`❌ Error querying metadata for asset ${assetId}:`, error);
    return null;
  }
}

/**
 * Test with specific asset IDs
 */
async function main() {
  console.log("🚀 Starting asset metadata test...");
  console.log(`🔗 Connecting to ${CONFIG.name} at ${CONFIG.wsEndpoint}`);

  try {
    const provider = new WsProvider(CONFIG.wsEndpoint);
    const api = await ApiPromise.create({ provider });

    console.log("✅ Substrate API connected");

    // Test with some known asset IDs
    const testAssetIds = [
      0, // Native asset (may or may not be in assets pallet)
      1, // Common first asset ID
      50000867, // From your example
      50000926, // From your example
      50000381, // From progress output
    ];

    for (const assetId of testAssetIds) {
      await getAssetMetadata(api, assetId);
    }

    // Also test getting ALL assets metadata
    console.log("\n📊 Querying ALL assets metadata...");
    const allMetadata = await api.query.assets.metadata.entries();
    console.log(`📈 Found ${allMetadata.length} assets with metadata`);

    // Show first 5 assets
    for (let i = 0; i < Math.min(5, allMetadata.length); i++) {
      const [key, value] = allMetadata[i];
      const assetId = (key.args[0] as any).toNumber();
      const metadata = value.toJSON() as any;

      if (metadata) {
        const name = decodeHexToText(metadata.name);
        const symbol = decodeHexToText(metadata.symbol);
        console.log(
          `   ${assetId}: "${symbol}" ("${name}") - ${metadata.decimals} decimals`,
        );
      }
    }

    await api.disconnect();
    console.log("\n✅ Test completed");
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  }
}

// Run the test
main().catch(console.error);
