/*
 * Copyright 2025 Kusama Shield Developers on behalf of the Kusama DAO, see LICENSE in main folder.
 *
 * wasmsnark-based Groth16 prover for BN128/BN254 circuits.
 *
 * This module wraps the wasmsnark library (../../wasmsnark) to provide
 * a faster alternative to snarkjs for Groth16 proof generation.
 * wasmsnark uses multi-threaded WASM for elliptic curve multiexponentiation,
 * giving 5-20x speedup over snarkjs's pure-JS prover.
 *
 * REQUIREMENTS:
 * 1. The proving key must be pre-converted to wasmsnark's binary format
 *    using the conversion script: `npm run convert-pkey`
 *    (see Interface/scripts/convert-pkey-to-wasmsnark.cjs)
 * 2. Witness generation still uses snarkjs (circom WASM).
 *
 * BINARY FORMAT (wasmsnark proving key):
 *   Header (40 bytes): nVars, nPublic, domainSize, offsets...
 *   Then: alfa1, beta1, delta1, beta2, delta2, polynomials, points
 *   See wasmsnark/tools/buildpkey.js for full specification.
 *
 * BINARY FORMAT (witness):
 *   Each signal is 32 bytes (8 × uint32 little-endian), concatenated.
 */

/**
 * Convert an array of bigint witness values to wasmsnark's binary format.
 * Each value is stored as 8 × uint32 little-endian (256 bits total).
 */
export function witnessToBinary(witnessValues: bigint[]): ArrayBuffer {
  const buf = new ArrayBuffer(witnessValues.length * 32);
  const view = new DataView(buf);

  for (let i = 0; i < witnessValues.length; i++) {
    let val = witnessValues[i];
    const baseOffset = i * 32;
    for (let j = 0; j < 8; j++) {
      view.setUint32(baseOffset + j * 4, Number(val & 0xFFFFFFFFn), true);
      val >>= 32n;
    }
  }

  return buf;
}

/**
 * Extract public signals from the witness array.
 * In circom/snarkjs convention, witness[0] = 1, witness[1..nPublic] = public signals.
 * nPublic is read from the proving key header (uint32 at offset 4).
 */
export function extractPublicSignals(
  witnessValues: bigint[],
  pkeyBuf: ArrayBuffer,
): string[] {
  const pkey32 = new Uint32Array(pkeyBuf);
  const nPublic = pkey32[1];
  const pubSignals: string[] = [];
  for (let i = 1; i <= nPublic; i++) {
    pubSignals.push(witnessValues[i].toString());
  }
  return pubSignals;
}

/**
 * Parse the .wtns binary format produced by snarkjs wtns.calculate().
 * Returns an array of bigint witness values.
 *
 * .wtns format (simplified):
 *   - Magic "wtns" (4 bytes)
 *   - Version (4 bytes)
 *   - nSections (4 bytes)
 *   - Section 1: header (fieldSize, prime, nWitness)
 *   - Section 2: witness values (nWitness × fieldSize bytes, little-endian)
 */
export function parseWtns(wtnsData: Uint8Array): bigint[] {
  const view = new DataView(wtnsData.buffer, wtnsData.byteOffset, wtnsData.byteLength);
  let offset = 0;

  // Magic "wtns"
  offset += 4;
  // Version
  offset += 4;
  // nSections
  offset += 4;

  // Section 1: header
  const sec1Type = view.getUint32(offset, true); offset += 4;
  const sec1Size = Number(view.getBigUint64(offset, true)); offset += 8;
  const fieldSize = view.getUint32(offset, true); offset += 4;
  // Skip prime (fieldSize bytes)
  offset += fieldSize;
  const nWitness = view.getUint32(offset, true); offset += 4;

  // Section 2: witness data
  const sec2Type = view.getUint32(offset, true); offset += 4;
  const sec2Size = Number(view.getBigUint64(offset, true)); offset += 8;

  const values: bigint[] = [];
  for (let i = 0; i < nWitness; i++) {
    let val = 0n;
    // Read fieldSize bytes, little-endian
    for (let j = fieldSize - 1; j >= 0; j--) {
      val = (val << 8n) | BigInt(wtnsData[offset + j]);
    }
    values.push(val);
    offset += fieldSize;
  }

  return values;
}
