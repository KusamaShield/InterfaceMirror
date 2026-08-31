/*
 * Copyright 2025 Kusama Shield Developers on behalf of the Kusama DAO, see LICENSE in main folder.
 *
 * ZK proof generation for Paseo Asset Hub Phase 2 fixed circuit.
 * Uses snarkjs via Web Worker for proof generation to avoid blocking UI.
 */

import { ethers } from "ethers";
import { poseidon1, poseidon2, poseidon3 } from "poseidon-lite";
import worker from "../workers/snarkjs-client";

export const USE_WASMSNARK = false;

// ============================================================================
// Contract Addresses - Paseo Asset Hub (Testnet)
// ============================================================================

export const PASEO_ASSETHUB = {
  // V7 Pool Contracts (deployed 2026-07-20)
  pool: "0xbcE09D4De052b2816df1285663ac89528DF45380",
  verifier: "0xcA4cBc5d31eccd08d393C43aF492F729FF30b685",
  poseidonT3: "0x1d165f6fE5A30422E0E2140e91C8A9B800380637",
  
  // Polkadot Mainnet V7 Pool (redeployed 2026-07-26 with circomlibjs hasher)
  polkadot_pool: "0x0D694Da746e73D1e255c1894F90e38170db45809",
  polkadot_verifier: "0x6A13781E43AEA21918120CD0E7a2ed8614c01e14",
  polkadot_poseidonT3: "0xB8F0C6679D6Cc56450470522Bd96573C3D615052",
  
  // Legacy/Other contracts
  westend_pool: "0x5F1609148E04eaA36d5dDDEd19114b191b3eEBD",
};

// Pool ABI - includes both withdraw() and proxy_withdraw()
export const POOL_ABI = [
  // Events
  "event Deposit(address indexed asset, bytes32 commitment, uint256 nullifierHash)",
  "event Withdrawal(address indexed asset, uint256 amount, address indexed recipient, uint256 newCommitment)",
  "event NewCommitment(bytes32 newCommitmentHash)",
  
  // Read functions
  "function currentRoot() view returns (uint256)",
  "function treeSize() view returns (uint256)",
  "function isDepositSpent(bytes32 nullifierHash) view returns (bool)",
  "function getEscrowBalance(address asset) view returns (uint256)",
  "function deposits(bytes32 nullifierHash) view returns (address asset, uint256 assetId, uint256 amount, bool isSpent)",
  
  // Write functions
  "function depositNative(bytes32 commitment, bytes32 nullifierHash) external payable",
  "function withdraw(uint256[2] pA, uint256[2][2] pB, uint256[2] pC, uint256[7] pubSignals, address asset, uint256 amount, address recipient) external",
  "function proxy_withdraw(uint256[2] pA, uint256[2][2] pB, uint256[2] pC, uint256[7] pubSignals, address asset, uint256 amount, address recipient) external",
];

// Legacy export for compatibility
export const westend_pool = "0x5F1609148E04eaA36d5dDDEd19114b191b3eEBD";

const BN254_R =
  21888242871839275222246405745257275088548364400416034343698204186575808495617n;

function toEthHex(input: string | bigint): string {
  const bi = typeof input === "string" ? BigInt(input) : input;
  if (bi === 0n) return "0x0";
  const hex = bi.toString(16);
  return "0x" + (hex.length % 2 === 0 ? hex : "0" + hex);
}

function maskToField(val: bigint): bigint {
  return val % BN254_R;
}

export async function preloadZkey(zkeyPath: string): Promise<void> {
  console.log("Preloading zkey:", zkeyPath);
  return worker.preloadZkey(zkeyPath);
}

export async function preloadWasm(wasmPath: string): Promise<void> {
  console.log("Preloading wasm:", wasmPath);
  return worker.preloadWasm(wasmPath);
}

export async function preloadWasmsnark(): Promise<void> {
  console.log("Preloading wasmsnark");
  return worker.preloadWasmsnark();
}

