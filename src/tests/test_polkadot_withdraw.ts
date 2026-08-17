/**
 * Polkadot v7 Withdraw: ZK proof generation + revive.call for Substrate signing.
 *
 * Usage: npx tsx src/tests/test_polkadot_withdraw.ts
 *
 * Uses FORWARDER_SEED from .env. Deposits must already be in-tree
 * (run test_polkadot_deposit.ts first, then wait ~30s for events to index).
 */

import { ethers } from "ethers";
import * as snarkjs from "snarkjs";
import { poseidon1, poseidon2 } from "poseidon-lite";
import { ApiPromise, WsProvider } from "@polkadot/api";
import { Keyring } from "@polkadot/keyring";
import { cryptoWaitReady } from "@polkadot/util-crypto";
import * as dotenv from "dotenv";
import * as path from "path";
import * as fs from "fs";
dotenv.config();

// =========================================================================== //
// Config
// =========================================================================== //

const CONTRACT = "0x0D694Da746e73D1e255c1894F90e38170db45809";
const EVM_RPC = "https://polkadot-assethub-rpc.laissez-faire.trade";
const WS_RPC = "wss://asset-hub-polkadot-rpc.n.dwellir.com";
const DEPLOYMENT_BLOCK = 18697500;
const BN254_R = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
const RECIPIENT = "0x74e539fc4607eae6d4383dac7bbf7124159f3ed3"; // forwarder H160

// =========================================================================== //
// Deposit note — from test_polkadot_deposit.ts output
// =========================================================================== //

const DEPOSIT = {
  secret: "0xd8d6a67c32527f05859d4b6f82a36f7cae655b8434eebf2cb03b1606c7aa97",
  commitment: "0x00180ec2cbe4d42c2d801e623d78e59f5cda017bcbc8357bc0eb81faf8d1b8f2",
  amount: "1000000000000000000",
  assetId: 0,
};

// =========================================================================== //
// Commitment helper (must match deposit script exactly)
// =========================================================================== //

function recomputeCommitment(secretHex: string, amountStr: string, assetId: number) {
  const secretBN = BigInt(secretHex);
  const nullifier = poseidon2([secretBN, 1n]);
  const nullifierHash = poseidon1([nullifier]);
  const precommitment = poseidon2([nullifier, secretBN]);
  const valueAssetHash = poseidon2([BigInt(amountStr), BigInt(assetId)]);
  const commitment = poseidon2([valueAssetHash, precommitment]);
  return {
    secret: secretHex,
    nullifier: nullifier.toString(),
    nullifierHash: nullifierHash.toString(),
    commitment: commitment.toString(),
  };
}

// =========================================================================== //
// Simple tree builder — fetches Deposit + NewCommitment events from EVM logs
// =========================================================================== //

interface LogEvent { blockNumber: number; logIndex: number; leaf: bigint; }

async function buildTree(provider: ethers.Provider, startBlock: number) {
  const depositTopic = ethers.id("Deposit(address,bytes32)");
  const newCommitmentTopic = ethers.id("NewCommitment(bytes32)");

  console.log(`Fetching logs from block ${startBlock}...`);
  const logs = await provider.getLogs({
    address: CONTRACT,
    fromBlock: startBlock,
    toBlock: "latest",
    topics: [[depositTopic, newCommitmentTopic]],
  });

  // Sort by (blockNumber, logIndex)
  const events: LogEvent[] = [];
  for (const log of logs) {
    if (log.topics[0] === depositTopic || log.topics[0] === newCommitmentTopic) {
      events.push({
        blockNumber: log.blockNumber,
        logIndex: log.index,
        leaf: BigInt(log.data),
      });
    }
  }
  events.sort((a, b) => a.blockNumber !== b.blockNumber ? a.blockNumber - b.blockNumber : a.logIndex - b.logIndex);

  // Build from leaves
  interface TreeState {
    leaves: bigint[];
    sideNodes: Map<number, bigint>;
    root: bigint;
    depth: number;
  }
  const tree: TreeState = { leaves: [], sideNodes: new Map(), root: 0n, depth: 0 };

  for (const ev of events) {
    if (ev.leaf === 0n) continue;
    const index = tree.leaves.length;
    tree.leaves.push(ev.leaf);

    // Update depth
    let d = tree.depth;
    while ((1n << BigInt(d)) < BigInt(index + 1)) d++;
    tree.depth = d;

    let node = ev.leaf;
    for (let level = 0; level < d; level++) {
      const key = level;
      if ((index >> level) & 1) {
        // Right child: hash(sideNode, node)
        const sideNode = tree.sideNodes.get(key) ?? 0n;
        node = poseidon2([sideNode, node]);
        tree.sideNodes.delete(key);
      } else {
        // Left child: store node, propagate unchanged
        tree.sideNodes.set(key, node);
        break;
      }
    }
    tree.root = node;
  }

  console.log(`  Inserted ${tree.leaves.length} leaves, root: ${tree.root}`);

  // Merkle proof helper
  function getProof(leafIndex: number) {
    // Rebuild tree layer by layer
    const layers: bigint[][] = [tree.leaves.slice()];
    for (let level = 0; level < 128 && layers[level].length > 1; level++) {
      const current = layers[level];
      const next: bigint[] = [];
      for (let i = 0; i < current.length; i += 2) {
        if (i + 1 < current.length) {
          next.push(poseidon2([current[i], current[i + 1]]));
        } else {
          next.push(current[i]);
        }
      }
      layers.push(next);
    }

    const siblings: string[] = [];
    let idx = leafIndex;
    for (let level = 0; level < layers.length - 1 && level < 128; level++) {
      const current = layers[level];
      const sib = (idx % 2 === 0) ? (idx + 1 < current.length ? current[idx + 1] : 0n) : current[idx - 1];
      siblings.push(sib.toString());
      idx = Math.floor(idx / 2);
    }
    while (siblings.length < 128) siblings.push("0");

    return { siblings, root: tree.root.toString(), leafIndex };
  }

  function findLeafIndex(leaf: bigint) {
    return tree.leaves.findIndex(l => l === leaf);
  }

  return { tree, getProof, findLeafIndex, getLeaves: () => tree.leaves, getRoot: () => tree.root };
}

