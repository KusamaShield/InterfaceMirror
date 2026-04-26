/*
 * Copyright 2025 Kusama Shield Developers on behalf of the Kusama DAO, see LICENSE in main folder.
 *
 * ZK proof generation for Paseo Asset Hub Phase 2 fixed circuit.
 * Uses snarkjs for proof generation with WASM witness generation.
 */

import { ethers } from "ethers";
import * as snarkjs from "snarkjs";
import { poseidon1, poseidon2, poseidon3 } from "poseidon-lite";

export const USE_WASMSNARK = false;

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
  return Promise.resolve();
}

export async function preloadWasm(wasmPath: string): Promise<void> {
  console.log("Preloading wasm:", wasmPath);
  return Promise.resolve();
}

export async function preloadWasmsnark(): Promise<void> {
  console.log("Preloading wasmsnark");
  return Promise.resolve();
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
  const nullifierHash = poseidon2([nullifier, 0n]);
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
  options?: { padTo7Signals?: boolean },
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
  const padTo7Signals = options?.padTo7Signals ?? false;
  console.log("ZK Withdraw:", {
    withdrawnValue,
    root,
    treeDepth,
    context,
    asset,
    leafIndex,
    padTo7Signals,
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
    const { proof, publicSignals } = await snarkjs.groth16.fullProve(
      input,
      "/withdraw_phase2_fixed.wasm",
      "/withdraw_phase2_fixed_0001.zkey",
    );

    console.log("  Proof generated");
    console.log("  Public signals:", publicSignals.length);

    // Circuit output order: [withdrawnValue, treeDepth, context, newCommitmentHash, existingNullifierHash, contextHash]
    // Format public signals for proof (hex strings)
    let formattedPublicSignals;
    if (padTo7Signals) {
      // v2: pad with assetId as 7th signal
      formattedPublicSignals = [
        ...publicSignals.map((x) => toEthHex(x)),
        toEthHex(params.asset || "0"),
      ];
    } else {
      // v3: exactly 6 signals
      formattedPublicSignals = publicSignals.map((x) => toEthHex(x));
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

    const calldata = await snarkjs.groth16.exportSolidityCallData(
      proof,
      publicSignals,
    );
    const parsedCalldata = JSON.parse("[" + calldata + "]");

    // Build calldata for withdraw: pA, pB, pC, pubSignals (as BigInts)
    const contractPublicSignals = publicSignals.map((s) => BigInt(s));
    if (padTo7Signals) {
      contractPublicSignals.push(BigInt(params.asset || "0"));
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
    let publicSignalsArray;
    if (padTo7Signals) {
      publicSignalsArray = [
        ...publicSignals.map((s) => s.toString()),
        params.asset || "0",
      ];
    } else {
      publicSignalsArray = publicSignals.map((s) => s.toString());
    }

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
