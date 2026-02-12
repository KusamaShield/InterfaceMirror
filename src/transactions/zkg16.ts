/*
 * Copyright 2025 Kusama Shield Developers on behalf of the Kusama DAO, see LICENSE in main folder.
 */

import * as snarkjs from "snarkjs";

export const westend_zk = "0x34D6A8507ACdfcf7445Ac19B6a57d90Bfd70AdbD";
export const westend_pool = "0xB446A4991636Fda68134F0113D15D9a35623527e"; //"0x826fFaAf81935C0Ae225E54F22DB91D03bbf745a";//"0xfA626d66591bB57bac666cBe89D2c335CCdC7ff9";

// ---------------------------------------------------------------------------
// Prover backend feature flag
// ---------------------------------------------------------------------------

/**
 * Toggle between snarkjs (default) and wasmsnark prover backends.
 *
 * wasmsnark is faster (multi-threaded WASM multiexp) but requires a
 * pre-converted binary proving key. Set to true once withdraw_pkey.bin
 * is available in public/.
 *
 * Generate it with: npm run convert-pkey
 */
export let USE_WASMSNARK = false;

export function setUseWasmsnark(enabled: boolean): void {
  USE_WASMSNARK = enabled;
}

// Path to wasmsnark binary proving key for the withdraw circuit
const WASMSNARK_WITHDRAW_PKEY = "/withdraw_pkey.bin";

// ---------------------------------------------------------------------------
// snarkjs Web Worker (off-main-thread witness calculation + artifact caching)
// ---------------------------------------------------------------------------

import snarkWorker from "../workers/snarkjs-client";

function getSnarkWorker() {
  return snarkWorker;
}

// ---------------------------------------------------------------------------
// Main-thread artifact cache for zkey (needed for groth16.prove on main thread
// where ffjavascript can spawn its own worker threads for multi-threaded multiexp)
// ---------------------------------------------------------------------------

const mainThreadCache = new Map<string, ArrayBuffer>();

async function fetchAndCacheMainThread(path: string): Promise<ArrayBuffer> {
  const cached = mainThreadCache.get(path);
  if (cached) return cached;

  console.time(`[main] fetch ${path}`);
  const resp = await fetch(path);
  if (!resp.ok) throw new Error(`Failed to fetch: ${path} (${resp.status})`);
  const buf = await resp.arrayBuffer();
  console.timeEnd(`[main] fetch ${path}`);
  console.log(`[main] cached ${path} (${(buf.byteLength / 1024 / 1024).toFixed(1)} MB)`);
  mainThreadCache.set(path, buf);
  return buf;
}

// Log threading availability on main thread
console.log(
  `[main] SharedArrayBuffer: ${typeof SharedArrayBuffer !== "undefined" ? "available" : "UNAVAILABLE"}`,
  `| hardwareConcurrency: ${navigator.hardwareConcurrency ?? "unknown"}`,
);

/**
 * Pre-load proving artifacts. Loads zkey on main thread (for main-thread prove)
 * and in worker memory (for worker-only fullProve fallback).
 */
export async function preloadZkey(zkeyPath: string): Promise<void> {
  await Promise.all([
    fetchAndCacheMainThread(zkeyPath),
    getSnarkWorker().preloadZkey(zkeyPath),
  ]);
}

/**
 * Pre-load the WASM circuit binary into worker memory.
 */
export async function preloadWasm(wasmPath: string): Promise<void> {
  await getSnarkWorker().preloadWasm(wasmPath);
}

/**
 * Pre-initialize the wasmsnark backend (warm-up bn128 + binary pkey).
 */
export async function preloadWasmsnark(): Promise<void> {
  await getSnarkWorker().preloadWasmsnark(WASMSNARK_WITHDRAW_PKEY);
}

function toethhex(inputen: string) {
  return "0x" + BigInt(inputen).toString(16);
}

// generateCommitment v2
export async function g2c(
  secret: string,
  asset: string,
  amount: string,
  leafIndex: string,
  siblings: string[],
) {
  const inputs = {
    secret: secret,
    asset: asset,
    amount: amount,
    leafIndex: leafIndex,
    siblings: siblings,
    recipient: "0", // This can be set to 0 for commitment generation as it's public
  };

  const { proof, publicSignals } = await getSnarkWorker().groth16FullProve(
    inputs,
    "/asset.wasm",
    "/asset_0001.zkey",
  );

  const calldata = await getSnarkWorker().groth16ExportSolidityCallData(
    proof,
    publicSignals,
  );

  // Format the proof for Ethereum
  const formattedCall = [
    [toethhex(proof.pi_a[0]), toethhex(proof.pi_a[1])],
    [
      [toethhex(proof.pi_b[0][0]), toethhex(proof.pi_b[0][1])],
      [toethhex(proof.pi_b[1][0]), toethhex(proof.pi_b[1][1])],
    ],
    [toethhex(proof.pi_c[0]), toethhex(proof.pi_c[1])],
    publicSignals.map((signal) => toethhex(signal)),
  ];

  return {
    proof: formattedCall,
    publicSignals: publicSignals,
    calldata: JSON.parse("[" + calldata + "]"),
  };
}

