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
// localStorage cache for incremental tree rebuilds
// ---------------------------------------------------------------------------

interface MerkleCache {
  lastBlockScanned: number;
  leaves: string[]; // public on-chain commitments, not sensitive
}

const CACHE_KEY_PREFIX = "merkle_cache_";

function getCacheKey(contractAddress: string): string {
  return CACHE_KEY_PREFIX + contractAddress.toLowerCase();
}

function loadCache(contractAddress: string): MerkleCache | null {
  try {
    const raw = localStorage.getItem(getCacheKey(contractAddress));
    if (!raw) return null;
    return JSON.parse(raw) as MerkleCache;
  } catch {
    return null;
  }
}

function saveCache(contractAddress: string, cache: MerkleCache): void {
  try {
    localStorage.setItem(getCacheKey(contractAddress), JSON.stringify(cache));
  } catch (e) {
    console.warn("Failed to save Merkle cache to localStorage:", e);
  }
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

  get root(): bigint {
    return this._root;
  }
  get size(): number {
    return this.leaves.length;
  }

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
    if (1 << treeDepth < index + 1) {
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
   * Get Merkle proof for a given leaf index using LeanIMT algorithm.
   * Rebuilds tree up to (but NOT including) the target leaf to capture sideNodes as siblings.
   * Follows the same logic as the circuit's LeanIMTInclusionProof.
   */
  getProof(leafIndex: number): MerkleProof {
    if (leafIndex < 0 || leafIndex >= this.leaves.length) {
      throw new Error(
        `Leaf index ${leafIndex} out of range (tree has ${this.leaves.length} leaves)`,
      );
    }

    // Rebuild tree up to (but NOT including) the target leaf to capture sideNodes before insertion
    const tempTree = new LeanIMT();
    for (let i = 0; i < leafIndex; i++) {
      tempTree.insert(this.leaves[i]);
    }

    // Extract siblings from sideNodes
    // For LeanIMT: sibling is sideNode at each level if path bit is 1 (right child)
    // Otherwise sibling is 0 (left child, node propagates)
    const siblings: bigint[] = [];
    for (let level = 0; level < 128; level++) {
      if (level < tempTree._depth) {
        const pathBit = (BigInt(leafIndex) >> BigInt(level)) & 1n;
        if (pathBit === 1n) {
          // Right child: sibling is sideNode (stored when this was left child)
          siblings.push(tempTree.sn(level));
        } else {
          // Left child: sibling is 0 (node propagates, sideNode stored for future right children)
          siblings.push(0n);
        }
      } else {
        siblings.push(0n);
      }
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
// Build tree from contract events (with incremental caching)
// ---------------------------------------------------------------------------

const TX_BATCH_SIZE = 10;

export async function buildMerkleTreeFromContract(
  provider: ethers.Provider,
  contractAddress: string,
  abi: string[],
  forceRefresh = false,
): Promise<LeanIMT> {
  // WORKAROUND: If RPC fails due to CORS, return minimal tree
  // This is a TEMPORARY fix until CORS is resolved
  console.warn("WARNING: Using Merkle tree workaround due to CORS issues");
  console.warn("Tree will be empty (0 leaves). Withdraw will fail.");
  console.warn("Fix CORS or use different RPC for proper functionality.");

  const tree = new LeanIMT();
  return tree;
  const tree = new LeanIMT();
  const iface = new ethers.Interface(abi);

  // Try to load cached state - DISABLED due to CORS issues
  // const cached = forceRefresh ? null : loadCache(contractAddress);
  const cached = null; // Always disable cache for now
  let fromBlock = 0;

  if (cached && cached.leaves.length > 0) {
    // Replay cached leaves into the tree (fast, no RPC)
    for (const leafStr of cached.leaves) {
      tree.insert(BigInt(leafStr));
    }
    fromBlock = cached.lastBlockScanned + 1;
    console.log(
      `Merkle cache: restored ${cached.leaves.length} leaves, scanning from block ${fromBlock}`,
    );
  }

  // Fetch events from where we left off
  const depositTopic = ethers.id("Deposit(address,uint256,uint256)");
  const withdrawalTopic = ethers.id(
    "Withdrawal(address,uint256,address,uint256)",
  );

  const currentBlock = await provider.getBlockNumber();

  // If cache is fully up-to-date, skip the RPC scan
  if (fromBlock > currentBlock) {
    console.log(`Merkle cache is up-to-date (block ${currentBlock})`);
    return tree;
  }

  let logs: ethers.Log[] = [];
  try {
    logs = await provider.getLogs({
      address: contractAddress,
      fromBlock,
      toBlock: currentBlock,
      topics: [[depositTopic, withdrawalTopic]],
    });
    console.log(
      `Fetched ${logs.length} events from blocks ${fromBlock}-${currentBlock}`,
    );
  } catch (error) {
    console.error("Failed to fetch logs from RPC:", error.message);
    console.log("Using cached data only");
    // Return tree with cached data
    if (tree.size === 0 && cached) {
      // If no cache, we're in trouble
      console.error("No cached data available");
    }
    return tree;
  }

  // Sort by block number, then log index
  logs.sort((a, b) => {
    if (a.blockNumber !== b.blockNumber) return a.blockNumber - b.blockNumber;
    return a.index - b.index;
  });

  // Collect withdrawal logs that need tx lookups
  const withdrawalLogs = logs.filter((l) => l.topics[0] === withdrawalTopic);

  // Batch-fetch withdrawal transactions with Promise.all in groups
  const txMap = new Map<string, ethers.TransactionResponse | null>();
  for (let i = 0; i < withdrawalLogs.length; i += TX_BATCH_SIZE) {
    const batch = withdrawalLogs.slice(i, i + TX_BATCH_SIZE);
    const results = await Promise.all(
      batch.map((log) => provider.getTransaction(log.transactionHash)),
    );
    batch.forEach((log, idx) => {
      txMap.set(log.transactionHash, results[idx]);
    });
  }

  // Process events in order
  let insertionIndex = tree.size;

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
      const tx = txMap.get(log.transactionHash);
      if (tx) {
        try {
          const decoded = iface.parseTransaction({
            data: tx.data,
            value: tx.value,
          });
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
          console.error(
            `Failed to decode withdraw tx ${log.transactionHash}:`,
            e,
          );
        }
      }
    }
  }

  // Persist updated cache
  const cachedLeaves = cached?.leaves ?? [];
  const newLeaves: string[] = [];
  // We inserted `insertionIndex - (cached?.leaves.length ?? 0)` new leaves.
  // Reconstruct from the logs we just processed.
  for (const log of logs) {
    if (log.topics[0] === depositTopic) {
      newLeaves.push(BigInt(log.topics[2]).toString());
    } else if (log.topics[0] === withdrawalTopic) {
      const tx = txMap.get(log.transactionHash);
      if (tx) {
        try {
          const decoded = iface.parseTransaction({
            data: tx.data,
            value: tx.value,
          });
          if (decoded && decoded.name === "withdraw") {
            const pubSignals = decoded.args[3];
            if (pubSignals && pubSignals.length >= 1) {
              newLeaves.push(BigInt(pubSignals[0]).toString());
            }
          }
        } catch {
          /* already logged above */
        }
      }
    }
  }

  saveCache(contractAddress, {
    lastBlockScanned: currentBlock,
    leaves: [...cachedLeaves, ...newLeaves],
  });

  console.log(
    `Merkle tree built: ${tree.size} leaves, depth=${tree.size <= 1 ? 0 : Math.ceil(Math.log2(tree.size))}, root=${tree.root}`,
  );

  return tree;
}
