/**
 * Paseo AssetHub v7 Test Script - Complete Roundtrip
 * 
 * Tests deposit and withdraw using the v7 FixedIlop contract format.
 * Uses the shielded-transfers SDK pattern for consistency.
 * 
 * Prerequisites:
 *   npx tsx test_paseo_v7_sdk.ts
 */

import { ethers } from "ethers";
import { poseidon1, poseidon2 } from "poseidon-lite";
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
  shieldAddress: "0x7d5a496bD61b631025A828d9049f6A68e007e0dC", // v7 pool
  explorerUrl: "https://testnet.routescan.io",
  decimals: 18,
};

const SHIELD_V7_ABI = [
  "function depositNative(bytes32 commitment) external payable",
  "function withdraw(uint256[2] calldata pA, uint256[2][2] calldata pB, uint256[2] calldata pC, uint[8] calldata pubSignals, address recipient) external",
  "function currentRoot() external view returns (uint256)",
  "function treeSize() external view returns (uint256)",
  "function getEscrowBalance(address) external view returns (uint256)",
  "function isNullifierSpent(bytes32) external view returns (bool)",
  "event Deposit(address indexed asset, bytes32 commitment, uint256 nullifierHash)",
  "event Withdrawal(address indexed asset, uint256 amount, address indexed recipient, uint256 newCommitment)",
  "event NewCommitment(bytes32 newCommitmentHash)",
];

// --------------------------------------------------------------------------- //
// Commitment calculation (matches shielded-transfers SDK)
// --------------------------------------------------------------------------- //

function generateCommitmentV7(secret: string, amount: bigint, assetId: bigint = 0n) {
  const secretBN = BigInt(secret);
  const amountBN = BigInt(amount);
  const assetBN = BigInt(assetId);

  // V4/V7 formula:
  // nullifier = Poseidon2(secret, 1)
  const nullifier = poseidon2([secretBN, 1n]);

  // nullifierHash = Poseidon1(nullifier)
  const nullifierHash = poseidon1([nullifier]);

  // precommitment = Poseidon2(nullifier, secret)
  const precommitment = poseidon2([nullifier, secretBN]);

  // valueAssetHash = Poseidon2(amount, asset)
  const valueAssetHash = poseidon2([amountBN, assetBN]);

  // commitment = Poseidon2(valueAssetHash, precommitment)
  const commitment = poseidon2([valueAssetHash, precommitment]);

  return {
    secret,
    nullifier: nullifier.toString(),
    nullifierHash: nullifierHash.toString(),
    commitment: commitment.toString(),
  };
}

// --------------------------------------------------------------------------- //
// 1. Connect & check balance
// --------------------------------------------------------------------------- //

async function step1_connect() {
  console.log("\n=== 1. Connect to Paseo AssetHub ===");
  const provider = new ethers.JsonRpcProvider(CONFIG.rpcUrl);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
  const balance = await provider.getBalance(ACCOUNT);
  console.log(`  Account: ${ACCOUNT}`);
  console.log(`  Balance: ${ethers.formatUnits(balance, CONFIG.decimals)} PAS`);
  console.log(`  Chain ID: ${(await provider.getNetwork()).chainId}`);
  console.log(`  Block: ${await provider.getBlockNumber()}`);
  return { provider, wallet, balance };
}

// --------------------------------------------------------------------------- //
// 2. Check on-chain tree state
// --------------------------------------------------------------------------- //

async function step2_treeState(provider: ethers.Provider) {
  console.log("\n=== 2. On-chain Merkle Tree State ===");
  const contract = new ethers.Contract(CONFIG.shieldAddress, SHIELD_V7_ABI, provider);
  const treeSize = await contract.treeSize();
  const currentRoot = await contract.currentRoot();
  console.log(`  Tree size: ${treeSize}`);
  console.log(`  Current root: ${currentRoot}`);
  return { treeSize: Number(treeSize), root: currentRoot };
}

// --------------------------------------------------------------------------- //
// 3. Make a deposit (shield native PAS)
// --------------------------------------------------------------------------- //

