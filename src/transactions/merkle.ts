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
      const sibIdx = idx % 2 === 0 ? idx + 1 : idx - 1;
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

    // Pad to circuit depth (128 for Paseo v3/v4 circuit)
    const PADDED_DEPTH = 128;
    while (siblings.length < PADDED_DEPTH) {
      siblings.push(0n);
    }

    return {
      siblings: siblings.map((s) => s.toString()),
      root: this._root.toString(),
      depth: this._depth,
      leafIndex,
    };
  }

  /**
   * Find leaf index by value (linear scan).
   */
  findLeafIndex(leaf: bigint): number {
    for (let i = 0; i < this.leaves.length; i++) {
      if (this.leaves[i] === leaf) return i;
    }
    return -1;
  }

  getLeaves(): bigint[] {
    return [...this.leaves];
  }
}

// ---------------------------------------------------------------------------
// Tree reconstruction from contract events (Deposit / Withdrawal)
// ---------------------------------------------------------------------------

const TX_BATCH_SIZE = 10;

/**
 * Builds a LeanIMT by scanning Deposit/Withdrawal events from the given contract.
 * Caches results in localStorage to avoid re-scanning the entire chain each time.
 */
export async function buildMerkleTreeFromContract(
  provider: ethers.Provider,
  contractAddress: string,
  abi: string[],
  forceRefresh = false,
  rpcEndpoint?: string,
  startBlock = 0,
): Promise<LeanIMT> {
  const tree = new LeanIMT();
  const iface = new ethers.Interface(abi);

  // Try to load cached state
  const cached = forceRefresh ? null : loadCache(contractAddress);
  let fromBlock = startBlock;

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
  // V5 contract signatures (bytecode_hash = "none" requires manual decoding)
  // Deposit(address indexed asset, bytes32 commitment, uint256 nullifierHash) — v5/v6
  // Deposit(address indexed asset, bytes32 commitment) — v7
  const depositTopic3 = ethers.id("Deposit(address,bytes32,uint256)");
  const depositTopic2 = ethers.id("Deposit(address,bytes32)");
  // Withdrawal(address indexed asset, uint256 amount, address indexed recipient, uint256 newCommitment)
  const withdrawalTopic = ethers.id(
    "Withdrawal(address,uint256,address,uint256)",
  );
  // NewCommitment(bytes32 newCommitmentHash)
  const newCommitmentTopic = ethers.id("NewCommitment(bytes32)");

  const currentBlock = await provider.getBlockNumber();

  // If cache is fully up-to-date, skip the RPC scan
  if (fromBlock > currentBlock) {
    console.log(`Merkle cache is up-to-date (block ${currentBlock})`);
    return tree;
  }

  let logs: ethers.Log[] = [];
  let effectiveProvider = provider;
  let effectiveBlock = currentBlock;

  // Helper to create a provider with CORS proxy
  const createProxyProvider = (endpoint: string) => {
    // Use local CORS proxy if endpoint matches known Paseo endpoint
    if (endpoint.includes("eth-asset-hub-paseo")) {
      return new ethers.JsonRpcProvider("http://localhost:3001");
    }
    // For other endpoints, try direct
    return new ethers.JsonRpcProvider(endpoint);
  };

  // If rpcEndpoint is provided, try using it (with proxy if needed)
  if (rpcEndpoint) {
    try {
      const proxyProvider = createProxyProvider(rpcEndpoint);
      effectiveProvider = proxyProvider;
      effectiveBlock = await proxyProvider.getBlockNumber();

      logs = await proxyProvider.getLogs({
        address: contractAddress,
        fromBlock,
        toBlock: effectiveBlock,
        topics: [[depositTopic3, depositTopic2, withdrawalTopic, newCommitmentTopic]],
      });
      console.log(
        `Using RPC endpoint ${rpcEndpoint}, fetched ${logs.length} events from blocks ${fromBlock}-${effectiveBlock}`,
      );
    } catch (endpointError) {
      console.error(
        `Failed with provided RPC endpoint ${rpcEndpoint}:`,
        (endpointError as Error).message,
      );
      // Fall back to original provider
    }
  }

  // If logs still empty, try with original provider
  if (logs.length === 0) {
    try {
      logs = await provider.getLogs({
        address: contractAddress,
        fromBlock,
        toBlock: currentBlock,
        topics: [[depositTopic3, depositTopic2, withdrawalTopic, newCommitmentTopic]],
      });
      console.log(
        `Fetched ${logs.length} events from blocks ${fromBlock}-${currentBlock} using wallet provider`,
      );
    } catch (error) {
      console.error(
        "Failed to fetch logs from wallet provider:",
        (error as Error).message,
      );
      console.log("Using cached data only");
      // Return tree with cached data
      if (tree.size === 0 && cached) {
        // If no cache, we're in trouble
        console.error("No cached data available");
      }
      return tree;
    }
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

  // Use effectiveProvider for transaction fetching
  const getTransactionWithFallback = async (txHash: string) => {
    try {
      return await effectiveProvider.getTransaction(txHash);
    } catch (error) {
      console.error(
        `Failed to get transaction ${txHash}:`,
        (error as Error).message,
      );
      return null;
    }
  };

  for (let i = 0; i < withdrawalLogs.length; i += TX_BATCH_SIZE) {
    const batch = withdrawalLogs.slice(i, i + TX_BATCH_SIZE);
    const results = await Promise.all(
      batch.map((log) => getTransactionWithFallback(log.transactionHash)),
    );
    batch.forEach((log, idx) => {
      txMap.set(log.transactionHash, results[idx]);
    });
  }

  // Process events in order
  let insertionIndex = tree.size;
  const insertedCommitments = new Set<string>(); // Track to avoid duplicates

  for (const log of logs) {
    if (log.topics[0] === depositTopic3 || log.topics[0] === depositTopic2) {
      // Deposit event — two formats: v5/v6 (3-param) and v7 (2-param)

      let commitment: bigint;
      if (log.data && log.data.length >= 66) {
        try {
          // Try v5/v6 format first: Deposit(address,bytes32,uint256)
          const ifaceDeposit = new ethers.Interface([
            "event Deposit(address indexed asset, bytes32 commitment, uint256 nullifierHash)",
          ]);
          const decoded = ifaceDeposit.decodeEventLog(
            "Deposit",
            log.data,
            log.topics,
          );
          commitment = BigInt(decoded[1]); // bytes32 commitment is second parameter
        } catch (decodeError) {
          // Try v7 format: Deposit(address,bytes32)
          try {
            const ifaceDepositV7 = new ethers.Interface([
              "event Deposit(address indexed asset, bytes32 commitment)",
            ]);
            const decoded = ifaceDepositV7.decodeEventLog(
              "Deposit",
              log.data,
              log.topics,
            );
            commitment = BigInt(decoded[1]); // bytes32 commitment
          } catch (decodeError2) {
            console.error("Failed to decode Deposit event:", decodeError2);
            // Fallback: extract first 32 bytes from data (commitment)
            const dataHex = log.data.startsWith("0x")
              ? log.data.slice(2)
              : log.data;
            if (dataHex.length >= 64) {
              const commitmentHex = "0x" + dataHex.slice(0, 64);
              commitment = BigInt(commitmentHex);
            } else {
              console.error("Cannot extract commitment from Deposit event");
              continue;
            }
          }
        }
      } else {
        console.error("Deposit event has no data or insufficient data");
        continue;
      }

      const commitmentStr = commitment.toString();
      if (insertedCommitments.has(commitmentStr)) {
        console.log(`Skipping duplicate commitment: ${commitmentStr}`);
        continue;
      }

      tree.insert(commitment);
      insertedCommitments.add(commitmentStr);
      console.log(
        `Merkle insert #${insertionIndex}: deposit commitment=${commitment} → root=${tree.root}`,
      );
      insertionIndex++;
    } else if (log.topics[0] === newCommitmentTopic) {
      // NewCommitment(bytes32) - emitted when withdrawing with change
      if (log.data && log.data.length >= 66) {
        try {
          const ifaceNewCommitment = new ethers.Interface([
            "event NewCommitment(bytes32)",
          ]);
          const decoded = ifaceNewCommitment.decodeEventLog(
            "NewCommitment",
            log.data,
            log.topics,
          );
          const newCommitment = BigInt(decoded[0]); // bytes32 is first parameter
          const newCommitmentStr = newCommitment.toString();
          if (insertedCommitments.has(newCommitmentStr)) {
            console.log(
              `Skipping duplicate commitment from NewCommitment: ${newCommitmentStr}`,
            );
            continue;
          }

          tree.insert(newCommitment);
          insertedCommitments.add(newCommitmentStr);
          console.log(
            `Merkle insert #${insertionIndex}: new commitment from withdrawal=${newCommitment} → root=${tree.root}`,
          );
          insertionIndex++;
        } catch (decodeError) {
          console.error("Failed to decode NewCommitment event:", decodeError);
          // Fallback
          const dataHex = log.data.startsWith("0x")
            ? log.data.slice(2)
            : log.data;
          if (dataHex.length >= 64) {
            const commitmentHex = "0x" + dataHex.slice(0, 64);
            tree.insert(BigInt(commitmentHex));
            insertionIndex++;
          }
        }
      }
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
              const newCommitmentHashStr = newCommitmentHash.toString();
              if (insertedCommitments.has(newCommitmentHashStr)) {
                console.log(
                  `Skipping duplicate commitment from withdrawal tx: ${newCommitmentHashStr}`,
                );
                continue;
              }

              tree.insert(newCommitmentHash);
              insertedCommitments.add(newCommitmentHashStr);
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
    if (log.topics[0] === depositTopic3 || log.topics[0] === depositTopic2) {
      // Extract commitment from Deposit event
      let commitmentStr: string;
      try {
        const ifaceDeposit = new ethers.Interface([
          "event Deposit(address indexed asset, bytes32 commitment, uint256 nullifierHash)",
        ]);
        const decoded = ifaceDeposit.decodeEventLog(
          "Deposit",
          log.data,
          log.topics,
        );
        commitmentStr = BigInt(decoded[1]).toString(); // bytes32 commitment
      } catch {
        // Fallback
        if (log.data && log.data.length >= 66) {
          const dataHex = log.data.startsWith("0x")
            ? log.data.slice(2)
            : log.data;
          if (dataHex.length >= 64) {
            commitmentStr = BigInt("0x" + dataHex.slice(0, 64)).toString();
          } else {
            continue;
          }
        } else {
          continue;
        }
      }
      newLeaves.push(commitmentStr);
    } else if (log.topics[0] === newCommitmentTopic) {
      // Extract new commitment from NewCommitment event
      try {
        const ifaceNewCommitment = new ethers.Interface([
          "event NewCommitment(bytes32)",
        ]);
        const decoded = ifaceNewCommitment.decodeEventLog(
          "NewCommitment",
          log.data,
          log.topics,
        );
        newLeaves.push(BigInt(decoded[0]).toString());
      } catch {
        // Fallback
        if (log.data && log.data.length >= 66) {
          const dataHex = log.data.startsWith("0x")
            ? log.data.slice(2)
            : log.data;
          if (dataHex.length >= 64) {
            newLeaves.push(BigInt("0x" + dataHex.slice(0, 64)).toString());
          }
        }
      }
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
