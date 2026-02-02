/*
 * Copyright 2025 Kusama Shield Developers on behalf of the Kusama DAO, see LICENSE in main folder.
 */

//const snarkjs = require("snarkjs");
//import * as snarkjs from "snarkjs/build/snarkjs.min.js";
import * as _snarkjs from "snarkjs";
export const snarkjs = _snarkjs;

export const westend_zk = "0x34D6A8507ACdfcf7445Ac19B6a57d90Bfd70AdbD";
export const westend_pool = "0xB446A4991636Fda68134F0113D15D9a35623527e"; //"0x826fFaAf81935C0Ae225E54F22DB91D03bbf745a";//"0xfA626d66591bB57bac666cBe89D2c335CCdC7ff9";

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

  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
      inputs,
    "asset.wasm",
    "asset_0001.zkey",
  );

  const calldata = await snarkjs.groth16.exportSolidityCallData(
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

// WITHDRAW FUNCTION (generates full zk proof for withdraw)
export async function zkWithdraw({
  secret,
  asset,
  amount,
  recipient,
  leafIndex,
  siblings,
}: {
  secret: string;
  asset: string;
  amount: string;
  recipient: string; // Ethereum address in numeric string format (BigInt)
  leafIndex: string;
  siblings: string[];
}) {
  if (siblings.length !== 256) {
    throw new Error("Siblings array must have exactly 256 elements.");
  }

  const input = {
    secret,
    asset,
    amount,
    recipient,
    leafIndex,
    siblings,
  };

  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    input,
    "main.wasm",
    "main_0000.zkey",
  );

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

// DEPOSIT FUNCTION (generate commitment + nullifier)
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

  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    input,
    "main.wasm",
    "main_0000.zkey",
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

export async function generateCommitment(secret: string) {
  // const poseidon = await circomlibjs.buildPoseidon();
  //  const hash = poseidon.F.toString(poseidon([10]));
  //console.log(hash);

  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    {
      in: [secret, "67890"],
    },
    "possy.wasm",
    "possy_0000.zkey",
  );

  const calldata = await snarkjs.groth16.exportSolidityCallData(
    proof,
    publicSignals,
  );

  const formattedCall = [
    [toethhex(proof.pi_a[0]), toethhex(proof.pi_a[1])],
    [
      [toethhex(proof.pi_b[0][0]), toethhex(proof.pi_b[0][1])],
      [toethhex(proof.pi_b[1][0]), toethhex(proof.pi_b[1][1])],
    ],
    [toethhex(proof.pi_c[0]), toethhex(proof.pi_c[1])],
    publicSignals.map((signal) => toethhex(signal)), // Ensure public signals are in hex
  ];
  const solcall = formattedCall; //JSON.stringify(formattedCall);

  return JSON.parse("[" + calldata + "]");
}
