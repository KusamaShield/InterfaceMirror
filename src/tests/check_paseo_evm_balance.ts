/* Copyright 2025 Kusama Shield Developers. All rights reserved.
SPDX-License-Identifier: MIT */

import { ethers } from "ethers";

const WALLET_ADDRESS = "0x0831176A3220AF47D4D055d53EE1AaCc16040D8B";
const PASEO_EVM_RPC = "https://eth-asset-hub-paseo.dotters.network";

async function checkEvmBalance() {
  console.log("Checking EVM balance for wallet:", WALLET_ADDRESS);
  console.log("Using Paseo EVM RPC:", PASEO_EVM_RPC);

  try {
    const provider = new ethers.JsonRpcProvider(PASEO_EVM_RPC);

    // Get balance
    const balanceWei = await provider.getBalance(WALLET_ADDRESS);
    console.log("Balance (wei):", balanceWei.toString());
    console.log("Balance (PAS):", ethers.formatEther(balanceWei));

    // Verify against your cast output
    const expectedWei = "8893534352318100000000";
    const expectedPas = ethers.formatEther(expectedWei);
    console.log("\nExpected from cast:");
    console.log("Balance (wei):", expectedWei);
    console.log("Balance (PAS):", expectedPas);

    if (balanceWei.toString() === expectedWei) {
      console.log("✅ Balance matches cast output!");
    } else {
      console.log("❌ Balance does NOT match cast output");
      console.log(
        "Difference:",
        BigInt(balanceWei.toString()) - BigInt(expectedWei),
        "wei",
      );
    }
  } catch (error) {
    console.error("Error:", error);
  }
}

checkEvmBalance().catch(console.error);