export function generateCommitment(
  secret: string,
  asset: string,
  amount: string,
): { commitment: string; nullifier: string; nullifierHash: string } {
  const secretBN = BigInt(secret);
  const assetBN = asset === ethers.ZeroAddress ? 0n : BigInt(asset);
  const amountBN = BigInt(amount);

  const nullifier = poseidon2([secretBN, 1n]);
  const nullifierHash = poseidon1([nullifier]);
  const precommitment = poseidon2([nullifier, secretBN]);
  const valueAssetHash = poseidon2([amountBN, assetBN]);
  const commitment = poseidon2([valueAssetHash, precommitment]);

  return {
    commitment: maskToField(commitment).toString(),
    nullifier: nullifier.toString(),
    nullifierHash: maskToField(nullifierHash).toString(),
  };
}

export async function zkDeposit(
  secret: string,
  asset: string,
  amount: string,
): Promise<{
  commitment: string;
  nullifierHash: string;
  publicSignals: string[];
}> {
  console.log("ZK Deposit:", { secret, asset, amount });

  const { commitment, nullifierHash } = generateCommitment(
    secret,
    asset,
    amount,
  );

  console.log("  Commitment:", commitment);
  console.log("  NullifierHash:", nullifierHash);

  return {
    commitment,
    nullifierHash,
    publicSignals: [commitment],
  };
}

// ============================================================================
// Circuit signal counts:
// - V5 (withdraw_phase2_fixed): 7 public signals
// - V7 (withdraw_phase2_fixed_v7): 8 public signals
//   [0] newCommitmentHash
//   [1] existingNullifierHash  
//   [2] contextHash
//   [3] withdrawnValue
//   [4] treeDepth
//   [5] context
//   [6] root
//   [7] asset (public input in v7, private in v5)
// ============================================================================

