/*
 * Copyright 2025 Kusama Shield Developers on behalf of the Kusama DAO, see LICENSE in main folder.
 *
 * Test Polkadot AssetHub connection and asset discovery with updated endpoint
 * Run with: npx tsx src/tests/test_polkadot_connection.ts
 */

import { ApiPromise, WsProvider } from "@polkadot/api";
import { Buffer } from "buffer";

async function testPolkadotConnection() {
  console.log("🔗 Testing Polkadot AssetHub connection...");

  const endpoints = [
    "wss://polkadot-asset-hub-rpc.polkadot.io",
    "wss://assethub-polkadot-rpc.dwellir.com",
    "wss://rpc.assethub-polkadot.luckyfriday.io",
  ];

  for (const endpoint of endpoints) {
    console.log(`\n📡 Testing endpoint: ${endpoint}`);

    try {
      const wsProvider = new WsProvider(endpoint);
      const api = await ApiPromise.create({
        provider: wsProvider,
        noInitWarn: true,
      });

      console.log("   Connecting...");
      await api.isReady;

      // Get chain info
      const chain = await api.rpc.system.chain();
      const version = await api.rpc.system.version();
      const properties = await api.rpc.system.properties();

      console.log(`   ✅ Connected to: ${chain.toString()}`);
      console.log(`   Version: ${version.toString()}`);
      console.log(`   Properties: ${JSON.stringify(properties.toJSON())}`);

      // Check for assets pallet
      console.log("\n   📊 Checking for assets pallet...");
      console.log(
        `   assets.metadata available: ${"assets" in api.query && "metadata" in api.query.assets ? "✅ YES" : "❌ NO"}`,
      );

      if (api.query.assets && api.query.assets.metadata) {
        console.log("   Querying asset metadata...");
        const start = Date.now();

        try {
          const metadata = await api.query.assets.metadata.entries();
          console.log(
            `   ✅ Found ${metadata.length} assets with metadata (${Date.now() - start}ms)`,
          );

          if (metadata.length > 0) {
            console.log("\n   📋 Sample assets:");
            for (let i = 0; i < Math.min(5, metadata.length); i++) {
              const [key, value] = metadata[i];
              const assetId = (key.args[0] as any).toNumber();
              const meta = value.toJSON() as any;

              if (meta) {
                let symbol = "0x";
                let name = "0x";

                if (meta.symbol) {
                  try {
                    const hex = meta.symbol.slice(2);
                    symbol = Buffer.from(hex, "hex")
                      .toString("utf8")
                      .replace(/\0/g, "")
                      .trim();
                  } catch {}
                }

                if (meta.name) {
                  try {
                    const hex = meta.name.slice(2);
                    name = Buffer.from(hex, "hex")
                      .toString("utf8")
                      .replace(/\0/g, "")
                      .trim();
                  } catch {}
                }

                console.log(
                  `      ${assetId}: "${symbol}" ("${name}") - ${meta.decimals || 18} decimals`,
                );
              }
            }
          }
        } catch (queryError) {
          console.error(`   ❌ Metadata query failed: ${queryError.message}`);
        }
      }

      // Check for account
      console.log("\n   👛 Checking shield contract account...");
      const shieldAddress = "0xe55B85441Bc39532f279Cf24059f02DFbcf87051";

      try {
        const accountInfo = await api.query.system.account(shieldAddress);
        console.log(`   ✅ Account exists: ${accountInfo ? "YES" : "NO"}`);

        if (accountInfo) {
          const info = accountInfo.toJSON() as any;
          console.log(`   Balance: ${info?.data?.free || "unknown"}`);
        }
      } catch (accountError) {
        console.error(`   ❌ Account query failed: ${accountError.message}`);
      }

      await api.disconnect();
      console.log("   🔗 Disconnected");

      // If this endpoint works, use it
      return endpoint;
    } catch (error) {
      console.error(`   ❌ Connection failed: ${error.message?.slice(0, 100)}`);
    }
  }

  console.error("\n❌ All endpoints failed!");
  return null;
}

async function testRpcEndpoint() {
  console.log("\n🌐 Testing RPC endpoint...");

  const rpcUrl = "https://eth-rpc.polkadot.io/";

  try {
    const response = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_getCode",
        params: ["0xe55B85441Bc39532f279Cf24059f02DFbcf87051", "latest"],
      }),
    });

    if (response.ok) {
      const data = await response.json();
      const code = data.result;
      console.log(
        `✅ RPC works, contract code: ${code ? `${code.slice(0, 20)}...` : "EMPTY"}`,
      );
      return true;
    } else {
      console.error(`❌ RPC error: ${response.status}`);
      return false;
    }
  } catch (error) {
    console.error(`❌ RPC failed: ${error.message}`);
    return false;
  }
}

async function main() {
  console.log("🚀 Polkadot AssetHub Connection Test");

  // Test WebSocket
  const workingEndpoint = await testPolkadotConnection();

  // Test RPC
  await testRpcEndpoint();

  if (workingEndpoint) {
    console.log(`\n🎉 Recommended WebSocket endpoint: ${workingEndpoint}`);
    console.log("💡 Update App.tsx with this endpoint for Polkadot network.");
  } else {
    console.error("\n⚠️ No working WebSocket endpoint found!");
    console.log(
      "💡 Consider using a different provider or checking network connectivity.",
    );
  }
}

main().catch(console.error);
