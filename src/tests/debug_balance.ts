/* Copyright 2025 Kusama Shield Developers. All rights reserved.
SPDX-License-Identifier: MIT */

import { ApiPromise, WsProvider } from "@polkadot/api";
import { evmToAddress } from "@polkadot/util-crypto";

const WALLET_ADDRESS = "0x0831176A3220AF47D4D055d53EE1AaCc16040D8B";
const PASEO_WS = "wss://asset-hub-paseo-rpc.n.dwellir.com";

async function debugBalance() {
  console.log("Debugging balance display for wallet:", WALLET_ADDRESS);
  console.log("Using Paseo WS:", PASEO_WS);

  try {
    // Connect to Paseo (same as app)
    const wsProvider = new WsProvider(PASEO_WS);
    const api = await ApiPromise.create({
      provider: wsProvider,
      noInitWarn: true,
    });

    console.log("Connected to Paseo");

    // Convert EVM address to Substrate address (same as app)
    const substrateAddress = evmToAddress(WALLET_ADDRESS, 42);
    console.log("Substrate address:", substrateAddress);

    // Get native balance (same as app)
    const nativeBalance = await api.query.system.account(substrateAddress);
    const nativeFree = (nativeBalance as any).data.free.toString();

    console.log("\n=== Raw Data ===");
    console.log("Native balance (raw):", nativeFree);

    // Check what decimals the chain uses
    const chainDecimals = api.registry.chainDecimals[0];
    console.log("Chain decimals:", chainDecimals);

    // Check actual balance with correct decimals
    if (nativeFree !== "0") {
      const balanceWei = BigInt(nativeFree);
      const balanceCorrect = Number(balanceWei) / Math.pow(10, chainDecimals);
      console.log(
        `Balance with ${chainDecimals} decimals: ${balanceCorrect} PAS`,
      );

      // Now check with 18 decimals (what app might be using)
      const balanceWrong = Number(balanceWei) / Math.pow(10, 18);
      console.log(`Balance with 18 decimals: ${balanceWrong} PAS`);
      console.log(`Difference: ${balanceCorrect / balanceWrong}x`);

      // Format as app does (toFixed(4))
      console.log(
        `Correct (${chainDecimals} decimals): ${balanceCorrect.toFixed(4)} PAS`,
      );
      console.log(`Wrong (18 decimals): ${balanceWrong.toFixed(4)} PAS`);
    } else {
      console.log("Wallet has 0 native balance on Paseo");
    }

    // Also check the formatBalance function logic
    console.log("\n=== formatBalance function test ===");
    const formatBalance = (asset: { balance: string; decimals: number }) => {
      const balanceWei = BigInt(asset.balance);
      const balance = Number(balanceWei) / Math.pow(10, asset.decimals);
      return balance.toFixed(4);
    };

    // Test with correct decimals (10)
    const correctAsset = { balance: nativeFree, decimals: chainDecimals };
    console.log(
      `formatBalance with ${chainDecimals} decimals:`,
      formatBalance(correctAsset),
      "PAS",
    );

    // Test with wrong decimals (18)
    const wrongAsset = { balance: nativeFree, decimals: 18 };
    console.log(
      `formatBalance with 18 decimals:`,
      formatBalance(wrongAsset),
      "PAS",
    );

    await api.disconnect();
    console.log("\n✅ Debug complete");
  } catch (error) {
    console.error("Error:", error);
  }
}

debugBalance().catch(console.error);
