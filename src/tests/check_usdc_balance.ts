// Copyright 2025 Kusama Shield Developers on behalf of the Kusama DAO, see LICENSE in main folder.
// Test script: Check ETH and USDC balances on Base mainnet via RPC

const TEST_ADDRESS = "";
const BASE_RPC_URL = "https://mainnet.base.org";
const USDC_CONTRACT = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

async function checkBalances() {
  console.log(`🔍 Checking balances for ${TEST_ADDRESS} on Base mainnet\n`);
  console.log(`RPC: ${BASE_RPC_URL}\n`);

  // 1. Check ETH balance
  console.log("1️⃣  Fetching ETH balance...");
  try {
    const ethResponse = await fetch(BASE_RPC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "eth_getBalance",
        params: [TEST_ADDRESS, "latest"],
        id: 1,
      }),
    });

    const ethResult = await ethResponse.json();
    if (ethResult.error) {
      console.error("ETH RPC Error:", ethResult.error);
    } else if (ethResult.result) {
      const ethWei = BigInt(ethResult.result);
      const ethEther = Number(ethWei) / 1e18;
      console.log(`   ✅ ETH Balance: ${ethWei.toString()} wei`);
      console.log(`   💰 ${ethEther.toFixed(6)} ETH\n`);
    }
  } catch (err: any) {
    console.error("   ❌ ETH fetch failed:", err.message);
  }

  // 2. Check USDC balance
  console.log("2️⃣  Fetching USDC balance...");
  try {
    const balanceOfSig = "0x70a08231"; // balanceOf(address) signature
    const paddedAddress = TEST_ADDRESS.slice(2).padStart(64, "0");
    const data = balanceOfSig + paddedAddress;

    const usdcResponse = await fetch(BASE_RPC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "eth_call",
        params: [{ to: USDC_CONTRACT, data }, "latest"],
        id: 1,
      }),
    });

    const usdcResult = await usdcResponse.json();
    if (usdcResult.error) {
      console.error("USDC RPC Error:", usdcResult.error);
    } else if (usdcResult.result) {
      const usdcWei = BigInt(usdcResult.result);
      const usdcHuman = Number(usdcWei) / 1e6;
      console.log(`   ✅ USDC Balance: ${usdcWei.toString()} (6 decimals)`);
      console.log(`   💰 ${usdcHuman.toFixed(6)} USDC\n`);
    } else {
      console.log("   ⚠️  No USDC balance returned (possibly zero)");
    }
  } catch (err: any) {
    console.error("   ❌ USDC fetch failed:", err.message);
  }

  console.log("✅ Balance check complete");
}

checkBalances().catch(console.error);
