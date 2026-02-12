#!/usr/bin/env node
/*
 * Copyright 2025 Kusama Shield Developers on behalf of the Kusama DAO, see LICENSE in main folder.
 *
 * Convert a snarkjs .zkey proving key to wasmsnark's binary format.
 *
 * Usage:
 *   node scripts/convert-pkey-to-wasmsnark.cjs <input.zkey> <output.bin>
 *
 * Example:
 *   node scripts/convert-pkey-to-wasmsnark.cjs public/withdraw_0001.zkey public/withdraw_pkey.bin
 *
 * This script:
 *   1. Exports the .zkey to JSON using snarkjs
 *   2. Converts the JSON proving key to wasmsnark's binary format
 *      (same logic as wasmsnark/tools/buildpkey.js)
 *   3. Writes the binary file
 *
 * The output .bin file should be placed in public/ and served as a static asset.
 */

const snarkjs = require("snarkjs");
const fs = require("fs");
const path = require("path");

const inputZkey = process.argv[2];
const outputBin = process.argv[3];

if (!inputZkey || !outputBin) {
  console.error("Usage: node convert-pkey-to-wasmsnark.cjs <input.zkey> <output.bin>");
  process.exit(1);
}

// BigInt versions of Montgomery conversion
const Q = BigInt("21888242871839275222246405745257275088696311157297823662689037894645226208583");
const R = BigInt("21888242871839275222246405745257275088548364400416034343698204186575808495617");
const SHIFT = 1n << 256n;

function toMontgomeryQ(p) {
  const bi = BigInt(p);
  return ((bi * SHIFT) % Q + Q) % Q;
}

function toMontgomeryR(p) {
  const bi = BigInt(p);
  return ((bi * SHIFT) % R + R) % R;
}

function writeUint32(view, offset, val) {
  view.setUint32(offset, val, true);
  return offset + 4;
}

function writeBigInt(view, offset, bi) {
  for (let i = 0; i < 8; i++) {
    view.setUint32(offset + i * 4, Number(bi & 0xFFFFFFFFn), true);
    bi >>= 32n;
  }
  return offset + 32;
}

function writePoint(view, offset, p) {
  offset = writeBigInt(view, offset, toMontgomeryQ(p[0]));
  offset = writeBigInt(view, offset, toMontgomeryQ(p[1]));
  return offset;
}

function writePoint2(view, offset, p) {
  offset = writeBigInt(view, offset, toMontgomeryQ(p[0][0]));
  offset = writeBigInt(view, offset, toMontgomeryQ(p[0][1]));
  offset = writeBigInt(view, offset, toMontgomeryQ(p[1][0]));
  offset = writeBigInt(view, offset, toMontgomeryQ(p[1][1]));
  return offset;
}

function writeTransformedPolynomial(view, offset, pol) {
  const keys = Object.keys(pol);
  offset = writeUint32(view, offset, keys.length);
  for (const key of keys) {
    offset = writeUint32(view, offset, Number(key));
    offset = writeBigInt(view, offset, toMontgomeryR(pol[key]));
  }
  return offset;
}

function calculateBuffLen(pk) {
  function polSize(pol) {
    const l = Object.keys(pol).length;
    return 36 * l + 4;
  }

  let size = 40; // header
  size += 3 * 64; // alfa1, beta1, delta1
  size += 2 * 128; // beta2, delta2

  for (let i = 0; i < pk.nVars; i++) {
    size += polSize(pk.polsA[i]);
    size += polSize(pk.polsB[i]);
  }

  size += pk.nVars * 64;  // pointsA
  size += pk.nVars * 64;  // pointsB1
  size += pk.nVars * 128; // pointsB2
  size += (pk.nVars - pk.nPublic - 1) * 64; // pointsC
  size += pk.domainSize * 64; // hExps

  return size;
}

