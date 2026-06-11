/*
 * Copyright 2025 Kusama Shield Developers on behalf of the Kusama DAO, see LICENSE in main folder.
 *
 * Test Dotters RPC for events
 */

import { ethers } from "ethers";

async function testDottersRPC() {
  console.log("=== Testing Dotters RPC ===\n");

  const contractAddress = "0x2fa0fe7f83f1a2D82fcaB4046bB5eA1364Bf1A6A";
  const rpcUrl = "https://eth-asset-hub-paseo.dotters.network";
  const provider = new ethers.JsonRpcProvider(rpcUrl);

  // V5 event topics
  const depositTopic = ethers.id("Deposit(address,bytes32,uint256)");
  const newCommitmentTopic = ethers.id("NewCommitment(bytes32)");
  const withdrawalTopicV5 = ethers.id(
    "Withdrawal(address,uint256,address,uint256)",
  );

  console.log("Querying events from Dotters RPC...");

  try {
    const currentBlock = await provider.getBlockNumber();
    console.log(`Current block: ${currentBlock}`);

    // Query all V5 events
    const logs = await provider.getLogs({
      address: contractAddress,
      fromBlock: 0,
      toBlock: currentBlock,
      topics: [[depositTopic, newCommitmentTopic, withdrawalTopicV5]],
    });

    console.log(`Found ${logs.length} total events`);

    // Breakdown
    const depositLogs = logs.filter((log) => log.topics[0] === depositTopic);
    const newCommitmentLogs = logs.filter(
      (log) => log.topics[0] === newCommitmentTopic,
    );
    const withdrawalLogs = logs.filter(
      (log) => log.topics[0] === withdrawalTopicV5,
    );

    console.log(`\nBreakdown:`);
    console.log(`  Deposit events: ${depositLogs.length}`);
    console.log(`  NewCommitment events: ${newCommitmentLogs.length}`);
    console.log(`  Withdrawal (V5) events: ${withdrawalLogs.length}`);

    // Check contract state
    const abi = [
      "function treeSize() external view returns (uint256)",
      "function currentRoot() external view returns (uint256)",
    ];
    const contract = new ethers.Contract(contractAddress, abi, provider);
    const treeSize = await contract.treeSize();
    const currentRoot = await contract.currentRoot();

    console.log(`\nContract state:`);
    console.log(`  treeSize(): ${treeSize}`);
    console.log(`  currentRoot(): ${currentRoot}`);

    // V5 calculation
    const v5Leaves = depositLogs.length + newCommitmentLogs.length;
    console.log(`\nV5 leaves (Deposit + NewCommitment): ${v5Leaves}`);
    console.log(`Matches contract size? ${v5Leaves === Number(treeSize)}`);

    if (v5Leaves !== Number(treeSize)) {
      console.log(
        `\nDISCREPANCY: Contract has ${treeSize} leaves but we found ${v5Leaves} events`,
      );
      console.log(`Difference: ${Number(treeSize) - v5Leaves} leaves missing`);
    }
  } catch (error: any) {
    console.error("Error:", error.message);
  }
}

testDottersRPC();
