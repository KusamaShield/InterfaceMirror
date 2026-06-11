/*
 * Copyright 2025 Kusama Shield Developers on behalf of the Kusama DAO, see LICENSE in main folder.
 *
 * Test to check Paseo V5 contract state directly
 */

import { ethers } from "ethers";

async function testContractState() {
  console.log("=== Testing Paseo V5 Contract State ===\n");

  const contractAddress = "0x2fa0fe7f83f1a2D82fcaB4046bB5eA1364Bf1A6A";
  const rpcUrl = "https://kusama-rpc.laissez-faire.trade/";
  const provider = new ethers.JsonRpcProvider(rpcUrl);

  // V5 ABI fragments
  const abi = [
    // View functions
    "function treeSize() external view returns (uint256)",
    "function currentRoot() external view returns (uint256)",
    "function escrow(address) external view returns (uint256)",
    "function isDepositSpent(bytes32) external view returns (bool)",

    // Try to get some deposit info
    "function deposits(bytes32) external view returns (address asset, uint256 assetId, uint256 amount, bool isSpent)",
  ];

  const contract = new ethers.Contract(contractAddress, abi, provider);

  try {
    console.log("1. Basic contract state:");
    const treeSize = await contract.treeSize();
    const currentRoot = await contract.currentRoot();

    console.log(`   treeSize(): ${treeSize}`);
    console.log(`   currentRoot(): ${currentRoot}`);

    // Check escrow for zero address
    const escrowBalance = await contract.escrow(ethers.ZeroAddress);
    console.log(`   escrow(0x0): ${ethers.formatEther(escrowBalance)} PAS`);

    console.log("\n2. Checking if this is really the V5 contract...");

    // Try to call a V5-specific function
    const v5Abi = [
      "function proxy_withdraw(uint256[2] calldata pA, uint256[2][2] calldata pB, uint256[2] calldata pC, uint[7] calldata pubSignals, address asset, uint256 amount, address recipient) external",
    ];

    const v5Contract = new ethers.Contract(contractAddress, v5Abi, provider);

    // Just check if we can get the function (won't call it)
    console.log(
      `   Has proxy_withdraw function: ${!!v5Contract.proxy_withdraw}`,
    );

    console.log("\n3. Testing deposits mapping...");

    // Try to check if any deposits exist by checking common nullifier hashes
    // We need to create a test nullifier hash
    const testSecret = "test";
    const testNullifier = ethers.toBigInt(
      ethers.keccak256(ethers.toUtf8Bytes(testSecret + "_nullifier")),
    );
    const testNullifierHash = ethers.toBigInt(
      ethers.keccak256(ethers.toBeArray(testNullifier)),
    );

    const nullifierBytes32 = ethers.zeroPadValue(
      ethers.toBeArray(testNullifierHash),
      32,
    );

    try {
      const depositInfo = await contract.deposits(nullifierBytes32);
      console.log(`   Test deposit info:`, depositInfo);
    } catch (e) {
      console.log(`   deposits() call failed (expected): ${e.message}`);
    }

    console.log("\n4. Comparing with expected values from V5 doc...");
    console.log(`   Expected V5 address: ${contractAddress}`);
    console.log(
      `   From V5 doc: tree size should match Deposit + NewCommitment events`,
    );
    console.log(`   But we found: 4 Deposit events, 0 NewCommitment events`);
    console.log(`   Contract says: ${treeSize} leaves`);
    console.log(
      `   Discrepancy: ${Number(treeSize) - 4} leaves unaccounted for`,
    );

    console.log("\n=== Hypothesis ===");
    console.log(
      "1. Contract was upgraded from V4 → V5 and treeSize includes old leaves",
    );
    console.log("2. Events were emitted with different signatures");
    console.log("3. Contract has a different implementation than expected");
    console.log(
      "4. RPC is not returning all events (unlikely since we queried all)",
    );
  } catch (error: any) {
    console.error("Error:", error.message);
  }
}

testContractState();
