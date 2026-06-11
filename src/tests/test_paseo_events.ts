/*
 * Copyright 2025 Kusama Shield Developers on behalf of the Kusama DAO, see LICENSE in main folder.
 *
 * Test script to query Paseo V5 contract events directly
 */

import { ethers } from "ethers";

async function testEventQuery() {
  console.log("=== Testing Paseo V5 Event Query ===\n");

  const contractAddress = "0x2fa0fe7f83f1a2D82fcaB4046bB5eA1364Bf1A6A";
  const rpcUrl = "https://kusama-rpc.laissez-faire.trade/";
  const provider = new ethers.JsonRpcProvider(rpcUrl);

  // Get current block
  const currentBlock = await provider.getBlockNumber();
  console.log(`Current block: ${currentBlock}`);

  // Define event topics (from V5 contract)
  const depositTopic = ethers.id("Deposit(address,bytes32,uint256)");
  const withdrawalTopic = ethers.id("Withdrawal(address,uint256,address)");
  const newCommitmentTopic = ethers.id("NewCommitment(bytes32)");

  console.log(`\nTopics:`);
  console.log(`  Deposit: ${depositTopic}`);
  console.log(`  Withdrawal: ${withdrawalTopic}`);
  console.log(`  NewCommitment: ${newCommitmentTopic}`);

  // Try querying from block 0
  console.log(`\nQuerying all events from block 0 to ${currentBlock}...`);

  try {
    const allLogs = await provider.getLogs({
      address: contractAddress,
      fromBlock: 0,
      toBlock: currentBlock,
      topics: [[depositTopic, withdrawalTopic, newCommitmentTopic]],
    });

    console.log(`\nFound ${allLogs.length} total events`);

    // Count by event type
    const depositLogs = allLogs.filter((log) => log.topics[0] === depositTopic);
    const withdrawalLogs = allLogs.filter(
      (log) => log.topics[0] === withdrawalTopic,
    );
    const newCommitmentLogs = allLogs.filter(
      (log) => log.topics[0] === newCommitmentTopic,
    );

    console.log(`\nBreakdown:`);
    console.log(`  Deposit events: ${depositLogs.length}`);
    console.log(`  Withdrawal events: ${withdrawalLogs.length}`);
    console.log(`  NewCommitment events: ${newCommitmentLogs.length}`);

    // Check for the specific deposit from logs
    if (depositLogs.length > 0) {
      console.log(`\nSample Deposit event (first):`);
      const firstDeposit = depositLogs[0];
      console.log(`  Block: ${firstDeposit.blockNumber}`);
      console.log(`  Tx: ${firstDeposit.transactionHash}`);
      console.log(`  Data: ${firstDeposit.data}`);

      // Try to decode
      try {
        const ifaceDeposit = new ethers.Interface([
          "event Deposit(address indexed asset, bytes32 commitment, uint256 nullifierHash)",
        ]);
        const decoded = ifaceDeposit.decodeEventLog(
          "Deposit",
          firstDeposit.data,
          firstDeposit.topics,
        );
        console.log(`  Decoded commitment: ${decoded[1]}`);
      } catch (e) {
        console.log(`  Could not decode: ${e.message}`);
      }
    }

    // Get contract tree size for comparison
    console.log(`\nQuerying contract state...`);
    const abi = [
      "function treeSize() external view returns (uint256)",
      "function currentRoot() external view returns (uint256)",
    ];
    const contract = new ethers.Contract(contractAddress, abi, provider);
    const treeSize = await contract.treeSize();
    const currentRoot = await contract.currentRoot();

    console.log(`Contract tree size: ${treeSize}`);
    console.log(`Contract current root: ${currentRoot}`);

    // Calculate expected leaves
    // For V5: leaves = Deposit events + NewCommitment events
    const expectedLeavesV5 = depositLogs.length + newCommitmentLogs.length;
    console.log(
      `\nV5 calculation: Deposit(${depositLogs.length}) + NewCommitment(${newCommitmentLogs.length}) = ${expectedLeavesV5} leaves`,
    );
    console.log(
      `Matches contract size (${treeSize})? ${expectedLeavesV5 === Number(treeSize)}`,
    );
  } catch (error: any) {
    console.error("Error querying logs:", error.message);

    // Try with smaller range
    console.log(`\nTrying smaller block range (last 1000 blocks)...`);
    try {
      const recentLogs = await provider.getLogs({
        address: contractAddress,
        fromBlock: currentBlock - 1000,
        toBlock: currentBlock,
        topics: [[depositTopic, withdrawalTopic, newCommitmentTopic]],
      });
      console.log(`Found ${recentLogs.length} events in last 1000 blocks`);
    } catch (rangeError) {
      console.error("Even small range failed:", rangeError.message);
    }
  }
}

testEventQuery();
