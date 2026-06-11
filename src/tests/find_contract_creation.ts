/*
 * Copyright 2025 Kusama Shield Developers on behalf of the Kusama DAO, see LICENSE in main folder.
 *
 * Find contract creation block
 */

import { ethers } from "ethers";

async function findContractCreation() {
  console.log("=== Finding Contract Creation ===\n");

  const contractAddress = "0x2fa0fe7f83f1a2D82fcaB4046bB5eA1364Bf1A6A";
  const rpcUrl = "https://kusama-rpc.laissez-faire.trade/";
  const provider = new ethers.JsonRpcProvider(rpcUrl);

  // Try to get contract creation transaction
  console.log("Getting contract code...");
  const code = await provider.getCode(contractAddress);
  console.log(`Code length: ${code.length}`);
  console.log(`Has code: ${code !== "0x"}`);

  // Get transaction count - if 0, might be created by CREATE2
  const txCount = await provider.getTransactionCount(contractAddress);
  console.log(`Transaction count at address: ${txCount}`);

  // Try to find the creation transaction by checking recent blocks
  console.log("\nSearching for creation block (last 50,000 blocks)...");
  const currentBlock = await provider.getBlockNumber();
  const startBlock = Math.max(0, currentBlock - 50000);

  // Look for the first transaction to this contract
  let creationBlock = null;
  for (let blockNum = startBlock; blockNum <= currentBlock; blockNum++) {
    if (blockNum % 5000 === 0) {
      console.log(`  Checking block ${blockNum}...`);
    }

    try {
      const block = await provider.getBlock(blockNum, true);
      if (block && block.transactions) {
        for (const tx of block.transactions) {
          if (tx.to === null && tx.creates === contractAddress) {
            creationBlock = blockNum;
            console.log(`Found creation in block ${blockNum}`);
            console.log(`  Tx: ${tx.hash}`);
            break;
          }
        }
      }
      if (creationBlock) break;
    } catch (e) {
      // Skip errored blocks
    }
  }

  if (creationBlock) {
    console.log(`\nContract created at block: ${creationBlock}`);

    // Now query events from creation block
    const depositTopic = ethers.id("Deposit(address,bytes32,uint256)");
    const newCommitmentTopic = ethers.id("NewCommitment(bytes32)");

    const logs = await provider.getLogs({
      address: contractAddress,
      fromBlock: creationBlock,
      toBlock: currentBlock,
      topics: [[depositTopic, newCommitmentTopic]],
    });

    console.log(`Events from creation: ${logs.length}`);
  } else {
    console.log(`Could not find creation block in last 50,000 blocks`);
    console.log(`Contract might be created via CREATE2 or older`);
  }
}

findContractCreation();
