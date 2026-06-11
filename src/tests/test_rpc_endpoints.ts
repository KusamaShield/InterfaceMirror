/* Copyright 2025 Kusama Shield Developers. All rights reserved.
SPDX-License-Identifier: MIT */

import { ethers } from "ethers";

const WALLET_ADDRESS = "0x0831176A3220AF47D4D055d53EE1AaCc16040D8B";

async function testRpcEndpoints() {
  const endpoints = [
    {
      name: "Current Paseo RPC",
      url: "https://kusama-rpc.laissez-faire.trade/",
    },
    { name: "Dotters RPC", url: "https://eth-asset-hub-paseo.dotters.network" },
    {
      name: "Alternative RPC",
      url: "https://paseo-asset-hub-eth-rpc.polkadot.io",
    },
  ];

  for (const endpoint of endpoints) {
    console.log(`\n=== Testing ${endpoint.name}: ${endpoint.url} ===`);
    try {
      const provider = new ethers.JsonRpcProvider(endpoint.url);
      const balance = await provider.getBalance(WALLET_ADDRESS);
      console.log(`✅ Success: ${ethers.formatEther(balance)} PAS`);
    } catch (error: any) {
      console.log(`❌ Failed: ${error.message || error}`);
    }
  }
}

testRpcEndpoints().catch(console.error);
