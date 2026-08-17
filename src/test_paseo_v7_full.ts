/**
 * Paseo AssetHub v7 Full Roundtrip — Deposit + ZK Proof + Withdraw
 * 
 * Standalone script. No localStorage dependency. Matches circuit exactly.
 * 
 * Usage: npx tsx src/test_paseo_v7_full.ts
 */

import { ethers } from "ethers";
import * as snarkjs from "snarkjs";
import { poseidon1, poseidon2 } from "poseidon-lite";
import * as path from "path";
import * as fs from "fs";
import * as dotenv from "dotenv";
dotenv.config();

// ============================================================================ //
// Configuration
// ============================================================================ //

const PRIVATE_KEY = process.env.ETH_PRIVATE_KEY;
if (!PRIVATE_KEY) throw new Error("Set ETH_PRIVATE_KEY in .env");
const ACCOUNT = "0x7915705d3B9A2caf798A86A8abB3882ea9BA7647";

const CONFIG = {
  rpcUrl: "https://paseo-assethub-rpc.laissez-faire.trade/",
  poolAddress: "0xbcE09D4De052b2816df1285663ac89528DF45380",
  decimals: 18,
  deploymentBlock: 10939861,
  treeDepth: 128,
  depositAmount: "0.01", // PAS
};

// v7 ABI — note 2-param Deposit event (no nullifierHash = linkability fix)
const POOL_ABI = [
  "function depositNative(bytes32 commitment) external payable",
  "function withdraw(uint256[2] calldata pA, uint256[2][2] calldata pB, uint256[2] calldata pC, uint[8] calldata pubSignals, address recipient) external",
  "function currentRoot() external view returns (uint256)",
  "function treeSize() external view returns (uint256)",
  "function getEscrowBalance(address) external view returns (uint256)",
  "function isNullifierSpent(bytes32) external view returns (bool)",
  "event Deposit(address indexed asset, bytes32 commitment)",
  "event NewCommitment(bytes32 newCommitmentHash)",
];

const BN254_R = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;

// ============================================================================ //
// Commitment (matches circom CommitmentHasher exactly)
// ============================================================================ //

function generateCommitmentV7(secret: string, amount: bigint, assetId: bigint = 0n) {
  const secretBN = BigInt(secret);
  // nullifier = Poseidon2(secret, 1)
  const nullifier = poseidon2([secretBN, 1n]);
  // nullifierHash = Poseidon1(nullifier) — 1-input, NOT 2-input!
  const nullifierHash = poseidon1([nullifier]);
  // precommitment = Poseidon2(nullifier, secret)
  const precommitment = poseidon2([nullifier, secretBN]);
  // valueAssetHash = Poseidon2(amount, asset)
  const valueAssetHash = poseidon2([amount, assetId]);
  // commitment = Poseidon2(valueAssetHash, precommitment)
  const commitment = poseidon2([valueAssetHash, precommitment]);

  return {
    secret,
    nullifier: nullifier.toString(),
    nullifierHash: nullifierHash.toString(),
    commitment: commitment.toString(),
  };
}

// ============================================================================ //
// LeanIMT — 1:1 port of the Solidity contract's _insert() algorithm
// Uses poseidon2 which matches PoseidonT3 precompile at 0x1d165f...
// ============================================================================ //

class LeanIMT {
  private leaves: bigint[] = [];
  private _sideNodes = new Map<number, bigint>();
  private _depth = 0;

  get root(): bigint {
    return this._sideNodes.get(this._depth) ?? 0n;
  }
  get size(): number {
    return this.leaves.length;
  }

  private sn(level: number): bigint {
    return this._sideNodes.get(level) ?? 0n;
  }

  insert(leaf: bigint): void {
    const index = this.leaves.length;
    let treeDepth = this._depth;

    if ((1 << treeDepth) < index + 1) {
      treeDepth++;
    }
    this._depth = treeDepth;

    let node = leaf;
    for (let level = 0; level < treeDepth; level++) {
      if ((index >> level) & 1) {
        // Right child: hash(sideNode, node)
        node = poseidon2([this.sn(level), node]);
      } else {
        // Left child: store side node
        this._sideNodes.set(level, node);
      }
    }
    this._sideNodes.set(treeDepth, node);
    this.leaves.push(leaf);
  }