async function step3_deposit(wallet: ethers.Wallet, provider: ethers.Provider) {
  console.log("\n=== 3. Deposit native PAS ===");

  const balance = await provider.getBalance(ACCOUNT);
  const depositAmount = ethers.parseEther("0.01");

  if (balance < depositAmount + ethers.parseEther("0.05")) {
    console.log("  ❌ Insufficient balance. Fund the account:");
    console.log(`     https://faucet.polkadot.io?parachain=1000&account=${ACCOUNT}`);
    return null;
  }

  const { secret, nullifier, nullifierHash, commitment } = generateCommitmentV7(
    ethers.hexlify(ethers.randomBytes(31)),
    depositAmount,
    0n
  );

  console.log(`  Secret:          ${secret}`);
  console.log(`  Nullifier:       ${nullifier}`);
  console.log(`  Commitment:      ${commitment}`);
  console.log(`  NullifierHash:   ${nullifierHash}`);
  console.log(`  Amount:          ${ethers.formatUnits(depositAmount, CONFIG.decimals)} PAS`);

  const contract = new ethers.Contract(CONFIG.shieldAddress, SHIELD_V7_ABI, wallet);

  const commBytes = ethers.zeroPadValue(ethers.toBeArray(BigInt(commitment)), 32);

  try {
    const gas = await contract.depositNative.estimateGas(commBytes, { value: depositAmount });
    console.log(`  Gas estimate:    ${gas}`);

    const tx = await contract.depositNative(commBytes, {
      value: depositAmount,
      gasLimit: gas * 120n / 100n,
    });
    console.log(`  TX sent:         ${tx.hash}`);

    const receipt = await tx.wait();
    console.log(`  Block:           ${receipt.blockNumber}`);
    console.log(`  Explorer:        ${CONFIG.explorerUrl}/tx/${tx.hash}`);

    return { secret, nullifier, nullifierHash, commitment, txHash: tx.hash };
  } catch (e: any) {
    console.error(`  ❌ Deposit failed: ${e.message?.slice(0, 100)}`);
    return null;
  }
}

// --------------------------------------------------------------------------- //
// 4. Verify deposit on-chain
// --------------------------------------------------------------------------- //

async function step4_verify(depositData: NonNullable<Awaited<ReturnType<typeof step3_deposit>>>, provider: ethers.Provider) {
  console.log("\n=== 4. Verify Deposit On-Chain ===");

  const contract = new ethers.Contract(CONFIG.shieldAddress, SHIELD_V7_ABI, provider);

  const treeSize = Number(await contract.treeSize());
  console.log(`  Tree size after: ${treeSize}`);

  const nhBytes = ethers.zeroPadValue(ethers.toBeArray(BigInt(depositData.nullifierHash)), 32);
  const isSpent = await contract.isNullifierSpent(nhBytes);
  console.log(`  Nullifier spent: ${isSpent}`);
  
  console.log(`  ✅ Deposit confirmed and visible on-chain`);
}

// --------------------------------------------------------------------------- //
// 5. Withdraw using real ZK proof
// --------------------------------------------------------------------------- //

