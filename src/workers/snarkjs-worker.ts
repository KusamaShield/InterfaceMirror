/*
 * Copyright 2025 Kusama Shield Developers on behalf of the Kusama DAO, see LICENSE in main folder.
 *
 * Web Worker for Groth16 proof generation.
 * Supports two backends:
 *   1. snarkjs (default) — pure JS/WASM, uses .zkey files
 *   2. wasmsnark — multi-threaded WASM multiexp, uses binary proving key
 *      (faster but requires pre-converted proving key)
 *
 * Keeps zkey AND WASM ArrayBuffers cached in worker memory so they are
 * only fetched/parsed once across multiple proof generations.
 *
 * Uses Comlink.expose() for communication with the main thread.
 */

import * as snarkjs from "snarkjs";
import * as Comlink from "comlink";
import { witnessToBinary, extractPublicSignals, parseWtns } from "../transactions/wasmsnark-prover";

// ---------------------------------------------------------------------------
// Diagnostics: check if multi-threading is available
// ---------------------------------------------------------------------------

console.log(
  `[worker] SharedArrayBuffer: ${typeof SharedArrayBuffer !== "undefined" ? "available" : "UNAVAILABLE (single-threaded!)"}`,
  `| hardwareConcurrency: ${navigator.hardwareConcurrency ?? "unknown"}`,
);

// ---------------------------------------------------------------------------
// In-memory cache for proving artifacts
// ---------------------------------------------------------------------------

const artifactCache = new Map<string, ArrayBuffer>();

async function fetchAndCache(path: string): Promise<ArrayBuffer> {
  const cached = artifactCache.get(path);
  if (cached) return cached;

  console.time(`[worker] fetch ${path}`);
  const resp = await fetch(path);
  if (!resp.ok) throw new Error(`Failed to fetch: ${path} (${resp.status})`);
  const buf = await resp.arrayBuffer();
  console.timeEnd(`[worker] fetch ${path}`);
  console.log(`[worker] cached ${path} (${(buf.byteLength / 1024 / 1024).toFixed(1)} MB)`);
  artifactCache.set(path, buf);
  return buf;
}

// ---------------------------------------------------------------------------
// wasmsnark bn128 instance (lazy-initialized)
// ---------------------------------------------------------------------------

let bn128Instance: any = null;

async function getBn128(): Promise<any> {
  if (bn128Instance) return bn128Instance;

  // @ts-ignore — wasmsnark has no TS declarations; typed at call sites
  const mod = await import("wasmsnark/src/bn128.js");
  const buildBn128 = mod.default || mod.buildBn128 || mod;
  bn128Instance = await (typeof buildBn128 === "function" ? buildBn128() : buildBn128);
  return bn128Instance;
}

// ---------------------------------------------------------------------------
// Worker API exposed via Comlink
// ---------------------------------------------------------------------------

