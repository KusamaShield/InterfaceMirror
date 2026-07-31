/**
 * Paseo AssetHub v7 Test Script — uses shared LeanIMT from transactions/merkle.ts
 * 
 * Full deposit + ZK proof + withdraw roundtrip.
 * Run: npx tsx src/test_paseo_v7.ts
 */

import { ethers } from "ethers";
import * as snarkjs from "snarkjs";
import { poseidon1, poseidon2 } from "poseidon-lite";
import { LeanIMT } from "./transactions/merkle";
import * as path from "path";
import * as fs from "fs";

// =========================================================================== //
// Config
// =========================================================================== //

const PRIVATE_KEY = "";
const ACCOUNT = "0x7915705d3B9A2caf798A86A8abB3882ea9BA7647";
const RPC_URL = "https://paseo-assethub-rpc.laissez-faire.trade/";
const POOL_ADDRESS = "0xbcE09D4De052b2816df1285663ac89528DF45380";
const DEPLOYMENT_BLOCK = 10939861;
const BN254_R = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;

// v7 pool ABI — 2-param Deposit (no nullifierHash = linkability fix)
const POOL_ABI = [
  "function depositNative(bytes32 commitment) external payable",
  "function withdraw(uint256[2] calldata pA, uint256[2][2] calldata pB, uint256[2] calldata pC, uint[8] calldata pubSignals, address recipient) external",
  "function currentRoot() external view returns (uint256)",
  "function treeSize() external view returns (uint256)",
  "function isNullifierSpent(bytes32) external view returns (bool)",
  // Events for merkle.ts scanner (handles topic0-based matching)
  "event Deposit(address indexed asset, bytes32 commitment)",
  "event NewCommitment(bytes32 newCommitmentHash)",
];

// =========================================================================== //
// Commitment — matches circom CommitmentHasher exactly
// =========================================================================== //

