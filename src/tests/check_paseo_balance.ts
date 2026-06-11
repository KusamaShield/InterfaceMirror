/* Copyright 2025 Kusama Shield Developers. All rights reserved.
SPDX-License-Identifier: MIT */

import { ApiPromise, WsProvider } from "@polkadot/api";
import { ethers } from "ethers";
import {
  decodeAddress,
  encodeAddress,
  evmToAddress,
} from "@polkadot/util-crypto";

const WALLET_ADDRESS = "0x0831176A3220AF47D4D055d53EE1AaCc16040D8B";
const PASEO_RPC = "wss://paseo.rpc.amforc.com";

async function checkBalance() {
  console.log("Checking balance for wallet:", WALLET_ADDRESS);
  console.log("Using Paseo RPC:", PASEO_RPC);

  try {
    // Connect to Paseo
    const provider = new WsProvider(PASEO_RPC);
    const api = await ApiPromise.create({ provider });

    console.log("Connected to Paseo");

    // Convert EVM address to Substrate address for Paseo
    const substrateAddress = evmToAddress(WALLET_ADDRESS, 42); // 42 is the SS58 prefix for Paseo
    console.log("Substrate address:", substrateAddress);

    // Get native balance (PAS)
    const account = await api.query.system.account(substrateAddress);
    const freeBalance = (account as any).data.free.toString();
    const decimals = api.registry.chainDecimals[0] || 12;

    console.log("Raw balance (wei):", freeBalance);

    // Format balance
    const balanceWei = BigInt(freeBalance);
    const balance = Number(balanceWei) / Math.pow(10, decimals);
    console.log(`Native balance: ${balance.toFixed(6)} PAS`);
    console.log(`Decimals: ${decimals}`);

    // Also check via ethers for EVM balance
    console.log("\n--- Checking via EVM interface ---");

    // Create an ethers provider for Paseo EVM
    const evmRpc = "https://paseo.rpc.amforc.com";
    const evmProvider = new ethers.JsonRpcProvider(evmRpc);

    const evmBalance = await evmProvider.getBalance(WALLET_ADDRESS);
    console.log("EVM balance (wei):", evmBalance.toString());
    console.log("EVM balance (PAS):", ethers.formatEther(evmBalance));

    // Check Asset Hub assets
    console.log("\n--- Checking Asset Hub assets ---");

    // Get asset metadata for native asset (1984)
    const assetId = 1984; // Native asset ID for Paseo Asset Hub
    const assetInfo = await api.query.assets.metadata(assetId);
    console.log("Asset metadata:", assetInfo.toHuman());

    // Get asset account balance
    const assetAccount = await api.query.assets.account(
      assetId,
      substrateAddress,
    );
    console.log("Asset account:", assetAccount.toHuman());

    await api.disconnect();
    console.log("\n✅ Balance check complete");
  } catch (error) {
    console.error("Error checking balance:", error);
  }
}

// Run the check
checkBalance().catch(console.error);