// =========================================================================== //
// Main
// =========================================================================== //

async function main() {
  await cryptoWaitReady();

  const seed = process.env.FORWARDER_SEED;
  if (!seed) throw new Error("Set FORWARDER_SEED in .env");

  const keyring = new Keyring({ type: "sr25519" });
  const pair = keyring.addFromUri(seed);
  const ss58Address = pair.address;
  console.log("=== Polkadot v7 Withdraw ===");
  console.log("Forwarder SS58:", ss58Address);

  // Recompute commitment to verify deposit note
  const dep = recomputeCommitment(DEPOSIT.secret, DEPOSIT.amount, DEPOSIT.assetId);
  console.log("\nDeposit note check:");
  console.log(`  expected commitment: ${DEPOSIT.commitment}`);
  console.log(`  recomputed:          ${"0x" + dep.commitment.padStart(64, "0")}`);
  if (dep.commitment !== BigInt(DEPOSIT.commitment).toString()) {
    console.log("  ❌ Commitment mismatch! Secret/amount don't match.");
    return;
  }
  console.log("  ✅ Commitment verified");

  // ======================================================================= //
  // 1. Build Merkle tree from on-chain events
  // ======================================================================= //

  const provider = new ethers.JsonRpcProvider(EVM_RPC);
  console.log("\n— Merkle Tree —");

  const currentBlock = await provider.getBlockNumber();
  console.log(`Current block: ${currentBlock}`);

  const { getProof, findLeafIndex, getRoot } = await buildTree(provider, DEPLOYMENT_BLOCK);

  const onChainRoot = BigInt(await provider.call({
    to: CONTRACT,
    data: "0xfdab463d", // currentRoot()
  }));
  const localRoot = getRoot();
  console.log(`Chain root:  ${onChainRoot}`);
  console.log(`Local root:  ${localRoot}`);
  console.log(`Root match:  ${localRoot === onChainRoot ? "✅" : "❌ (trees may have synced past our scan)"}`);

  const commitmentBN = BigInt(DEPOSIT.commitment);
  const leafIdx = findLeafIndex(commitmentBN);
  if (leafIdx === -1) {
    console.log("\n❌ Commitment not found in tree. Wait for events to index and retry.");
    return;
  }
  console.log(`Leaf index:  ${leafIdx}`);

  const merkleProof = getProof(leafIdx);
  console.log(`Siblings:    ${merkleProof.siblings.length} (${merkleProof.siblings.filter((s: string) => s !== "0").length} non-zero)`);

  // ======================================================================= //
  // 2. Generate ZK proof (v7) via snarkjs
  // ======================================================================= //

  console.log("\n— ZK Proof —");
  const wasmPath = path.join(process.cwd(), "public", "withdraw_phase2_fixed_v7.wasm");
  const zkeyPath = path.join(process.cwd(), "public", "withdraw_phase2_fixed_v7_0001.zkey");
  if (!fs.existsSync(wasmPath) || !fs.existsSync(zkeyPath)) {
    console.log("  ❌ Circuit files missing:", wasmPath, zkeyPath);
    return;
  }

  // Context = keccak256(recipient) % BN254_R
  const context = BigInt(ethers.keccak256(ethers.solidityPacked(["address"], [RECIPIENT]))) % BN254_R;
  const newSecret = ethers.hexlify(ethers.randomBytes(31));
  const newNullifier = poseidon2([BigInt(newSecret), 1n]).toString();

  const circuitInput = {
    withdrawnValue: DEPOSIT.amount,
    root: merkleProof.root,
    treeDepth: "128",
    context: context.toString(),
    asset: "0x0000000000000000000000000000000000000000",
    existingValue: DEPOSIT.amount,
    existingNullifier: dep.nullifier,
    existingSecret: BigInt(DEPOSIT.secret).toString(),
    newNullifier,
    newSecret: BigInt(newSecret).toString(),
    siblings: merkleProof.siblings,
    leafIndex: leafIdx.toString(),
  };

  console.log("  proving...");
  const t0 = Date.now();
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(circuitInput, wasmPath, zkeyPath);
  console.log(`  ✅ ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  // Format proof — pB transposed for Solidity
  const formattedProof = [
    [BigInt(proof.pi_a[0]), BigInt(proof.pi_a[1])],
    [
      [BigInt(proof.pi_b[0][1]), BigInt(proof.pi_b[0][0])],
      [BigInt(proof.pi_b[1][1]), BigInt(proof.pi_b[1][0])],
    ],
    [BigInt(proof.pi_c[0]), BigInt(proof.pi_c[1])],
  ];

  const hexPubSignals = publicSignals.map((s: string) => BigInt(s).toString(16).padStart(64, "0"));
  console.log("Public signals:", hexPubSignals.join("|"));

  // ======================================================================= //
  // 3. Build EVM calldata and wrap in revive.call
  // ======================================================================= //

  console.log("\n— Withdraw —");

  // ABI: withdraw(uint256[2] pA, uint256[2][2] pB, uint256[2] pC, uint[8] pubSignals, address recipient)
  const withdrawIface = new ethers.Interface([
    "function withdraw(uint256[2] calldata pA, uint256[2][2] calldata pB, uint256[2] calldata pC, uint[8] calldata pubSignals, address recipient) external",
  ]);
  const evmCallData = withdrawIface.encodeFunctionData("withdraw", [
    formattedProof[0],
    formattedProof[1],
    formattedProof[2],
    publicSignals.map((s: string) => BigInt(s)),
    RECIPIENT,
  ]);
  console.log("Calldata:", evmCallData.substring(0, 80) + "...");

  // Connect WS
  const wsProvider = new WsProvider(WS_RPC);
  const api = await ApiPromise.create({ provider: wsProvider });

  try {
    // Check balance
    const accountInfo: any = await api.query.system.account(ss58Address);
    const free = accountInfo.data.free;
    console.log("DOT Balance:", (Number(free.toString()) / 1e10).toFixed(4));
    console.log("Nonce:", accountInfo.nonce.toString());

    // Build revive.call — value=0 for withdraw
    if (!api.tx.revive?.call) throw new Error("revive.call not available");
    const tx = api.tx.revive.call(
      CONTRACT,
      "0",                    // no value transfer
      { refTime: 200_000_000_000n, proofSize: 0n },
      null,
      evmCallData,
    );

    console.log("\nrevive.call Tx hex:", tx.method.toHex());
    console.log("\n=== Signing & Submitting ===");

    const hash = await new Promise<string>((resolve, reject) => {
      tx.signAndSend(pair, ({ status, events, txHash }: any) => {
        console.log("Status:", status.type, "Hash:", txHash?.toHex());
        if (status.isInBlock) {
          console.log("✅ Included in block!");
          resolve(txHash.toHex());
        } else if (status.isFinalized) {
          console.log("✅ Finalized!");
          resolve(txHash.toHex());
        } else if (status.isInvalid) {
          reject(new Error("Tx invalid"));
        }
      }).catch(reject);
    });

    console.log("\nTransaction hash:", hash);

    const accountInfo2: any = await api.query.system.account(ss58Address);
    const free2 = accountInfo2.data.free;
    console.log("New DOT balance:", (Number(free2.toString()) / 1e10).toFixed(4));
    console.log("Cost:", ((Number(free.toString()) - Number(free2.toString())) / 1e10).toFixed(8), "DOT");

  } finally {
    await api.disconnect();
    wsProvider.disconnect();
    process.exit(0);
  }
}

main().catch(e => { console.error("Fatal:", e); process.exit(1); });