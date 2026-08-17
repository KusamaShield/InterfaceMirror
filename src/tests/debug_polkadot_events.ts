import { ethers } from "ethers";

const CONTRACT = "0x0D694Da746e73D1e255c1894F90e38170db45809";
const EVM_RPC = "https://polkadot-assethub-rpc.laissez-faire.trade";

async function main() {
  const provider = new ethers.JsonRpcProvider(EVM_RPC);
  const depositTopic = ethers.id("Deposit(address,bytes32)");
  const newCommitmentTopic = ethers.id("NewCommitment(bytes32)");

  const latest = await provider.getBlockNumber();
  console.log("Latest block:", latest);

  // Check root
  try {
    const rootHex = await provider.call({ to: CONTRACT, data: "0xfdab463d" });
    console.log("On-chain root:", BigInt(rootHex).toString().substring(0, 20) + "...");
  } catch (e: any) { console.log("root query failed:", e.message?.slice(0, 80)); }

  // Scan recent blocks for Deposit events
  console.log(`\nScanning recent 5000 blocks for Deposit events...`);
  try {
    const logs = await provider.getLogs({
      address: CONTRACT,
      fromBlock: latest - 5000,
      toBlock: latest,
      topics: [depositTopic],
    });
    console.log(`Found ${logs.length} Deposit events in last 5000 blocks`);
    for (const log of logs) {
      const leaf = BigInt(log.data);
      console.log(`  Blk ${log.blockNumber} idx ${log.index}: 0x${leaf.toString(16).padStart(64, "0")} | ${log.transactionHash}`);
    }
  } catch (e: any) { console.log("Failed:", e.message?.slice(0, 80)); }

  // Try smaller range
  for (let start = latest - 10; start <= latest; start += 5) {
    try {
      const end = Math.min(start + 4, latest);
      const logs = await provider.getLogs({
        address: CONTRACT,
        fromBlock: start,
        toBlock: end,
        topics: [depositTopic],
      });
      if (logs.length > 0) {
        for (const log of logs) {
          const leaf = BigInt(log.data);
          console.log(`  Blk ${log.blockNumber} idx ${log.index}: 0x${leaf.toString(16).padStart(64, "0")} | ${log.transactionHash}`);
        }
      }
    } catch (e: any) { /* skip */ }
  }

  // Check if our commitment is in any found log
  const ourCommitment = BigInt("0x00180ec2cbe4d42c2d801e623d78e59f5cda017bcbc8357bc0eb81faf8d1b8f2");
  console.log(`\nLooking for commitment: 0x${ourCommitment.toString(16).padStart(64, "0")}`);

  // Try direct tx query
  console.log("\nChecking deposit tx receipt...");
  const receipt = await provider.getTransactionReceipt("0x000bb85e4750f85d7b167b8fd57125873eedc62b1edc1e11d837e91a8e4a2e97");
  if (receipt) {
    console.log("Tx block:", receipt.blockNumber);
    console.log("Logs count:", receipt.logs.length);
    for (const log of receipt.logs) {
      console.log(`  Topic0: ${log.topics[0]}`);
      console.log(`  Data: ${log.data}`);
      if (log.topics[0] === depositTopic) {
        const leaf = BigInt(log.data);
        console.log(`  >>> THIS IS OUR DEPOSIT! Leaf: 0x${leaf.toString(16).padStart(64, "0")}`);
      }
    }
  } else {
    console.log("Receipt not found for tx");
  }

  process.exit(0);
}
main().catch(e => { console.error("Fatal:", e); process.exit(1); });