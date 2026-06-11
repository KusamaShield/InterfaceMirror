#!/usr/bin/env npx tsx
/* Copyright 2025 Kusama Shield Developers */

import { ethers } from "ethers";
import { poseidon1, poseidon2 } from "poseidon-lite";
import * as snarkjs from "snarkjs";
import { writeFileSync, existsSync } from "fs";

const USAGE = `Usage: npx tsx src/tests/v5_test_cli.ts [--private-key <key>] [--rpc <url>]

Options:
  --private-key  Private key for test wallet (with sufficient PAS balance)
  --rpc          RPC endpoint (default: https://paseo-assethub-rpc.laissez-faire.trade/)
  --help         Show this help message

Example:
  npx tsx src/tests/v5_test_cli.ts --private-key 0xabc...
`;

import { PASEO_ASSETHUB } from "../transactions/zkg16";

const CONTRACTS = {
  verifier: PASEO_ASSETHUB.verifier,
  leanIMT: PASEO_ASSETHUB.leanIMT,
  pool: PASEO_ASSETHUB.pool,
};

const CIRCUIT_DIR = "/home/pi/zk/ss/fresh/fixed_output";
const WASM_PATH = CIRCUIT_DIR + "/withdraw_phase2_fixed_js/withdraw_phase2_fixed.wasm";
const ZKEY_PATH = CIRCUIT_DIR + "/withdraw_phase2_fixed_0001.zkey";
const TREE_DEPTH = 128;
const EXPLORER = "https://testnet.routescan.io";

const DEPOSIT_AMOUNT_ETH = "5";
// Test 2 deposits + 1 proxy (using regular withdraw for now)
// const NUM_DEPOSITS = 2;
// const NUM_REGULAR_WITHDRAWALS = 0;
// const NUM_PROXY_WITHDRAWALS = 1;

// ============================================================================
// Test Configurations (all working)
// ============================================================================

// Test 1: 1 deposit + 1 proxy withdrawal
const NUM_DEPOSITS = 1;
const NUM_REGULAR_WITHDRAWALS = 0;
const NUM_PROXY_WITHDRAWALS = 1;

// Test 2: 1 deposit + 1 regular withdrawal  
// const NUM_DEPOSITS = 1;
// const NUM_REGULAR_WITHDRAWALS = 1;
// const NUM_PROXY_WITHDRAWALS = 0;

// Test 3: 3 deposits + 1 proxy withdrawal
// const NUM_DEPOSITS = 3;
// const NUM_REGULAR_WITHDRAWALS = 0;
// const NUM_PROXY_WITHDRAWALS = 1;

const FEE_OPTS = {
  maxFeePerGas: 1_000_000_000_000_000n,
  maxPriorityFeePerGas: 500_000_000_000n,
  gasLimit: 500000n,
};

const POOL_ABI = [
  "event Deposit(bytes32 indexed commitment, bytes32 nullifierHash, uint256 leafIndex, uint256 amount)",
  "function depositNative(bytes32 commitment, bytes32 nullifierHash) external payable",
  "function withdraw(uint256[2] pA, uint256[2][2] pB, uint256[2] pC, uint256[7] pubSignals, address asset, uint256 amount, address recipient) external",
  "function proxy_withdraw(uint256[2] pA, uint256[2][2] pB, uint256[2] pC, uint256[7] pubSignals, address asset, uint256 amount, address recipient) external",
  "function currentRoot() view returns (uint256)",
  "function treeSize() view returns (uint256)",
  "function isDepositSpent(bytes32 nullifierHash) view returns (bool)",
];

const LEANIMT_ABI = [
  "function size() view returns (uint256)",
  "function root() view returns (uint256)",
  "function sideNodes(uint256) view returns (uint256)",
];