export async function zkWithdraw(
  params: {
    withdrawnValue: string;
    root: string;
    treeDepth: string;
    context: string;
    asset: string;
    existingValue: string;
    existingNullifier: string;
    existingSecret: string;
    newNullifier: string;
    newSecret: string;
    siblings: string[];
    leafIndex: string;
  },
  options?: { 
    useV7Circuit?: boolean; 
  },
): Promise<{ proof: any; calldata: any; publicSignals: string[] }> {
  const {
    withdrawnValue,
    root,
    treeDepth,
    context,
    asset,
    existingValue,
    existingNullifier,
    existingSecret,
    newNullifier,
    newSecret,
    siblings,
    leafIndex,
  } = params;
  
  const useV7Circuit = options?.useV7Circuit ?? false;
  
  console.log("ZK Withdraw:", {
    withdrawnValue,
    root,
    treeDepth,
    context,
    asset,
    leafIndex,
    useV7Circuit,
  });

  const paddedSiblings = [...siblings];
  while (paddedSiblings.length < 128) {
    paddedSiblings.push("0");
  }

  console.log("Generating ZK proof with", paddedSiblings.length, "siblings");

  const input = {
    withdrawnValue,
    root,
    treeDepth,
    context,
    asset,
    existingValue,
    existingNullifier,
    existingSecret,
    newNullifier,
    newSecret,
    siblings: paddedSiblings,
    leafIndex,
  };

  try {
    // Use v7 circuit for paseo v7 network (8 signals)
    const wasmPath = useV7Circuit ? "/withdraw_phase2_fixed_v7.wasm" : "/withdraw_phase2_fixed.wasm";
    const zkeyPath = useV7Circuit ? "/withdraw_phase2_fixed_v7_0001.zkey" : "/withdraw_phase2_fixed_0001.zkey";
    
    console.log("ZK circuit:", wasmPath, zkeyPath);
    
    // Use Web Worker for proof generation (non-blocking, caches artifacts)
    const result = await worker.groth16FullProve(input, wasmPath, zkeyPath);
    const { proof, publicSignals } = result;

    console.log("  Proof generated (via worker)");
    console.log("  Public signals:", publicSignals.length);

    // Circuit output order: [withdrawnValue, treeDepth, context, newCommitmentHash, existingNullifierHash, contextHash]
    // Plus: [newCommitmentHash] in v5/v6, [asset] in v7
    // Format public signals for proof (hex strings)
    
    // For v7: circuit outputs 8 signals already
    // For v5: circuit outputs 6 signals, we need to add 1 more
    
    const signalCount = publicSignals.length;
    console.log("  Circuit signal count:", signalCount);
    
    let formattedPublicSignals: string[];
    
    if (useV7Circuit) {
      // v7: circuit outputs 8 signals directly
      formattedPublicSignals = publicSignals.map((x) => toEthHex(x));
    } else {
      // v5: circuit outputs 6 signals, need to pad to 7
      formattedPublicSignals = [
        ...publicSignals.map((x) => toEthHex(x)),
        toEthHex(params.asset || "0"),
      ];
    }

    const formattedProof = [
      [toEthHex(proof.pi_a[0]), toEthHex(proof.pi_a[1])],
      [
        [toEthHex(proof.pi_b[0][0]), toEthHex(proof.pi_b[0][1])],
        [toEthHex(proof.pi_b[1][0]), toEthHex(proof.pi_b[1][1])],
      ],
      [toEthHex(proof.pi_c[0]), toEthHex(proof.pi_c[1])],
      formattedPublicSignals,
    ];

    // Use the worker for exportSolidityCallData (avoids pulling the
    // full snarkjs bundle into the main thread).
    const calldata = await worker.groth16ExportSolidityCallData(
      proof,
      publicSignals.map((s: string) => s.toString()),
    );
    const parsedCalldata = JSON.parse("[" + calldata + "]");

    // Debug: check what exportSolidityCallData returns
    console.log(
      "  exportSolidityCallData public signals:",
      parsedCalldata[3]?.length || "undefined",
    );

    // Use the signals from exportSolidityCallData (they might be transformed)
    const exportSignals =
      parsedCalldata[3] || publicSignals.map((s) => s.toString());

    // Build calldata for withdraw: pA, pB, pC, pubSignals (as BigInts)
    let contractPublicSignals: bigint[];
    
    if (useV7Circuit) {
      // v7: 8 signals, asset is already in the signals (position 7)
      contractPublicSignals = exportSignals.map((s) => BigInt(s));
    } else {
      // v5: 7 signals with asset as last signal
      contractPublicSignals = exportSignals.map((s) => BigInt(s));
      // If we have 6 signals, add asset as 7th
      if (contractPublicSignals.length === 6) {
        contractPublicSignals.push(BigInt(params.asset || "0"));
      }
    }

    const calldataBigInt = [
      [BigInt(parsedCalldata[0][0]), BigInt(parsedCalldata[0][1])],
      [
        [BigInt(parsedCalldata[1][0][0]), BigInt(parsedCalldata[1][0][1])],
        [BigInt(parsedCalldata[1][1][0]), BigInt(parsedCalldata[1][1][1])],
      ],
      [BigInt(parsedCalldata[2][0]), BigInt(parsedCalldata[2][1])],
      contractPublicSignals,
    ];

    // Return publicSignals as strings for UI
    let publicSignalsArray: string[];
    
    if (useV7Circuit) {
      // v7: use whatever exportSolidityCallData returned (should be 8 signals)
      publicSignalsArray = exportSignals;
    } else {
      // v5: pad to 7 if needed
      publicSignalsArray = exportSignals.length === 6
        ? [...exportSignals, params.asset || "0"]
        : exportSignals;
    }

    console.log("  Final public signals count:", publicSignalsArray.length);
    console.log("  Final public signals:", publicSignalsArray);

    return {
      proof: formattedProof,
      calldata: calldataBigInt,
      publicSignals: publicSignalsArray,
    };
  } catch (e) {
    console.error("ZK Proof generation failed:", e);
    throw e;
  }
}
