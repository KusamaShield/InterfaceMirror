/*
 * Copyright 2025 Kusama Shield Developers on behalf of the Kusama DAO, see LICENSE in main folder.
 *
 * Verify Polkadot shield contract existence
 * Run with: npx tsx src/tests/verify_polkadot_contract.ts
 */

import { ethers } from "ethers";

async function verifyPolkadotContract() {
  console.log("🔍 Verifying Polkadot shield contract...");

  const config = {
    rpcEndpoint: "https://eth-rpc.polkadot.io/",
    shieldAddress: "0xe55B85441Bc39532f279Cf24059f02DFbcf87051",
    chainId: 420420419,
  };

  console.log("📋 Configuration:");
  console.log(`   RPC: ${config.rpcEndpoint}`);
  console.log(`   Address: ${config.shieldAddress}`);
  console.log(`   Chain ID: ${config.chainId}`);

  try {
    const provider = new ethers.JsonRpcProvider(config.rpcEndpoint);

    // 1. Check network
    console.log("\n🌐 Checking network...");
    const network = await provider.getNetwork();
    console.log(`   Network: ${network.name} (Chain ID: ${network.chainId})`);

    // 2. Check contract code
    console.log("\n📄 Checking contract code...");
    const code = await provider.getCode(config.shieldAddress);
    console.log(`   Code: ${code ? `${code.slice(0, 50)}...` : "EMPTY"}`);
    console.log(`   Code length: ${code.length}`);
    console.log(
      `   Has code: ${code !== "0x" && code !== "0x0" && code !== "0x00"}`,
    );

    if (code === "0x" || code === "0x0" || code === "0x00") {
      console.error("\n❌ NO CONTRACT CODE AT ADDRESS!");
      console.error("   The shield contract does not exist on Polkadot.");

      // 3. Suggest alternatives
      console.log("\n🔍 Searching for alternative contracts...");
      const testAddresses = [
        "0x3099889C1538f0200B831181cbfb532a4e9A418F", // Paseo v3
        "0xb3A95dc1c03282D5AC9Fd786f183c0AeF221EdA2", // Paseo v2
        "0x0000000000000000000000000000000000000000", // Zero address
      ];

      for (const addr of testAddresses) {
        const testCode = await provider.getCode(addr);
        if (testCode !== "0x" && testCode !== "0x0" && testCode !== "0x00") {
          console.log(`   ✅ ${addr}: HAS CODE (${testCode.length} chars)`);
        }
      }
    } else {
      console.log("\n✅ Contract exists!");

      // 4. Test contract methods
      console.log("\n🧪 Testing contract methods...");
      const abi = [
        "function escrow(address) external view returns (uint256)",
        "function currentRoot() external view returns (uint256)",
        "function treeSize() external view returns (uint256)",
      ];

      const contract = new ethers.Contract(config.shieldAddress, abi, provider);

      try {
        const nativeBalance = await contract.escrow(ethers.ZeroAddress);
        console.log(`   Native balance: ${nativeBalance.toString()}`);
      } catch (err) {
        console.error(`   ❌ escrow() failed: ${err.message?.slice(0, 100)}`);
      }

      try {
        const root = await contract.currentRoot();
        console.log(`   Current root: ${root.toString()}`);
      } catch (err) {
        console.error(
          `   ❌ currentRoot() failed: ${err.message?.slice(0, 100)}`,
        );
      }

      try {
        const treeSize = await contract.treeSize();
        console.log(`   Tree size: ${treeSize.toString()}`);
      } catch (err) {
        console.error(`   ❌ treeSize() failed: ${err.message?.slice(0, 100)}`);
      }
    }

    // 5. Check block explorer
    console.log("\n🔗 Block explorer links:");
    console.log(
      `   Blockscout: https://blockscout.polkadot.io/address/${config.shieldAddress}`,
    );
    console.log(
      `   Subscan: https://polkadot.assethub.subscan.io/account/${config.shieldAddress}`,
    );
  } catch (error) {
    console.error("❌ Verification failed:", error);
  }
}

verifyPolkadotContract().catch(console.error);