async function main() {
  console.log(`Reading zkey: ${inputZkey}`);

  // Export zkey to JSON using snarkjs
  console.log("Exporting zkey to JSON (this may take a while for large keys)...");
  const pkJson = await snarkjs.zKey.exportJson(inputZkey);

  // unstringify bigints recursively
  function unstringify(obj) {
    if (typeof obj === "string" && /^\d+$/.test(obj)) {
      return obj; // keep as string, we'll BigInt() when needed
    }
    if (Array.isArray(obj)) return obj.map(unstringify);
    if (typeof obj === "object" && obj !== null) {
      const result = {};
      for (const key of Object.keys(obj)) {
        result[key] = unstringify(obj[key]);
      }
      return result;
    }
    return obj;
  }

  const pk = unstringify(pkJson);

  console.log(`nVars: ${pk.nVars}, nPublic: ${pk.nPublic}, domainSize: ${pk.domainSize}`);

  const buffLen = calculateBuffLen(pk);
  console.log(`Allocating ${(buffLen / 1024 / 1024).toFixed(1)} MB buffer`);

  const buf = new ArrayBuffer(buffLen);
  const view = new DataView(buf);
  let offset = 0;

  // Header
  offset = writeUint32(view, offset, pk.nVars);
  offset = writeUint32(view, offset, pk.nPublic);
  offset = writeUint32(view, offset, pk.domainSize);

  // Placeholder offsets (filled in later)
  const pPolsA = offset; offset += 4;
  const pPolsB = offset; offset += 4;
  const pPointsA = offset; offset += 4;
  const pPointsB1 = offset; offset += 4;
  const pPointsB2 = offset; offset += 4;
  const pPointsC = offset; offset += 4;
  const pPointsHExps = offset; offset += 4;

  // Fixed key elements
  offset = writePoint(view, offset, pk.vk_alfa_1);
  offset = writePoint(view, offset, pk.vk_beta_1);
  offset = writePoint(view, offset, pk.vk_delta_1);
  offset = writePoint2(view, offset, pk.vk_beta_2);
  offset = writePoint2(view, offset, pk.vk_delta_2);

  // Polynomials A
  writeUint32(view, pPolsA, offset);
  for (let i = 0; i < pk.nVars; i++) {
    offset = writeTransformedPolynomial(view, offset, pk.polsA[i]);
  }

  // Polynomials B
  writeUint32(view, pPolsB, offset);
  for (let i = 0; i < pk.nVars; i++) {
    offset = writeTransformedPolynomial(view, offset, pk.polsB[i]);
  }

  // Points A
  writeUint32(view, pPointsA, offset);
  for (let i = 0; i < pk.nVars; i++) {
    offset = writePoint(view, offset, pk.A[i]);
  }

  // Points B1
  writeUint32(view, pPointsB1, offset);
  for (let i = 0; i < pk.nVars; i++) {
    offset = writePoint(view, offset, pk.B1[i]);
  }

  // Points B2
  writeUint32(view, pPointsB2, offset);
  for (let i = 0; i < pk.nVars; i++) {
    offset = writePoint2(view, offset, pk.B2[i]);
  }

  // Points C (skip first nPublic+1)
  writeUint32(view, pPointsC, offset);
  for (let i = pk.nPublic + 1; i < pk.nVars; i++) {
    offset = writePoint(view, offset, pk.C[i]);
  }

  // H exponents
  writeUint32(view, pPointsHExps, offset);
  for (let i = 0; i < pk.domainSize; i++) {
    offset = writePoint(view, offset, pk.hExps[i]);
  }

  if (offset !== buffLen) {
    console.warn(`Warning: expected ${buffLen} bytes but wrote ${offset}`);
  }

  // Write to file
  fs.writeFileSync(outputBin, Buffer.from(buf));
  console.log(`Written ${(offset / 1024 / 1024).toFixed(1)} MB to ${outputBin}`);
}

main().catch((err) => {
  console.error("Conversion failed:", err);
  process.exit(1);
});