function generateCommitmentV7(secret: string, amount: bigint, assetId: bigint = 0n) {
  const secretBN = BigInt(secret);
  // nullifier = Poseidon2(secret, 1)
  const nullifier = poseidon2([secretBN, 1n]);
  // nullifierHash = Poseidon1(nullifier) — SINGLE input, not Poseidon2!
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

// =========================================================================== //
// Tree builder — fetches v7 events and inserts into LeanIMT
// =========================================================================== //

async function buildTree(
  provider: ethers.Provider,
  startBlock: number,
): Promise<LeanIMT> {
  const tree = new LeanIMT();

  // v7 event topics
  const depositTopic = ethers.id("Deposit(address,bytes32)");
  const newCommitmentTopic = ethers.id("NewCommitment(bytes32)");

  console.log(`  Fetching logs from block ${startBlock}...`);
  const logs = await provider.getLogs({
    address: POOL_ADDRESS,
    fromBlock: startBlock,
    toBlock: "latest",
    topics: [[depositTopic, newCommitmentTopic]],
  });

  logs.sort((a, b) => {
    if (a.blockNumber !== b.blockNumber) return a.blockNumber - b.blockNumber;
    return a.index - b.index;
  });

  let n = 0;
  for (const log of logs) {
    if (log.topics[0] === depositTopic || log.topics[0] === newCommitmentTopic) {
      tree.insert(BigInt(log.data));
      n++;
    }
  }

  console.log(`  Inserted ${n} leaves, root: ${tree.root}`);
  return tree;
}

// =========================================================================== //
// Main roundtrip
// =========================================================================== //

async function main() {
  console.log("🚀 Paseo v7 Roundtrip\n" + "=".repeat(40));

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
  const contract = new ethers.Contract(POOL_ADDRESS, POOL_ABI, wallet);
  const contractRead = new ethers.Contract(POOL_ADDRESS, POOL_ABI, provider);

  const balance = await provider.getBalance(ACCOUNT);
  const treeSize = await contractRead.treeSize();
  console.log(`Balance: ${ethers.formatEther(balance)} PAS  |  Tree: ${treeSize} leaves  |  Block: ${await provider.getBlockNumber()}`);

  const depositAmount = ethers.parseEther("0.01");
  if (balance < depositAmount + ethers.parseEther("0.05")) {
    console.log("❌ Need more PAS: https://faucet.polkadot.io?parachain=1000");
    return;
  }

  // --- Deposit ---
  console.log("\n— Deposit —");
  const secret = ethers.hexlify(ethers.randomBytes(31));
  const dep = generateCommitmentV7(secret, depositAmount, 0n);
  console.log(`  commitment: ${dep.commitment}`);

  const commBytes = ethers.zeroPadValue(ethers.toBeArray(BigInt(dep.commitment)), 32);
  const gasEst = await contract.depositNative.estimateGas(commBytes, { value: depositAmount });
  const dTx = await contract.depositNative(commBytes, { value: depositAmount, gasLimit: gasEst * 120n / 100n });
  console.log(`  tx: ${dTx.hash}`);
  await dTx.wait();
  console.log(`  confirmed`);

  // Wait for event indexing
  await new Promise((r) => setTimeout(r, 8000));

  // --- Build Merkle tree ---
  console.log("\n— Merkle Tree —");
  const tree = await buildTree(provider, DEPLOYMENT_BLOCK);
  const onChainRoot = (await contractRead.currentRoot()).toString();
  console.log(`  root matches chain? ${tree.root.toString() === onChainRoot} (${onChainRoot.slice(0, 20)}...)`);

  const leafIdx = tree.findLeafIndex(BigInt(dep.commitment));
  if (leafIdx === -1) {
    console.log(`  ❌ Commitment not found in tree! Check event topic hash.`);
    return;
  }
  console.log(`  leaf index: ${leafIdx}`);

  const merkleProof = tree.getProof(leafIdx);
  console.log(`  siblings: ${merkleProof.siblings.length} (${merkleProof.siblings.filter((s: string) => s !== "0").length} non-zero)`);

  // --- Generate ZK proof ---
  console.log("\n— ZK Proof —");
  const wasmPath = path.join(process.cwd(), "public", "withdraw_phase2_fixed_v7.wasm");
  const zkeyPath = path.join(process.cwd(), "public", "withdraw_phase2_fixed_v7_0001.zkey");
  if (!fs.existsSync(wasmPath) || !fs.existsSync(zkeyPath)) {
    console.log("  ❌ Circuit files missing");
    return;
  }

  const context = BigInt(ethers.keccak256(ethers.solidityPacked(["address"], [ACCOUNT]))) % BN254_R;
  const newSecret = ethers.hexlify(ethers.randomBytes(31));
  const newNullifier = poseidon2([BigInt(newSecret), 1n]).toString();

  const circuitInput = {
    withdrawnValue: depositAmount.toString(),
    root: merkleProof.root,
    treeDepth: "128",
    context: context.toString(),
    asset: ethers.ZeroAddress,
    existingValue: depositAmount.toString(),
    existingNullifier: dep.nullifier,
    existingSecret: dep.secret,
    newNullifier,
    newSecret,
    siblings: merkleProof.siblings,
    leafIndex: leafIdx.toString(),
  };

  console.log(`  proving...`);
  const t0 = Date.now();
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(circuitInput, wasmPath, zkeyPath);
  console.log(`  ✅ ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  // --- Withdraw ---
  console.log("\n— Withdraw —");
  // Format proof (pB transposed for Solidity)
  const formattedProof = [
    [BigInt(proof.pi_a[0]), BigInt(proof.pi_a[1])],
    [
      [BigInt(proof.pi_b[0][1]), BigInt(proof.pi_b[0][0])],
      [BigInt(proof.pi_b[1][1]), BigInt(proof.pi_b[1][0])],
    ],
    [BigInt(proof.pi_c[0]), BigInt(proof.pi_c[1])],
  ];

  const wGas = await contract.withdraw.estimateGas(
    formattedProof[0], formattedProof[1], formattedProof[2],
    publicSignals.map((s: string) => BigInt(s)), ACCOUNT,
  );
  console.log(`  gas: ${wGas}`);

  const wTx = await contract.withdraw(
    formattedProof[0], formattedProof[1], formattedProof[2],
    publicSignals.map((s: string) => BigInt(s)), ACCOUNT,
  );
  console.log(`  tx: ${wTx.hash}`);
  const wReceipt = await wTx.wait();
  console.log(`  block: ${wReceipt.blockNumber}  gas: ${wReceipt.gasUsed}`);

  const finalBalance = await provider.getBalance(ACCOUNT);
  console.log(`\n✅ Done! Balance: ${ethers.formatEther(finalBalance)} PAS`);
}

main().catch((err) => {
  console.error("\n❌", err.message || err);
  process.exit(1);
});