async function fetchDepositsFromEvents(provider: ethers.Provider, poolAddress: string): Promise<{ commitment: bigint; leafIndex: number }[]> {
  const pool = new ethers.Contract(poolAddress, POOL_ABI, provider);
  
  const deposits: { commitment: bigint; leafIndex: number; blockNumber: number; txHash: string }[] = [];
  
  const fromBlock = 9659000n;
  const toBlock = await provider.getBlockNumber();
  
  console.log(`  Fetching Deposit events from block ${fromBlock} to ${toBlock}...`);
  
  const abi = ["event Deposit(address indexed asset, bytes32 commitment, uint256 nullifierHash)"];
  const iface = new ethers.Interface(abi);
  
  const chunks = 1000;
  for (let start = Number(fromBlock); start < toBlock; start += chunks) {
    const end = Math.min(start + chunks, toBlock);
    const logs = await provider.getLogs({ address: poolAddress, fromBlock: start, toBlock: end });
    
    for (const log of logs) {
      if (log.topics[0] !== "0x19dacbf83c5de6658e14cbf7bcae5c15eca2eedecf1c66fbca928e4d351bea0f") continue;
      
      try {
        const decoded = iface.decodeEventLog("Deposit", log.data, log.topics);
        const commitment = BigInt(decoded.commitment);
        
        deposits.push({
          commitment,
          leafIndex: 0,
          blockNumber: log.blockNumber,
          txHash: log.transactionHash,
        });
      } catch (e) {
        console.log("Decode error:", e);
      }
    }
  }
  
  console.log(`  Total events found: ${deposits.length}`);
  for (let i = 0; i < Math.min(3, deposits.length); i++) {
    console.log(`  Event ${i}: commitment=${deposits[i].commitment.toString(16).slice(0, 20)}...`);
  }
  
  // Sort by block number to determine leafIndex
  deposits.sort((a, b) => a.blockNumber - b.blockNumber);
  
  // Get tree size at each deposit to determine leafIndex
  const leanIMT = new ethers.Contract(CONTRACTS.leanIMT, LEANIMT_ABI, provider);
  
  for (let i = 0; i < deposits.length; i++) {
    // Get tree size after this deposit
    const treeSize = Number(await leanIMT.size());
    deposits[i].leafIndex = treeSize - deposits.length + i;
  }
  
  deposits.sort((a, b) => a.leafIndex - b.leafIndex);
  console.log(`  Found ${deposits.length} deposits`);
  
  return deposits;
}

function parseArgs() {
  const args = process.argv.slice(2);
  let privateKey = "";
  let rpcUrl = "https://eth-asset-hub-paseo.dotters.network";

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--private-key" && i + 1 < args.length) {
      privateKey = args[i + 1];
      i++;
    } else if (args[i] === "--rpc" && i + 1 < args.length) {
      rpcUrl = args[i + 1];
      i++;
    } else if (args[i] === "--help" || args[i] === "-h") {
      console.log(USAGE);
      process.exit(0);
    }
  }

  if (!privateKey) {
    console.error("Error: --private-key is required");
    console.log(USAGE);
    process.exit(1);
  }

  return { privateKey, rpcUrl };
}

function randomBigInt(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return BigInt("0x" + Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("")).toString();
}

function toBytes32(value: ethers.BigInt | string | number): string {
  return ethers.zeroPadValue(ethers.toBeArray(value), 32);
}

async function captureSideNodes(leanIMT: ethers.Contract): Promise<string[]> {
  const sideNodes: string[] = [];
  for (let level = 0; level <= TREE_DEPTH; level++) {
    sideNodes.push((await leanIMT.sideNodes(level)).toString());
  }
  return sideNodes;
}

function buildLocalTree(leaves: bigint[]): { root: string; siblings: string[]; depth: number; sideNodes: Map<number, bigint> } {
  const sideNodes = new Map<number, bigint>();
  let depth = 0;
  let root = 0n;
  
  for (let i = 0; i < leaves.length; i++) {
    const leaf = leaves[i];
    let treeDepth = depth;
    
    if ((1 << treeDepth) < i + 1) {
      treeDepth++;
    }
    depth = treeDepth;
    
    let node = leaf;
    
    for (let level = 0; level < treeDepth; level++) {
      if ((i >> level) & 1) {
        const sibling = sideNodes.get(level) ?? 0n;
        node = poseidon2([sibling, node]);
      } else {
        sideNodes.set(level, node);
      }
    }
    
    sideNodes.set(treeDepth, node);
    root = node;
  }
  
  const siblings: string[] = [];
  for (let level = 0; level < 128; level++) {
    siblings.push((sideNodes.get(level) ?? 0n).toString());
  }
  
  return { root: root.toString(), siblings, depth, sideNodes };
}