// WITHDRAW FUNCTION for new FixedIlop contract (withdraw.circom Withdraw(254))
// Generates full Groth16 proof for withdrawal with UTXO model
export async function zkWithdraw({
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
}: {
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
}) {
  if (siblings.length !== 254) {
    throw new Error("Siblings array must have exactly 254 elements.");
  }

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
    siblings,
    leafIndex,
  };

  let proof: any;
  let publicSignals: string[];

  if (USE_WASMSNARK) {
    // wasmsnark backend: witness generation via snarkjs + proof via wasmsnark WASM
    ({ proof, publicSignals } = await getSnarkWorker().wasmsnarkFullProve(
      input,
      "/withdraw.wasm",
      WASMSNARK_WITHDRAW_PKEY,
    ));
  } else {
    // Split approach: witness in worker, prove on main thread.
    // ffjavascript can only spawn its own worker threads from the main thread
    // (nested workers from within our Web Worker fail silently → single-threaded).
    // This enables multi-threaded multiexp: ~44s → ~5-10s.
    const t0 = performance.now();

    // Step 1: Witness calculation in Web Worker (off main thread, ~1s)
    const wtnsData = await getSnarkWorker().calculateWitness(input, "/withdraw.wasm");
    const t1 = performance.now();
    console.log(`[main] witness calc (worker): ${(t1 - t0).toFixed(0)}ms`);

    // Step 2: Load zkey on main thread (cached after first load)
    const zkeyBuf = await fetchAndCacheMainThread("/withdraw_0001.zkey");
    const t2 = performance.now();
    console.log(`[main] zkey ready: ${(t2 - t1).toFixed(0)}ms`);

    // Step 3: Groth16 prove on main thread — ffjavascript will use SharedArrayBuffer
    // and spawn its own workers for parallel multiexponentiation.
    // Pass witness as Uint8Array (raw .wtns binary), not { type: "mem" } object.
    ({ proof, publicSignals } = await (snarkjs as any).groth16.prove(
      new Uint8Array(zkeyBuf),
      new Uint8Array(wtnsData),
    ));
    const t3 = performance.now();
    console.log(`[main] groth16 prove: ${(t3 - t2).toFixed(0)}ms`);
    console.log(`[main] total proof time: ${(t3 - t0).toFixed(0)}ms`);
  }

  const calldata = await snarkjs.groth16.exportSolidityCallData(
    proof,
    publicSignals,
  );

  const formattedProof = [
    [toethhex(proof.pi_a[0]), toethhex(proof.pi_a[1])],
    [
      [toethhex(proof.pi_b[0][0]), toethhex(proof.pi_b[0][1])],
      [toethhex(proof.pi_b[1][0]), toethhex(proof.pi_b[1][1])],
    ],
    [toethhex(proof.pi_c[0]), toethhex(proof.pi_c[1])],
    publicSignals.map((x) => toethhex(x)),
  ];

  return {
    proof: formattedProof,
    calldata: JSON.parse("[" + calldata + "]"),
    publicSignals,
  };
}

// TRANSFER PROOF (same circuit with withdrawnValue=0) — for future use
export async function zkTransferProof({
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
}: {
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
}) {
  return zkWithdraw({
    withdrawnValue: "0",
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
  });
}

// DEPOSIT FUNCTION (generate commitment + nullifier) — legacy for non-Paseo networks
export async function zkDeposit({
  secret,
  asset,
  amount,
}: {
  secret: string;
  asset: string;
  amount: string;
}) {
  const dummySiblings = new Array(256).fill("0");
  const dummyLeafIndex = "0";

  const input = {
    secret,
    asset,
    amount,
    leafIndex: dummyLeafIndex,
    siblings: dummySiblings,
    recipient: "0", // zero recipient for deposit, not needed on-chain
  };

  const { proof, publicSignals } = await getSnarkWorker().groth16FullProve(
    input,
    "/main.wasm",
    "/main_0000.zkey",
  );

  const [root, nullifier, publicAsset, publicAmount, , , ,] = publicSignals;

  return {
    commitment: publicSignals[1], // The Merkle leaf to insert (Poseidon(secret, asset, amount))
    nullifier,
    asset: publicAsset,
    amount: publicAmount,
    publicSignals,
  };
}

export async function generateCommitment(secret: string, nullifierInput: string = "1") {
  // Circuit expects in[2] = [secret, nullifier_value]
  // The output is Poseidon(secret, nullifier_value)

  const { proof, publicSignals } = await getSnarkWorker().groth16FullProve(
    {
      in: [secret, nullifierInput],
    },
    "/asset.wasm",
    "/asset_0001.zkey",
  );

  const calldata = await getSnarkWorker().groth16ExportSolidityCallData(
    proof,
    publicSignals,
  );

  return JSON.parse("[" + calldata + "]");
}
