/*
 * Copyright 2025 Kusama Shield Developers on behalf of the Kusama DAO, see LICENSE in main folder.
 *
 * Client-side LeanIMT reconstruction from on-chain events/calldata.
 * Used to generate Merkle proofs for the FixedIlop withdraw circuit.
 *
 * The insert() logic is a direct 1:1 port of InternalLeanIMT.sol _insert().
 * Uses poseidon-lite for hashing (matches circomlib Poseidon used by the circuit).
 *
 * IMPORTANT: The on-chain Poseidon contract MUST use the same Poseidon as
 * circomlib (i.e. PoseidonT3 from poseidon-solidity). If it doesn't, the
 * locally-computed root will not match the on-chain root, and proofs will
 * fail on-chain validation.
 */

import { ethers } from "ethers";
import { poseidon2 } from "poseidon-lite";

export interface MerkleProof {
  siblings: string[];
  root: string;
  depth: number;
  leafIndex: number;
}

// ---------------------------------------------------------------------------
// LeanIMT — mirrors InternalLeanIMT.sol exactly
// Uses poseidon-lite (matches circomlib / poseidon-solidity PoseidonT3)
// ---------------------------------------------------------------------------

export class LeanIMT {
  private leaves: bigint[] = [];
  // sideNodes mirrors the Solidity mapping(uint256 => uint256).
  // Unset positions are implicitly 0n.
  private _sideNodes = new Map<number, bigint>();
  private _depth: number = 0;
  private _root: bigint = 0n;

  get root(): bigint { return this._root; }
  get size(): number { return this.leaves.length; }

  private sn(level: number): bigint {
    return this._sideNodes.get(level) ?? 0n;
  }

  /**
   * Insert a leaf — direct port of InternalLeanIMT.sol _insert().
   *
   *   uint256 index = self.size;
   *   if (2**treeDepth < index+1) ++treeDepth;
   *   for level in 0..treeDepth:
   *       if right child: node = hash(sideNodes[level], node)
   *       else:           sideNodes[level] = node
   *   sideNodes[treeDepth] = node;          // ← root
   */
  insert(leaf: bigint): void {
    const index = this.leaves.length;
    let treeDepth = this._depth;

    // Depth increase check (matches Solidity 2**treeDepth < index+1)
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
        // Left child: store side node, propagate node upward unchanged
        this._sideNodes.set(level, node);
      }
    }

    this._sideNodes.set(treeDepth, node);
    this._root = node;
    this.leaves.push(leaf);
  }

  /**
   * Get Merkle proof for a given leaf index.
   * Rebuilds the tree layer-by-layer from the stored leaves to extract
   * the sibling at each level.  Pads to 254 siblings for the circuit.
   */
  getProof(leafIndex: number): MerkleProof {
    if (leafIndex < 0 || leafIndex >= this.leaves.length) {
      throw new Error(
        `Leaf index ${leafIndex} out of range (tree has ${this.leaves.length} leaves)`,
      );
    }

    const siblings: bigint[] = [];
    let currentLayer = [...this.leaves];
    let idx = leafIndex;

    for (let level = 0; level < this._depth; level++) {
      // Sibling of idx at this level
      const sibIdx = (idx % 2 === 0) ? idx + 1 : idx - 1;
      siblings.push(
        sibIdx >= 0 && sibIdx < currentLayer.length ? currentLayer[sibIdx] : 0n,
      );

      // Build next layer
      const nextLayer: bigint[] = [];
      for (let i = 0; i < currentLayer.length; i += 2) {
        if (i + 1 < currentLayer.length) {
          nextLayer.push(poseidon2([currentLayer[i], currentLayer[i + 1]]));
        } else {
          nextLayer.push(currentLayer[i]); // odd node propagates
        }
      }
      currentLayer = nextLayer;
      idx = Math.floor(idx / 2);
    }

    // Pad to 254 for the Withdraw(254) circuit
    while (siblings.length < 254) {
      siblings.push(0n);
    }

    return {
      siblings: siblings.map((s) => s.toString()),
      root: this._root.toString(),
      depth: this._depth,
      leafIndex,
    };
  }

  findLeafIndex(leaf: bigint): number {
    return this.leaves.findIndex((l) => l === leaf);
  }
}

// ---------------------------------------------------------------------------
// Build tree from contract events
// ---------------------------------------------------------------------------

export async function buildMerkleTreeFromContract(
  provider: ethers.Provider,
  contractAddress: string,
  abi: string[],
): Promise<LeanIMT> {
  const tree = new LeanIMT();
  const iface = new ethers.Interface(abi);

  // Fetch all relevant events
  const depositTopic = ethers.id("Deposit(address,uint256,uint256)");
  const withdrawalTopic = ethers.id("Withdrawal(address,uint256,address,uint256)");

  const currentBlock = await provider.getBlockNumber();

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

  // Process events in order
  let insertionIndex = 0;

  for (const log of logs) {
    if (log.topics[0] === depositTopic) {
      // Deposit(address indexed asset, uint256 amount, uint256 indexed commitment)
      // topics[0]=sig  topics[1]=asset  topics[2]=commitment
      const commitment = BigInt(log.topics[2]);
      tree.insert(commitment);
      console.log(
        `Merkle insert #${insertionIndex}: deposit commitment=${commitment} → root=${tree.root}`,
      );
      insertionIndex++;
    } else if (log.topics[0] === withdrawalTopic) {
      // Withdrawal — extract newCommitmentHash from the withdraw() calldata
      const tx = await provider.getTransaction(log.transactionHash);
      if (tx) {
        try {
          const decoded = iface.parseTransaction({ data: tx.data, value: tx.value });
          if (decoded && decoded.name === "withdraw") {
            // withdraw(uint256[2] a, uint256[2][2] b, uint256[2] c,
            //          uint256[6] pubSignals, address asset, address recipient)
            const pubSignals = decoded.args[3];
            if (pubSignals && pubSignals.length >= 1) {
              const newCommitmentHash = BigInt(pubSignals[0]);
              tree.insert(newCommitmentHash);
              console.log(
                `Merkle insert #${insertionIndex}: withdrawal newCommitment=${newCommitmentHash} → root=${tree.root}`,
              );
              insertionIndex++;
            } else {
              console.error(
                `Could not extract pubSignals from withdraw tx ${log.transactionHash}`,
              );
            }
          }
        } catch (e) {
          console.error(`Failed to decode withdraw tx ${log.transactionHash}:`, e);
        }
      }
    }
  }

  console.log(
    `Merkle tree built: ${tree.size} leaves, depth=${tree.size <= 1 ? 0 : Math.ceil(Math.log2(tree.size))}, root=${tree.root}`,
  );

  return tree;
}
