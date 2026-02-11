/*
 * Copyright 2025 Kusama Shield Developers on behalf of the Kusama DAO, see LICENSE in main folder.
 *
 * Client-side LeanIMT reconstruction from on-chain events/calldata.
 * Used to generate Merkle proofs for the FixedIlop withdraw circuit.
 */

import { ethers } from "ethers";
import { poseidon2 } from "poseidon-lite";

export interface MerkleProof {
  siblings: string[];
  root: string;
  depth: number;
  leafIndex: number;
}

// LeanIMT — mirrors InternalLeanIMT.sol logic
// Binary Merkle tree with Poseidon2 hashing, dynamic depth, no zero-hashes.
export class LeanIMT {
  private leaves: bigint[] = [];
  private sideNodes: bigint[] = [];
  private depth: number = 0;
  private _root: bigint = 0n;

  get root(): bigint {
    return this._root;
  }

  get size(): number {
    return this.leaves.length;
  }

  // Insert a leaf into the tree (mirrors _insert in InternalLeanIMT.sol)
  insert(leaf: bigint): void {
    let node = leaf;
    let index = this.leaves.length;

    // If tree was empty, just set root
    if (index === 0) {
      this.leaves.push(leaf);
      this._root = leaf;
      this.sideNodes = [];
      this.depth = 0;
      return;
    }

    // Check if we need to increase depth
    // Tree can hold 2^depth leaves. If index >= 2^depth, we need more depth.
    let currentCapacity = 1 << this.depth;
    if (index >= currentCapacity) {
      // Need to increase depth — the old root becomes a side node
      this.sideNodes.push(this._root);
      this.depth += 1;
    }

    // Walk up the tree, hashing with side nodes
    for (let level = 0; level < this.depth; level++) {
      if ((index >> level) & 1) {
        // Right child: hash(sideNode, node)
        node = poseidon2([this.sideNodes[level], node]);
      } else {
        // Left child: update side node and propagate
        this.sideNodes[level] = node;
        // The rest of the path just propagates node upward
        // For a left insertion, remaining levels use the node as-is
        // until we reach a level where the bit is 1
        // Actually, for left child at this level, we need to just set sideNode
        // and continue — but the node stays as-is for next level
        // This is because the right subtree doesn't exist yet at this position
        // In the LeanIMT, if a node has no sibling, it propagates up directly
        let remaining = node;
        for (let j = level + 1; j < this.depth; j++) {
          if ((index >> j) & 1) {
            remaining = poseidon2([this.sideNodes[j], remaining]);
          } else {
            this.sideNodes[j] = remaining;
            // Keep going up
          }
        }
        this._root = remaining;
        this.leaves.push(leaf);
        return;
      }
    }

    this._root = node;
    this.leaves.push(leaf);
  }

  // Get Merkle proof for a given leaf index (for the withdraw circuit)
  // Returns 254 siblings (padded with 0s for unused levels)
  getProof(leafIndex: number): MerkleProof {
    if (leafIndex < 0 || leafIndex >= this.leaves.length) {
      throw new Error(`Leaf index ${leafIndex} out of range (tree has ${this.leaves.length} leaves)`);
    }

    const siblings: bigint[] = [];
    const treeSize = this.leaves.length;

    // Rebuild the full tree layer by layer to extract the proof path
    let currentLayer = [...this.leaves];

    for (let level = 0; level < this.depth; level++) {
      const nextLayer: bigint[] = [];
      let proofIndex = leafIndex >> level;
      const siblingIndex = proofIndex ^ 1; // XOR to get sibling

      if (siblingIndex < currentLayer.length) {
        siblings.push(currentLayer[siblingIndex]);
      } else {
        // No sibling (odd node) — in LeanIMT, node propagates up
        siblings.push(0n);
      }

      // Build next layer
      for (let i = 0; i < currentLayer.length; i += 2) {
        if (i + 1 < currentLayer.length) {
          nextLayer.push(poseidon2([currentLayer[i], currentLayer[i + 1]]));
        } else {
          // Odd node propagates up directly
          nextLayer.push(currentLayer[i]);
        }
      }

      currentLayer = nextLayer;
    }

    // Pad siblings to 254
    while (siblings.length < 254) {
      siblings.push(0n);
    }

    return {
      siblings: siblings.map((s) => s.toString()),
      root: this._root.toString(),
      depth: this.depth,
      leafIndex,
    };
  }

  // Find the index of a leaf value
  findLeafIndex(leaf: bigint): number {
    return this.leaves.findIndex((l) => l === leaf);
  }
}

// Build Merkle tree by parsing all contract transactions in block order
// Extracts commitments from deposit() calls and newCommitmentHash from withdraw() pubSignals[0]
export async function buildMerkleTreeFromContract(
  provider: ethers.Provider,
  contractAddress: string,
  abi: string[],
): Promise<LeanIMT> {
  const tree = new LeanIMT();
  const iface = new ethers.Interface(abi);

  // Get all transactions to the contract from genesis
  // We use getLogs to find Deposit and Withdrawal events, then decode calldata
  const depositTopic = ethers.id("Deposit(address,uint256,uint256)");
  const withdrawalTopic = ethers.id("Withdrawal(address,uint256,address,uint256)");

  const currentBlock = await provider.getBlockNumber();

  // Query all relevant events
  const logs = await provider.getLogs({
    address: contractAddress,
    fromBlock: 0,
    toBlock: currentBlock,
    topics: [[depositTopic, withdrawalTopic]],
  });

  // Sort by block number, then log index
  logs.sort((a, b) => {
    if (a.blockNumber !== b.blockNumber) return a.blockNumber - b.blockNumber;
    return a.index - b.index;
  });

  for (const log of logs) {
    if (log.topics[0] === depositTopic) {
      // Deposit(address indexed asset, uint256 amount, uint256 indexed commitment)
      // Only asset and commitment are indexed — amount is in data
      // topics[0]=sig, topics[1]=asset, topics[2]=commitment
      const commitment = BigInt(log.topics[2]);
      tree.insert(commitment);
    } else if (log.topics[0] === withdrawalTopic) {
      // Withdrawal event — we need to get the newCommitmentHash from tx calldata
      // Withdrawal(address indexed asset, address indexed recipient, uint256 indexed amount)
      // The newCommitment is pubSignals[0] from the withdraw() call
      const tx = await provider.getTransaction(log.transactionHash);
      if (tx) {
        try {
          const decoded = iface.parseTransaction({ data: tx.data, value: tx.value });
          if (decoded && decoded.name === "withdraw") {
            // pubSignals is the 4th argument (index 3), and newCommitmentHash is pubSignals[0]
            const pubSignals = decoded.args[3];
            const newCommitmentHash = BigInt(pubSignals[0]);
            tree.insert(newCommitmentHash);
          }
        } catch (e) {
          console.error(`Failed to decode withdraw tx ${log.transactionHash}:`, e);
        }
      }
    }
  }

  return tree;
}