  findLeafIndex(leaf: bigint): number {
    return this.leaves.findIndex((l) => l === leaf);
  }

  /**
   * Get Merkle proof siblings by rebuilding the tree layer-by-layer.
   * Pads to 128 for the circuit. Odd nodes propagate (matching contract).
   */
  getProof(leafIndex: number): { siblings: string[]; root: string; leafIndex: number } {
    if (leafIndex < 0 || leafIndex >= this.leaves.length) {
      throw new Error(`Leaf index ${leafIndex} out of range (size=${this.leaves.length})`);
    }

    const siblings: bigint[] = [];
    let currentLayer = [...this.leaves];
    let idx = leafIndex;

    for (let level = 0; level < this._depth; level++) {
      const sibIdx = idx % 2 === 0 ? idx + 1 : idx - 1;
      siblings.push(
        sibIdx >= 0 && sibIdx < currentLayer.length ? currentLayer[sibIdx] : 0n,
      );

      const nextLayer: bigint[] = [];
      for (let i = 0; i < currentLayer.length; i += 2) {
        if (i + 1 < currentLayer.length) {
          nextLayer.push(poseidon2([currentLayer[i], currentLayer[i + 1]]));
        } else {
          nextLayer.push(currentLayer[i]); // odd node propagates up
        }
      }
      currentLayer = nextLayer;
      idx = Math.floor(idx / 2);
    }

    // Pad to circuit depth (128)
    while (siblings.length < 128) {
      siblings.push(0n);
    }

    return {
      siblings: siblings.map((s) => s.toString()),
      root: this.root.toString(),
      leafIndex,
    };
  }

  /** Verify the tree root against on-chain contract root */
  async verifyRoot(contract: ethers.Contract): Promise<boolean> {
    const onChainRoot = (await contract.currentRoot()).toString();
    return this.root.toString() === onChainRoot;
  }
}

// ============================================================================ //
// Event-based tree reconstruction (v7-specific)
// ============================================================================ //

async function buildTreeFromEvents(
  provider: ethers.Provider,
  poolAddress: string,
  startBlock: number,
): Promise<LeanIMT> {
  const tree = new LeanIMT();

  // v7 event topics
  const depositTopic = ethers.id("Deposit(address,bytes32)");       // 2-param, no nullifierHash
  const newCommitmentTopic = ethers.id("NewCommitment(bytes32)");

  console.log(`  Fetching events from block ${startBlock}...`);

  const logs = await provider.getLogs({
    address: poolAddress,
    fromBlock: startBlock,
    toBlock: "latest",
    topics: [[depositTopic, newCommitmentTopic]],
  });

  console.log(`  Got ${logs.length} raw logs`);

  // Sort by block, then index
  logs.sort((a, b) => {
    if (a.blockNumber !== b.blockNumber) return a.blockNumber - b.blockNumber;
    return a.index - b.index;
  });

  let depositCount = 0;
  let changeCount = 0;

  for (const log of logs) {
    if (log.topics[0] === depositTopic) {
      // Data is a single bytes32 (the commitment)
      const commitment = BigInt(log.data);
      tree.insert(commitment);
      depositCount++;
    } else if (log.topics[0] === newCommitmentTopic) {
      const commitment = BigInt(log.data);
      tree.insert(commitment);
      changeCount++;
    }
  }

  console.log(`  Inserts: ${depositCount} deposits + ${changeCount} change outputs = ${tree.size} leaves`);
  console.log(`  Tree root: ${tree.root}`);
  return tree;
}

// ============================================================================ //
// Main Test
// ============================================================================ //