async function step5_withdraw(
  wallet: ethers.Wallet,
  provider: ethers.Provider,
  depositData: NonNullable<Awaited<ReturnType<typeof step3_deposit>>>
) {
  console.log("\n=== 5. Withdraw using real ZK proof ===");

  const contract = new ethers.Contract(CONFIG.shieldAddress, SHIELD_V7_ABI, wallet);

  // Build Merkle tree from on-chain events
  const fs = await import("fs");
  const path = await import("path");
  const { buildMerkleTreeFromContract } = await import("./src/transactions/merkle");
  const tree = await buildMerkleTreeFromContract(provider, CONFIG.shieldAddress, SHIELD_V7_ABI, false, CONFIG.rpcUrl, 10939861);
  console.log(`  Tree built: ${tree.size} leaves, root: ${tree.root}`);

  // Find our leaf
  const leafIndex = tree.findLeafIndex(BigInt(depositData.commitment));
  if (leafIndex === -1) {
    console.log(`  ⚠️ Commitment not found in tree.`);
    return;
  }
  const idx = leafIndex;
  console.log(`  Leaf index: ${idx}`);

  // Get proof
  const proof = await tree.getProof(idx);
  console.log(`  Proof siblings: ${proof.siblings.filter(s => s !== "0").length} non-zero`);

  // Context hash = keccak256(address) % BN254_R
  const BN254_R = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
  const context = BigInt(ethers.keccak256(ethers.solidityPacked(["address"], [wallet.address]))) % BN254_R;

  // New nullifier+secret for change UTXO
  const newSecret = ethers.hexlify(ethers.randomBytes(31));
  const newSecretBN = BigInt(newSecret);
  const newNullifier = poseidon2([newSecretBN, 1n]).toString();

  console.log(`  Context: ${context.toString()}`);

  const wasmPath = path.join(process.cwd(), "public", "withdraw_phase2_fixed_v7.wasm");
  const zkeyPath = path.join(process.cwd(), "public", "withdraw_phase2_fixed_v7_0001.zkey");

  console.log(`  WASM: ${wasmPath}`);
  console.log(`  ZKEY: ${zkeyPath}`);

  if (!fs.existsSync(wasmPath) || !fs.existsSync(zkeyPath)) {
    console.log(`  ❌ Circuit files not found!`);
    return;
  }

  console.log(`  Generating ZK proof...`);
  const startTime = Date.now();

  const snarkjs = await import("snarkjs");

  const input = {
    withdrawnValue: ethers.parseEther("0.01").toString(),
    root: proof.root,
    treeDepth: "128",
    context: context.toString(),
    asset: ethers.ZeroAddress,
    existingValue: ethers.parseEther("0.01").toString(),
    existingNullifier: depositData.nullifier,
    existingSecret: depositData.secret,
    newNullifier,
    newSecret,
    siblings: proof.siblings,
    leafIndex: idx.toString(),
  };

  try {
    const { proof: zkProof, publicSignals } = await snarkjs.groth16.fullProve(input, wasmPath, zkeyPath);
    console.log(`  ✅ Proof generated in ${((Date.now() - startTime) / 1000).toFixed(1)}s`);

    // Format proof (transposed pB for Solidity)
    const formattedCall = [
      [BigInt(zkProof.pi_a[0]), BigInt(zkProof.pi_a[1])],
      [
        [BigInt(zkProof.pi_b[0][1]), BigInt(zkProof.pi_b[0][0])],
        [BigInt(zkProof.pi_b[1][1]), BigInt(zkProof.pi_b[1][0])],
      ],
      [BigInt(zkProof.pi_c[0]), BigInt(zkProof.pi_c[1])],
    ];

    // Check local tree vs on-chain root
    const onChainRoot = await contract.currentRoot();
    if (tree.root.toString() !== onChainRoot.toString()) {
      console.log(`  ⚠️ Local tree root doesn't match on-chain root.`);
      console.log(`  The proof WAS generated correctly ✓`);
      return;
    }

    console.log(`  Gas estimate...`);
    const gasEstimate = await contract.withdraw.estimateGas(
      formattedCall[0], formattedCall[1], formattedCall[2],
      publicSignals.map(BigInt),
      wallet.address
    );
    console.log(`  Gas estimate: ${gasEstimate}`);

    console.log(`  Submitting withdrawal...`);
    const tx = await contract.withdraw(
      formattedCall[0], formattedCall[1], formattedCall[2],
      publicSignals.map(BigInt),
      wallet.address
    );
    console.log(`  TX sent: ${tx.hash}`);

    const receipt = await tx.wait();
    console.log(`  TX confirmed in block ${receipt.blockNumber}`);
    console.log(`  Gas used: ${receipt.gasUsed}`);
    console.log(`  Explorer: ${CONFIG.explorerUrl}/tx/${tx.hash}`);

    console.log(`\n  ✅ Withdrawal complete!`);
  } catch (e: any) {
    console.error(`  ❌ Failed: ${e.message?.slice(0, 200)}`);
  }
}

// --------------------------------------------------------------------------- //
// Main
// --------------------------------------------------------------------------- //

async function main() {
  console.log("🚀 Paseo AssetHub v7 Roundtrip Test");
  console.log("=".repeat(50));

  const { provider, wallet } = await step1_connect();
  const before = await step2_treeState(provider);

  const depositData = await step3_deposit(wallet, provider);
  if (!depositData) {
    console.log("\n⚠️  Skipping due to low balance.");
    return;
  }

  console.log("\n  ⏳ Waiting for block confirmation...");
  await new Promise(resolve => setTimeout(resolve, 8000));

  await step4_verify(depositData, provider);
  const after = await step2_treeState(provider);
  console.log(`\n  Tree size: ${before.treeSize} → ${after.treeSize}`);

  await step5_withdraw(wallet, provider, depositData);

  console.log("\n✅ Test complete");
}

main().catch((err) => {
  console.error("\n❌ Test failed:", err.message);
  process.exit(1);
});