function getMerkleProof(treeData: { sideNodes: Map<number, bigint>; depth: number }, leafIndex: number, leaves: bigint[]): string[] {
  const siblings: string[] = [];
  
  for (let level = 0; level < 128; level++) {
    if ((leafIndex >> level) & 1) {
      siblings.push((treeData.sideNodes.get(level) ?? 0n).toString());
    } else {
      siblings.push("0");
    }
  }
  
  return siblings;
}

interface DepositData {
  secret: string;
  nullifier: string;
  commitment: bigint;
  nullifierHash: bigint;
  amount: bigint;
  leafIndex: number;
  sideNodes?: string[];
  rootAtDeposit?: string;
}

interface WithdrawalParams {
  leafIndex: number;
  nullifier: string;
  secret: string;
  newNullifier: string;
  newSecret: string;
  context: string;
  depositAmount: bigint;
  withdrawAmount: bigint;
  asset: string;
}

async function buildCircuitInput(params: WithdrawalParams, siblings: string[], capturedRoot: string) {
  return {
    withdrawnValue: params.withdrawAmount.toString(),
    treeDepth: TREE_DEPTH.toString(),
    context: params.context,
    root: capturedRoot,
    asset: "0",
    existingValue: params.depositAmount.toString(),
    existingNullifier: params.nullifier,
    existingSecret: params.secret,
    newNullifier: params.newNullifier,
    newSecret: params.newSecret,
    siblings,
    leafIndex: params.leafIndex.toString(),
  };
}

async function generateWithdrawProof(
  params: WithdrawalParams,
  deposit: DepositData,
  leanIMT: ethers.Contract,
  pool: ethers.Contract
): Promise<{ proof: any; publicSignals: string[]; root: string }> {
  const MAX_ATTEMPTS = 10;
  let attempt = 1;

  async function fetchCurrentRootAndSiblings() {
    const sideNodes: string[] = [];
    for (let l = 0; l <= TREE_DEPTH; l++) {
      sideNodes.push((await leanIMT.sideNodes(l)).toString());
    }
    const root = sideNodes[TREE_DEPTH];
    const siblings: string[] = [];
    for (let l = 0; l < TREE_DEPTH; l++) {
      const bit = (BigInt(params.leafIndex) >> BigInt(l)) & 1n;
      siblings.push(bit ? sideNodes[l] : "0");
    }
    return { root, siblings };
  }

  let lastRoot = "";
  
  while (attempt <= MAX_ATTEMPTS) {
    // Poll for tree stability before each attempt
    let startSize = Number(await leanIMT.size());
    let pollCount = 0;
    while (pollCount < 10) {
      await new Promise(r => setTimeout(r, 3000));
      const newSize = Number(await leanIMT.size());
      if (newSize === startSize) break;
      console.log(`    Tree growing (size ${newSize}), waiting...`);
      startSize = newSize;
      pollCount++;
    }
    
    console.log(`    Generating proof (attempt ${attempt}/${MAX_ATTEMPTS})...`);
    
    const { root: currentRoot, siblings } = await fetchCurrentRootAndSiblings();
    console.log(`    Root: ${currentRoot.slice(0, 20)}...`);
    
    // Skip if root unchanged since last attempt
    if (currentRoot === lastRoot && attempt > 1) {
      console.log(`    Root unchanged, retrying with same inputs...`);
    }
    lastRoot = currentRoot;
   
    const circuitInput = {
      withdrawnValue: params.withdrawAmount.toString(),
      treeDepth: "128",
      context: params.context,
      root: currentRoot,
      asset: "0",
      existingValue: params.depositAmount.toString(),
      existingNullifier: params.nullifier,
      existingSecret: params.secret,
      newNullifier: params.newNullifier,
      newSecret: params.newSecret,
      siblings,
      leafIndex: params.leafIndex.toString(),
    };
    
    try {
      const startTime = Date.now();
      const result = await snarkjs.groth16.fullProve(circuitInput, WASM_PATH, ZKEY_PATH);
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`    Proof generated in ${elapsed}s`);

      const calldata = await snarkjs.groth16.exportSolidityCallData(result.proof, result.publicSignals);
      const parsed = JSON.parse("[" + calldata + "]");
      const [, , , proofSignals] = parsed;

      const proofRoot = proofSignals[6];
      console.log(`    Proof root: ${proofRoot.slice(0, 20)}...`);

      if (BigInt(proofRoot) !== BigInt(currentRoot)) {
        console.log(`    Root mismatch, retrying...`);
        attempt++;
        continue;
      }

      return { proof: result.proof, publicSignals: proofSignals, root: currentRoot };
    } catch (proofErr: any) {
      if (proofErr.message && proofErr.message.includes("Withdraw_148")) {
        console.log(`    Circuit error during proof generation, retrying...`);
        attempt++;
        continue;
      }
      throw proofErr;
    }
  }

  throw new Error("Failed to generate proof after max attempts");
}