const workerApi = {
  /**
   * Calculate witness only (off main thread). Returns the wtns buffer.
   * Proof generation should happen on the main thread where ffjavascript
   * can spawn its own worker threads for multi-threaded multiexp.
   */
  async calculateWitness(
    input: any,
    wasmPath: string,
  ): Promise<ArrayBuffer> {
    const t0 = performance.now();
    const wasmBuf = await fetchAndCache(wasmPath);
    const t1 = performance.now();
    console.log(`[worker] wasm ready: ${(t1 - t0).toFixed(0)}ms`);

    const wtns = { type: "mem" } as any;
    await (snarkjs as any).wtns.calculate(input, new Uint8Array(wasmBuf), wtns);
    const t2 = performance.now();
    console.log(`[worker] witness calc: ${(t2 - t1).toFixed(0)}ms`);

    // Return a copy as ArrayBuffer (structured clone through postMessage)
    const src = new Uint8Array(wtns.data);
    const copy = new ArrayBuffer(src.byteLength);
    new Uint8Array(copy).set(src);
    return copy;
  },

  /**
   * Run groth16 proof inside the worker with split witness+prove steps.
   * Both WASM and zkey are fetched once and cached as ArrayBuffers.
   * NOTE: This runs single-threaded because ffjavascript can't spawn
   * sub-workers from within a worker. Use calculateWitness + main-thread
   * prove for the withdraw circuit instead.
   */
  async groth16FullProve(
    input: any,
    wasmPath: string,
    zkeyPath: string,
  ): Promise<{ proof: any; publicSignals: string[] }> {
    const t0 = performance.now();

    // Fetch and cache both artifacts as ArrayBuffers
    const [wasmBuf, zkeyBuf] = await Promise.all([
      fetchAndCache(wasmPath),
      fetchAndCache(zkeyPath),
    ]);
    const t1 = performance.now();
    console.log(`[worker] artifacts ready: ${(t1 - t0).toFixed(0)}ms`);

    // Step 1: Witness calculation — pass WASM as Uint8Array to avoid re-fetch
    const wtns = { type: "mem" } as any;
    await (snarkjs as any).wtns.calculate(input, new Uint8Array(wasmBuf), wtns);
    const t2 = performance.now();
    console.log(`[worker] witness calc: ${(t2 - t1).toFixed(0)}ms`);

    // Step 2: Groth16 prove — pass zkey as Uint8Array (cached in worker memory)
    const { proof, publicSignals } = await (snarkjs as any).groth16.prove(
      new Uint8Array(zkeyBuf),
      wtns,
    );
    const t3 = performance.now();
    console.log(`[worker] groth16 prove: ${(t3 - t2).toFixed(0)}ms`);
    console.log(`[worker] total proof time: ${(t3 - t0).toFixed(0)}ms`);

    return { proof, publicSignals };
  },

  /**
   * Export Solidity-compatible calldata string from a proof.
   */
  async groth16ExportSolidityCallData(
    proof: any,
    publicSignals: string[],
  ): Promise<string> {
    return snarkjs.groth16.exportSolidityCallData(proof, publicSignals);
  },

  /**
   * Pre-load a zkey or binary pkey into worker memory (warm-up).
   */
  async preloadZkey(zkeyPath: string): Promise<void> {
    await fetchAndCache(zkeyPath);
  },

  /**
   * Pre-load the WASM circuit binary into worker memory.
   */
  async preloadWasm(wasmPath: string): Promise<void> {
    await fetchAndCache(wasmPath);
  },

  /**
   * Generate a Groth16 proof using wasmsnark's multi-threaded WASM prover.
   */
  async wasmsnarkFullProve(
    input: any,
    wasmPath: string,
    pkeyBinPath: string,
  ): Promise<{ proof: any; publicSignals: string[] }> {
    const t0 = performance.now();

    // Step 1: Calculate witness using snarkjs (circom WASM)
    const wasmBuf = await fetchAndCache(wasmPath);
    const wtns = { type: "mem" } as any;
    await (snarkjs as any).wtns.calculate(input, new Uint8Array(wasmBuf), wtns);
    const t1 = performance.now();
    console.log(`[worker/wasmsnark] witness calc: ${(t1 - t0).toFixed(0)}ms`);

    // Step 2: Read witness values from the in-memory .wtns buffer
    const wtnsData = new Uint8Array(wtns.data);
    const witnessValues = parseWtns(wtnsData);

    // Step 3: Load binary proving key
    const pkeyBuf = await fetchAndCache(pkeyBinPath);

    // Step 4: Convert witness to wasmsnark binary format
    const witnessBin = witnessToBinary(witnessValues);
    const t2 = performance.now();
    console.log(`[worker/wasmsnark] witness convert: ${(t2 - t1).toFixed(0)}ms`);

    // Step 5: Generate proof using wasmsnark (multi-threaded)
    const bn128 = await getBn128();

    function copyBuf(src: ArrayBuffer): ArrayBuffer {
      const dst = new ArrayBuffer(src.byteLength);
      new Uint8Array(dst).set(new Uint8Array(src));
      return dst;
    }

    const rawProof = await bn128.groth16GenProof(
      copyBuf(witnessBin),
      copyBuf(pkeyBuf),
    );
    const t3 = performance.now();
    console.log(`[worker/wasmsnark] groth16 prove: ${(t3 - t2).toFixed(0)}ms`);
    console.log(`[worker/wasmsnark] total: ${(t3 - t0).toFixed(0)}ms`);

    // Step 6: Extract public signals from witness
    const publicSignals = extractPublicSignals(witnessValues, pkeyBuf);

    // Step 7: Convert wasmsnark proof format to snarkjs-compatible format
    const proof = {
      pi_a: rawProof.pi_a,
      pi_b: rawProof.pi_b,
      pi_c: rawProof.pi_c,
      protocol: "groth16",
      curve: "bn128",
    };

    return { proof, publicSignals };
  },

  /**
   * Pre-initialize the wasmsnark bn128 instance (warm-up).
   */
  async preloadWasmsnark(pkeyBinPath?: string): Promise<void> {
    await getBn128();
    if (pkeyBinPath) {
      await fetchAndCache(pkeyBinPath);
    }
  },
};

export type SnarkWorkerApi = typeof workerApi;

Comlink.expose(workerApi);
