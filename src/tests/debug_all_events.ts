/*
 * Copyright 2025 Kusama Shield Developers on behalf of the Kusama DAO, see LICENSE in main folder.
 *
 * Debug script to find ALL events from Paseo V5 contract
 */

import { ethers } from "ethers";

async function findAllEvents() {
  console.log("=== Finding ALL Paseo V5 Events ===\n");

  const contractAddress = "0x2fa0fe7f83f1a2D82fcaB4046bB5eA1364Bf1A6A";
  const rpcUrl = "https://kusama-rpc.laissez-faire.trade/";
  const provider = new ethers.JsonRpcProvider(rpcUrl);

  // Get current block
  const currentBlock = await provider.getBlockNumber();
  console.log(`Current block: ${currentBlock}`);

  // Get ALL logs from this contract (no topic filter)
  console.log(`\nQuerying ALL logs from contract...`);

  try {
    const allLogs = await provider.getLogs({
      address: contractAddress,
      fromBlock: 0,
      toBlock: currentBlock,
    });

    console.log(`Found ${allLogs.length} total logs`);

    // Group by topic[0]
    const topics = new Map();
    for (const log of allLogs) {
      const topic0 = log.topics[0];
      const count = topics.get(topic0) || 0;
      topics.set(topic0, count + 1);
    }

    console.log(`\nUnique event signatures: ${topics.size}`);

    // Try to identify each topic
    const knownTopics = {
      // V5 events from test script
      "Deposit(address,bytes32,uint256)": ethers.id(
        "Deposit(address,bytes32,uint256)",
      ),
      "NewCommitment(bytes32)": ethers.id("NewCommitment(bytes32)"),
      "Withdrawal(address,uint256,address,uint256)": ethers.id(
        "Withdrawal(address,uint256,address,uint256)",
      ),
      // Old events
      "Deposit(address,bytes32,uint256) old":
        "0x19dacbf83c5de6658e14cbf7bcae5c15eca2eedecf1c66fbca928e4d351bea0f", // What we were using
      "Withdrawal(address,uint256,address) old":
        "0x001a143d5b175701cb3246058ffac3d63945192075a926ff73a19930f09d587a", // What we were using
    };

    console.log("\nTopic breakdown:");
    for (const [topic0, count] of topics.entries()) {
      let name = "unknown";
      for (const [knownName, knownHash] of Object.entries(knownTopics)) {
        if (topic0 === knownHash) {
          name = knownName;
          break;
        }
      }
      console.log(`  ${topic0}: ${count} events (${name})`);
    }

    // Show sample of each event type
    console.log("\nSample events:");
    for (const [topic0, count] of topics.entries()) {
      const sampleLog = allLogs.find((log) => log.topics[0] === topic0);
      if (sampleLog) {
        console.log(`\nTopic ${topic0}:`);
        console.log(`  Block: ${sampleLog.blockNumber}`);
        console.log(`  Data length: ${sampleLog.data.length} chars`);
        console.log(
          `  Data (first 100 chars): ${sampleLog.data.substring(0, 100)}...`,
        );
        console.log(`  Topics: ${sampleLog.topics.length}`);
      }
    }
  } catch (error: any) {
    console.error("Error querying logs:", error.message);

    // Try with smaller range
    console.log(`\nTrying smaller block ranges...`);
    const ranges = [
      [currentBlock - 10000, currentBlock],
      [currentBlock - 50000, currentBlock],
      [0, 50000],
      [50000, 100000],
    ];

    for (const [from, to] of ranges) {
      try {
        const logs = await provider.getLogs({
          address: contractAddress,
          fromBlock: from,
          toBlock: to,
        });
        console.log(`Blocks ${from}-${to}: ${logs.length} logs`);
      } catch (e) {
        console.log(`Blocks ${from}-${to}: failed (${e.message})`);
      }
    }
  }
}

findAllEvents();