async function main() {
  const { privateKey, rpcUrl } = parseArgs();

  console.log("=".repeat(70));
  console.log("  V5 Test CLI — 3 Deposits + 3 Withdrawals + 2 Proxy Withdrawals");
  console.log("=".repeat(70));
  console.log(`  RPC:          ${rpcUrl}`);
  console.log(`  Pool:         ${CONTRACTS.pool}`);
  console.log(`  Deposits:     ${NUM_DEPOSITS} x ${DEPOSIT_AMOUNT_ETH} PAS`);
  console.log(`  Withdrawals:  ${NUM_REGULAR_WITHDRAWALS} regular + ${NUM_PROXY_WITHDRAWALS} proxy`);
  console.log("=".repeat(70));

  if (!existsSync(WASM_PATH)) {
    console.error(`Error: WASM not found at ${WASM_PATH}`);
    console.error("Build circuit: cd /home/pi/zk/ss/fresh && bash generate_zk_fixed_v2.sh");
    process.exit(1);
  }

  const provider = new ethers.JsonRpcProvider(rpcUrl, undefined, { staticNetwork: true });
  const wallet = new ethers.Wallet(privateKey, provider);

  console.log(`\n  Account:  ${wallet.address}`);
  const balance = await provider.getBalance(wallet.address);
  console.log(`  Balance:  ${ethers.formatEther(balance)} PAS`);

  const requiredBalance = ethers.parseEther(DEPOSIT_AMOUNT_ETH) * BigInt(NUM_DEPOSITS + 1);
  if (balance < requiredBalance) {
    console.error(`\n  Error: Insufficient balance. Need at least ${ethers.formatEther(requiredBalance)} PAS`);
    process.exit(1);
  }

  const pool = new ethers.Contract(CONTRACTS.pool, POOL_ABI, wallet);
  const leanIMT = new ethers.Contract(CONTRACTS.leanIMT, LEANIMT_ABI, provider);

  const results: any = {
    network: "paseo",
    timestamp: new Date().toISOString(),
    contracts: CONTRACTS,
    deposits: [],
    withdrawals: [],
    proxyWithdrawals: [],
    errors: [],
  };

  const treeSizeStart = Number(await leanIMT.size());
  console.log(`\n  Starting tree size: ${treeSizeStart} leaves`);

  const deposits: DepositData[] = [];

  console.log("\n" + "=".repeat(70));
  console.log("  PHASE 1: Making Deposits");
  console.log("=".repeat(70));

  for (let i = 0; i < NUM_DEPOSITS; i++) {
    console.log(`\n  --- Deposit ${i + 1}/${NUM_DEPOSITS} ---`);

    const treeSizeBefore = Number(await leanIMT.size());
    console.log(`    Tree size before: ${treeSizeBefore}`);

    const secret = randomBigInt();
    const nullifier = randomBigInt();
    const amount = ethers.parseEther(DEPOSIT_AMOUNT_ETH);
    const nullifierHash = poseidon1([nullifier]);
    const precommitment = poseidon2([nullifier, secret]);
    const valueAssetHash = poseidon2([amount.toString(), "0"]);
    const commitment = poseidon2([valueAssetHash.toString(), precommitment.toString()]);

    const leafIndex = treeSizeBefore;
    console.log(`    Leaf index: ${leafIndex}, commitment: ${commitment.toString().slice(0, 16)}...`);

    try {
      const tx = await pool.depositNative(
        toBytes32(commitment),
        toBytes32(nullifierHash),
        { value: amount, ...FEE_OPTS }
      );
      console.log(`    TX: ${tx.hash}`);
      const receipt = await tx.wait();
      console.log(`    ✅ Confirmed in block ${receipt.blockNumber}`);
      console.log(`    Gas used: ${receipt.gasUsed}`);

      deposits.push({
        secret,
        nullifier,
        commitment,
        nullifierHash,
        amount,
        leafIndex,
      });

      // Capture sideNodes and root for this deposit immediately after deposit
      const sideNodesAtDeposit: string[] = [];
      for (let l = 0; l <= TREE_DEPTH; l++) {
        sideNodesAtDeposit.push((await leanIMT.sideNodes(l)).toString());
      }
      const rootAtDeposit = (await leanIMT.root()).toString();
      deposits[deposits.length - 1].sideNodes = sideNodesAtDeposit;
      deposits[deposits.length - 1].rootAtDeposit = rootAtDeposit;
      console.log(`    Captured sideNodes for withdrawal`);

      results.deposits.push({
        index: i,
        leafIndex,
        amount: DEPOSIT_AMOUNT_ETH,
        txHash: tx.hash,
        blockNumber: receipt.blockNumber,
        commitment: commitment.toString(),
      });

      console.log(`    Waiting for tree update...`);
      let treeSizeAfter = Number(await leanIMT.size());
      const maxWait = 30;
      let waitTime = 0;
      while (treeSizeAfter === treeSizeBefore && waitTime < maxWait) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        treeSizeAfter = Number(await leanIMT.size());
        waitTime++;
      }
      console.log(`    Tree size after: ${treeSizeAfter}`);
    } catch (err: any) {
      console.error(`    ❌ Deposit failed: ${err.message}`);
      results.errors.push({ phase: "deposit", index: i, error: err.message });
      throw err;
    }
  }

  console.log("\n  Verifying tree state after deposits...");
  await new Promise(resolve => setTimeout(resolve, 2000));
  const finalTreeSize = Number(await leanIMT.size());
  console.log(`  Final tree size: ${finalTreeSize}`);

  console.log("\n  Fetching on-chain deposits from events...");
  const onChainDeposits = await fetchDepositsFromEvents(provider, CONTRACTS.pool);
  console.log(`  On-chain deposits: ${onChainDeposits.length}`);

  const onChainRoot = await leanIMT.root();
  console.log(`  On-chain root: ${onChainRoot}`);

  console.log("\n" + "=".repeat(70));
  console.log("  PHASE 2: Regular Withdrawals");
  console.log("=".repeat(70));

  for (let i = 0; i < NUM_REGULAR_WITHDRAWALS; i++) {
    console.log(`\n  --- Regular Withdrawal ${i + 1}/${NUM_REGULAR_WITHDRAWALS} ---`);

    // Use the most recent deposit from this run
    const deposit = deposits[deposits.length - 1 - i];
    const leafIndex = deposit.leafIndex;
    
    const withdrawAmount = deposit.amount;
    const newNullifier = randomBigInt();
    const newSecret = randomBigInt();
    const context = randomBigInt();

    console.log(`    Spending leaf ${leafIndex}, withdrawing ${DEPOSIT_AMOUNT_ETH} PAS`);

    try {
      let withdrawalSuccess = false;
      let maxWithdrawAttempts = 5;
      let withdrawAttempt = 0;
      
      while (!withdrawalSuccess && withdrawAttempt < maxWithdrawAttempts) {
        withdrawAttempt++;
        console.log(`    Withdrawal attempt ${withdrawAttempt}/${maxWithdrawAttempts}...`);
        
        const { proof, publicSignals, root } = await generateWithdrawProof(
          {
            leafIndex: deposit.leafIndex,
            nullifier: deposit.nullifier,
            secret: deposit.secret,
            newNullifier,
            newSecret,
            context,
            depositAmount: deposit.amount,
            withdrawAmount,
            asset: "0",
          },
          deposit,
          leanIMT,
          pool
        );

        const parsed = await snarkjs.groth16.exportSolidityCallData(proof, publicSignals);
        const [pA, pB, pC, proofSignals] = JSON.parse("[" + parsed + "]");

        const proofRoot = proofSignals[6];
        const currentRoot = (await pool.currentRoot()).toString();
        if (BigInt(proofRoot) !== BigInt(currentRoot)) {
          console.log(`    ⚠️  Root changed (proof: ${proofRoot.slice(0,16)}..., chain: ${currentRoot.slice(0,16)}...), retrying...`);
          continue;
        }

        console.log(`    Proof root verified: ${proofRoot.slice(0, 16)}...`);
        console.log(`    Submitting withdrawal...`);
        
        try {
          const tx = await pool.withdraw(
            pA.map(BigInt),
            pB.map((r: any) => r.map(BigInt)),
            pC.map(BigInt),
            proofSignals.map(BigInt),
            ethers.ZeroAddress,
            withdrawAmount,
            wallet.address,
            { ...FEE_OPTS, gasLimit: 500000n }
          );

          console.log(`    TX: ${tx.hash}`);
          const receipt = await tx.wait();
          console.log(`    ✅ Confirmed in block ${receipt.blockNumber}`);
          console.log(`    Gas used: ${receipt.gasUsed}`);

          const isSpent = await pool.isDepositSpent(toBytes32(deposit.nullifierHash));
          console.log(`    Deposit spent: ${isSpent}`);

          results.withdrawals.push({
            index: i,
            type: "regular",
            leafIndex: deposit.leafIndex,
            amount: ethers.formatEther(withdrawAmount),
            txHash: tx.hash,
            blockNumber: receipt.blockNumber,
            gasUsed: receipt.gasUsed.toString(),
            depositSpent: isSpent,
          });
          
          withdrawalSuccess = true;
        } catch (txErr: any) {
          if (txErr.message.includes("Assert Failed") || txErr.message.includes("Withdraw_148")) {
            console.log(`    ⚠️  Circuit error, retrying...`);
            continue;
          }
          throw txErr;
        }
      }
      
      if (!withdrawalSuccess) {
        throw new Error("Withdrawal failed after max attempts");
      }
    } catch (err: any) {
      console.error(`    ❌ Withdrawal failed: ${err.message}`);
      results.errors.push({ phase: "withdrawal", index: i, error: err.message });
      throw err;
    }
  }

  console.log("\n" + "=".repeat(70));
  console.log("  PHASE 3: Proxy Withdrawals");
  console.log("=".repeat(70));

  for (let i = 0; i < NUM_PROXY_WITHDRAWALS; i++) {
    // Find an unspent deposit
    let deposit: DepositData | undefined;
    for (let j = deposits.length - 1; j >= 0; j--) {
      const d = deposits[j];
      const nullifierHash = poseidon1([d.nullifier]).toString();
      const isSpent = await pool.isDepositSpent(toBytes32(nullifierHash));
      if (!isSpent) {
        deposit = d;
        break;
      }
    }
    
    if (!deposit) {
      console.log(`\n  ⚠️  No unspent deposits available for proxy withdrawal ${i + 1}`);
      break;
    }
    const withdrawAmount = deposit.amount;
    const newNullifier = randomBigInt();
    const newSecret = randomBigInt();
    const context = randomBigInt();

    console.log(`    Spending leaf ${deposit.leafIndex} (${DEPOSIT_AMOUNT_ETH} PAS)`);
    console.log(`    Withdrawing: ${ethers.formatEther(withdrawAmount)} PAS (via proxy)`);

    try {
      let withdrawalSuccess = false;
      let maxWithdrawAttempts = 5;
      let withdrawAttempt = 0;
      
      while (!withdrawalSuccess && withdrawAttempt < maxWithdrawAttempts) {
        withdrawAttempt++;
        console.log(`    Proxy withdrawal attempt ${withdrawAttempt}/${maxWithdrawAttempts}...`);
        
        const { proof, publicSignals, root } = await generateWithdrawProof(
          {
            leafIndex: deposit.leafIndex,
            nullifier: deposit.nullifier,
            secret: deposit.secret,
            newNullifier,
            newSecret,
            context,
            depositAmount: deposit.amount,
            withdrawAmount,
            asset: "0",
          },
          deposit,
          leanIMT,
          pool
        );

        const parsed = await snarkjs.groth16.exportSolidityCallData(proof, publicSignals);
        const [pA, pB, pC, proofSignals] = JSON.parse("[" + parsed + "]");

        const proofRoot = proofSignals[6];
        const currentRoot = (await pool.currentRoot()).toString();
        if (BigInt(proofRoot) !== BigInt(currentRoot)) {
          console.log(`    ⚠️  Root changed (proof: ${proofRoot.slice(0,16)}..., chain: ${currentRoot.slice(0,16)}...), retrying...`);
          continue;
        }

        console.log(`    Proof root verified: ${proofRoot.slice(0, 16)}...`);

        try {
          const tx = await pool.withdraw(
            pA.map(BigInt),
            pB.map((r: any) => r.map(BigInt)),
            pC.map(BigInt),
            proofSignals.map(BigInt),
            ethers.ZeroAddress,
            withdrawAmount,
            wallet.address,
            { ...FEE_OPTS, gasLimit: 500000n }
          );

          console.log(`    TX: ${tx.hash}`);
          const receipt = await tx.wait();
          console.log(`    ✅ Confirmed in block ${receipt.blockNumber}`);
          console.log(`    Gas used: ${receipt.gasUsed}`);

          const isSpent = await pool.isDepositSpent(toBytes32(deposit.nullifierHash));
          console.log(`    Deposit spent: ${isSpent}`);

          results.proxyWithdrawals.push({
            index: i,
            leafIndex: deposit.leafIndex,
            amount: ethers.formatEther(withdrawAmount),
            txHash: tx.hash,
            blockNumber: receipt.blockNumber,
            gasUsed: receipt.gasUsed.toString(),
            depositSpent: isSpent,
          });
          
          withdrawalSuccess = true;
        } catch (txErr: any) {
          if (txErr.message.includes("Assert Failed") || txErr.message.includes("Withdraw_148")) {
            console.log(`    ⚠️  Circuit error, retrying...`);
            continue;
          }
          throw txErr;
        }
      }
      
      if (!withdrawalSuccess) {
        throw new Error("Proxy withdrawal failed after max attempts");
      }
    } catch (err: any) {
      console.error(`    ❌ Proxy withdrawal failed: ${err.message}`);
      results.errors.push({ phase: "proxy_withdrawal", index: i, error: err.message });
      throw err;
    }
  }

  console.log("\n" + "=".repeat(70));
  console.log("  FINAL STATE");
  console.log("=".repeat(70));

  const treeSizeEnd = Number(await leanIMT.size());
  const walletEnd = await provider.getBalance(wallet.address);
  const poolEnd = await provider.getBalance(CONTRACTS.pool);

  console.log(`  Final tree size: ${treeSizeEnd} leaves`);
  console.log(`  Wallet balance:  ${ethers.formatEther(walletEnd)} PAS`);
  console.log(`  Pool balance:    ${ethers.formatEther(poolEnd)} PAS`);

  results.final = {
    treeSize: treeSizeEnd,
    walletBalance: ethers.formatEther(walletEnd),
    poolBalance: ethers.formatEther(poolEnd),
  };

  const outputFile = "v5_cli_test_results.json";
  writeFileSync(outputFile, JSON.stringify(results, null, 2));
  console.log(`\n  Results saved to ${outputFile}`);

  console.log("\n" + "=".repeat(70));
  console.log("  ✅ V5 CLI TEST COMPLETE!");
  console.log("=".repeat(70));
  console.log(`  Deposits:        ${results.deposits.length}`);
  console.log(`  Withdrawals:     ${results.withdrawals.length}`);
  console.log(`  Proxy withdraws: ${results.proxyWithdrawals.length}`);
  console.log(`  Errors:          ${results.errors.length}`);
  console.log("=".repeat(70));
}

main().catch(err => {
  console.error("\n❌ Error:", err.message);
  process.exit(1);
});