async function main() {
  console.log("🚀 Paseo AssetHub v7 — Full Deposit + Withdraw Roundtrip");
  console.log("=".repeat(56));

  const provider = new ethers.JsonRpcProvider(CONFIG.rpcUrl);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
  const contract = new ethers.Contract(CONFIG.poolAddress, POOL_ABI, wallet);
  const contractRead = new ethers.Contract(CONFIG.poolAddress, POOL_ABI, provider);

  const chainId = (await provider.getNetwork()).chainId;
  const block = await provider.getBlockNumber();
  const balance = await provider.getBalance(ACCOUNT);

  console.log(`\nAccount:    ${ACCOUNT}`);
  console.log(`Chain ID:   ${chainId}`);
  console.log(`Block:      ${block}`);
  console.log(`Balance:    ${ethers.formatEther(balance)} PAS`);
  console.log(`Pool:       ${CONFIG.poolAddress}`);

  const treeSize = await contractRead.treeSize();
  const onChainRoot = await contractRead.currentRoot();
  console.log(`Tree size:  ${treeSize}`);
  console.log(`Root:       ${onChainRoot}`);

  const depositAmount = ethers.parseEther(CONFIG.depositAmount);

  if (balance < depositAmount + ethers.parseEther("0.05")) {
    console.log(`\n❌ Insufficient balance. Need at least ${ethers.formatEther(depositAmount + ethers.parseEther("0.05"))} PAS.`);
    console.log(`   Fund via Substrate faucet (SS58 address needed):`);
    console.log(`   https://faucet.polkadot.io?parachain=1000`);
    return;
  }

  // ========================================================================== //
  // 1. DEPOSIT
  // ========================================================================== //

  console.log(`\n--- DEPOSIT ---`);

  const secret = ethers.hexlify(ethers.randomBytes(31));
  const depositData = generateCommitmentV7(secret, depositAmount, 0n);

  console.log(`  Secret:        ${depositData.secret}`);
  console.log(`  Nullifier:     ${depositData.nullifier}`);
  console.log(`  NullifierHash: ${depositData.nullifierHash}`);
  console.log(`  Commitment:    ${depositData.commitment}`);
  console.log(`  Amount:        ${ethers.formatEther(depositAmount)} PAS`);

  const commBytes = ethers.zeroPadValue(ethers.toBeArray(BigInt(depositData.commitment)), 32);

  console.log(`\n  Sending depositNative...`);
  const gasEstimate = await contract.depositNative.estimateGas(commBytes, { value: depositAmount });
  console.log(`  Gas estimate:  ${gasEstimate}`);

  const depositTx = await contract.depositNative(commBytes, {
    value: depositAmount,
    gasLimit: gasEstimate * 120n / 100n,
  });
  console.log(`  TX:            ${depositTx.hash}`);

  const depositReceipt = await depositTx.wait();
  console.log(`  Confirmed:     block ${depositReceipt.blockNumber}`);

  // Wait for event indexing
  console.log(`\n  Waiting 8s for event indexing...`);
  await new Promise((r) => setTimeout(r, 8000));

  // ========================================================================== //
  // 2. REBUILD MERKLE TREE
  // ========================================================================== //

  console.log(`\n--- MERKLE TREE ---`);

  const tree = await buildTreeFromEvents(provider, CONFIG.poolAddress, CONFIG.deploymentBlock);
  console.log(`  Root matches on-chain? ${await tree.verifyRoot(contractRead)}`);

  const leafIndex = tree.findLeafIndex(BigInt(depositData.commitment));
  if (leafIndex === -1) {
    console.log(`  ❌ Commitment NOT found in tree!`);
    console.log(`     This means the Deposit event wasn't indexed yet OR the event signature is wrong.`);
    console.log(`     Looking for commitment: ${depositData.commitment}`);
    return;
  }
  console.log(`  Leaf index:    ${leafIndex}`);

  const merkleProof = tree.getProof(leafIndex);
  const nonZeroSiblings = merkleProof.siblings.filter((s) => s !== "0").length;
  console.log(`  Siblings:      ${merkleProof.siblings.length} (${nonZeroSiblings} non-zero)`);
  console.log(`  Proof root:    ${merkleProof.root}`);

  // ========================================================================== //
  // 3. GENERATE ZK PROOF
  // ========================================================================== //

  console.log(`\n--- ZK PROOF ---`);

  const wasmPath = path.join(process.cwd(), "public", "withdraw_phase2_fixed_v7.wasm");
  const zkeyPath = path.join(process.cwd(), "public", "withdraw_phase2_fixed_v7_0001.zkey");

  if (!fs.existsSync(wasmPath)) {
    console.log(`  ❌ WASM not found: ${wasmPath}`);
    return;
  }
  if (!fs.existsSync(zkeyPath)) {
    console.log(`  ❌ ZKEY not found: ${zkeyPath}`);
    return;
  }

  // Context hash: keccak256(recipient) mod BN254_R
  const context = BigInt(
    ethers.keccak256(ethers.solidityPacked(["address"], [ACCOUNT])),
  ) % BN254_R;

  // New nullifier + secret for change UTXO (0-value since full withdrawal)
  const newSecret = ethers.hexlify(ethers.randomBytes(31));
  const newNullifier = poseidon2([BigInt(newSecret), 1n]).toString();

  console.log(`  WASM: ${wasmPath}`);
  console.log(`  ZKEY: ${zkeyPath}`);
  console.log(`  Context: ${context}`);

  const circuitInput = {
    withdrawnValue: depositAmount.toString(),
    root: merkleProof.root,
    treeDepth: CONFIG.treeDepth.toString(),
    context: context.toString(),
    asset: ethers.ZeroAddress,
    existingValue: depositAmount.toString(),
    existingNullifier: depositData.nullifier,
    existingSecret: depositData.secret,
    newNullifier,
    newSecret,
    siblings: merkleProof.siblings,
    leafIndex: leafIndex.toString(),
  };

  console.log(`  Generating proof (this takes 30-60s)...`);
  const proofStart = Date.now();

  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    circuitInput,
    wasmPath,
    zkeyPath,
  );

  const proofTime = ((Date.now() - proofStart) / 1000).toFixed(1);
  console.log(`  ✅ Proof generated in ${proofTime}s`);

  // Log public signals (v7 layout)
  console.log(`  Public signals (8):`);
  console.log(`    [0] newCommitmentHash:     ${publicSignals[0]}`);
  console.log(`    [1] existingNullifierHash: ${publicSignals[1]}`);
  console.log(`    [2] contextHash:           ${publicSignals[2]}`);
  console.log(`    [3] withdrawnValue:        ${publicSignals[3]} (${ethers.formatEther(publicSignals[3])} PAS)`);
  console.log(`    [4] treeDepth:             ${publicSignals[4]}`);
  console.log(`    [5] context:               ${publicSignals[5]}`);
  console.log(`    [6] root:                  ${publicSignals[6]}`);
  console.log(`    [7] asset:                 ${publicSignals[7]}`);

  // ========================================================================== //
  // 4. SUBMIT WITHDRAWAL
  // ========================================================================== //

  console.log(`\n--- WITHDRAW ---`);

  // Format proof for Solidity (pB transposed)
  const formattedProof = [
    [BigInt(proof.pi_a[0]), BigInt(proof.pi_a[1])],
    [
      [BigInt(proof.pi_b[0][1]), BigInt(proof.pi_b[0][0])],
      [BigInt(proof.pi_b[1][1]), BigInt(proof.pi_b[1][0])],
    ],
    [BigInt(proof.pi_c[0]), BigInt(proof.pi_c[1])],
  ];

  console.log(`  Estimating gas...`);
  const withdrawGas = await contract.withdraw.estimateGas(
    formattedProof[0],
    formattedProof[1],
    formattedProof[2],
    publicSignals.map((s: string) => BigInt(s)),
    ACCOUNT,
  );
  console.log(`  Gas estimate:  ${withdrawGas}`);

  console.log(`  Sending withdraw tx...`);
  const withdrawTx = await contract.withdraw(
    formattedProof[0],
    formattedProof[1],
    formattedProof[2],
    publicSignals.map((s: string) => BigInt(s)),
    ACCOUNT,
  );
  console.log(`  TX:            ${withdrawTx.hash}`);

  const withdrawReceipt = await withdrawTx.wait();
  console.log(`  Confirmed:     block ${withdrawReceipt.blockNumber}`);
  console.log(`  Gas used:      ${withdrawReceipt.gasUsed}`);

  const finalBalance = await provider.getBalance(ACCOUNT);
  console.log(`\n  ✅ Roundtrip complete!`);
  console.log(`  Final balance: ${ethers.formatEther(finalBalance)} PAS`);
}

main().catch((err) => {
  console.error("\n❌", err.message || err);
  process.exit(1);
});