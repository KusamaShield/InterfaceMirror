/**
 * Full revive.call deposit → withdraw roundtrip on Polkadot AssetHub.
 *
 * Usage: npx tsx src/tests/roundtrip_revive_polkadot.ts
 *
 * Uses FORWARDER_SEED from .env. Requires ~0.25 DOT balance (0.1 deposit + gas).
 */

import { ApiPromise, WsProvider } from "@polkadot/api";
import { Keyring } from "@polkadot/keyring";
import { cryptoWaitReady, decodeAddress } from "@polkadot/util-crypto";
import * as dotenv from "dotenv";
import { ethers } from "ethers";
import { poseidon2 } from "poseidon-lite";
import * as snarkjs from "snarkjs";
dotenv.config();

const CONTRACT = "0x0D694Da746e73D1e255c1894F90e38170db45809";
const EVM_RPC = "https://polkadot-assethub-rpc.laissez-faire.trade";
const WS_RPC = "wss://asset-hub-polkadot-rpc.n.dwellir.com";

// ============================================================================
// ss58ToEth — correct derivation matching on-chain AccountId32Mapper
// ============================================================================
function ss58ToEth(ss58: string): string {
  const pubkey = decodeAddress(ss58);
  if (pubkey.length >= 32 && !pubkey.slice(12).every((b) => b === 0xEE)) {
    return "0x" + ethers.keccak256(Buffer.from(pubkey)).slice(2).slice(24);
  }
  return "0x" + Buffer.from(pubkey.slice(0, 20)).toString("hex");
}

// ============================================================================
// LeanIMT — inlined to avoid localStorage dependency
// ============================================================================
class LeanIMT {
  leaves: bigint[] = [];
  private sideNodes = new Map<number, bigint>();
  private depthVal = 0;
  root: bigint = 0n;
  get size() {
    return this.leaves.length;
  }

  insert(leaf: bigint) {
    const idx = this.leaves.length;
    if ((1 << this.depthVal) < idx + 1) this.depthVal++;
    let node = leaf;
    for (let lvl = 0; lvl < this.depthVal; lvl++) {
      if ((idx >> lvl) & 1)
        node = poseidon2([this.sideNodes.get(lvl) ?? 0n, node]);
      else this.sideNodes.set(lvl, node);
    }
    this.sideNodes.set(this.depthVal, node);
    this.root = node;
    this.leaves.push(leaf);
  }

  findLeafIndex(leaf: bigint): number {
    return this.leaves.findIndex((l) => l === leaf);
  }

  getProof(leafIndex: number) {
    const siblings: bigint[] = [];
    let layer = [...this.leaves];
    let idx = leafIndex;
    for (let lvl = 0; lvl < this.depthVal; lvl++) {
      const sib = idx % 2 ? idx - 1 : idx + 1;
      siblings.push(sib >= 0 && sib < layer.length ? layer[sib] : 0n);
      const next: bigint[] = [];
      for (let i = 0; i < layer.length; i += 2)
        next.push(
          i + 1 < layer.length
            ? poseidon2([layer[i], layer[i + 1]])
            : layer[i],
        );
      layer = next;
      idx = Math.floor(idx / 2);
    }
    while (siblings.length < 128) siblings.push(0n);
    return {
      siblings: siblings.map((s) => s.toString()),
      root: this.root.toString(),
    };
  }
}

// ============================================================================
// Main
// ============================================================================
async function main() {
  await cryptoWaitReady();
  const seed = process.env.FORWARDER_SEED!;
  if (!seed) throw new Error("FORWARDER_SEED not set");

  const keyring = new Keyring({ type: "sr25519" });
  const pair = keyring.addFromUri(seed);
  const ss58 = pair.address;
  const h160 = ss58ToEth(ss58);

  const ws = new WsProvider(WS_RPC);
  const api = await ApiPromise.create({ provider: ws });
  const provider = new ethers.JsonRpcProvider(EVM_RPC);
  const poolContract = new ethers.Contract(
    CONTRACT,
    [
      "function currentRoot() view returns (uint256)",
      "function treeSize() view returns (uint256)",
    ],
    provider,
  );

  // Balance check
  const info: any = await api.query.system.account(ss58);
  const balDOT = Number(info.data.free) / 1e10;
  console.log(`=== Revive Roundtrip on Polkadot AH ===`);
  console.log(`SS58:  ${ss58}`);
  console.log(`H160:  ${h160}`);
  console.log(`DOT:   ${balDOT.toFixed(4)}`);
  if (balDOT < 0.25) throw new Error(`Need >= 0.25 DOT`);
  console.log(`\n`);

  // Account mapping
  const mapped: any = await api.query.revive.accountInfoOf(h160);
  if (mapped.isEmpty) {
    console.log("Mapping account...");
    await new Promise<void>((res, rej) => {
      api.tx.revive
        .mapAccount()
        .signAndSend(pair, ({ status, dispatchError }: any) => {
          if (dispatchError) {
            const { index, error } = api.registry.findMetaError(
              dispatchError.asModule,
            );
            if (error !== "AccountAlreadyMapped")
              rej(new Error(`map: ${index}.${error}`));
            else res();
          }
          if (status.isFinalized) res();
        })
        .catch(rej);
    });
    console.log("Mapped!");
  }

  // ── Build tree from production proxy cache ──
  console.log("\n--- Loading Merkle tree from production proxy ---");
  const proxyUrl = process.env.PROXY_URL || "https://proxyswap.laissez-faire.trade";
  const res = await fetch(`${proxyUrl}/tree-leaves/polkadot`);
  if (!res.ok) throw new Error(`Proxy fetch failed: ${res.status}`);
  const treeData = await res.json();
  if (!treeData.leaves || treeData.leaves.length === 0)
    throw new Error("Proxy returned empty leaves");
  const cachedLeaves = treeData.leaves.map((l: string | number) => BigInt(l));

  const tree = new LeanIMT();
  for (const leaf of cachedLeaves) {
    if (leaf !== 0n) tree.insert(leaf);
  }

  const chainRoot = BigInt((await poolContract.currentRoot()).toString());
  const chainSize = Number(await poolContract.treeSize());
  console.log(`Cache: ${tree.size} leaves, root=${tree.root}`);
  console.log(`Chain: ${chainSize} leaves, root=${chainRoot}`);
  console.log(`Pre-deposit match: ${tree.root === chainRoot ? "YES" : "NO"}`);

  if (tree.root !== chainRoot) {
    throw new Error(
      `Tree cache out of sync! Run rebuild_tree_targeted.py first.`,
    );
  }

  // ── 1. DEPOSIT ──
  const AMOUNT_PLANCK = 1_000_000_000n; // 0.1 DOT
  const AMOUNT_WEI = AMOUNT_PLANCK * 100_000_000n; // 1e17 wei

  const secretBytes = ethers.randomBytes(31);
  const secret =
    "0x" +
    Array.from(secretBytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  const secretBN = BigInt(secret);
  const nullifier = poseidon2([secretBN, 1n]);
  const precommit = poseidon2([nullifier, secretBN]);
  const vah = poseidon2([AMOUNT_WEI, 0n]);
  const commitment = poseidon2([vah, precommit]);
  const commitmentHex = "0x" + commitment.toString(16).padStart(64, "0");

  console.log(`\n--- DEPOSIT 0.1 DOT ---`);
  console.log(`Secret:     ${secret}`);
  console.log(`Commitment: ${commitmentHex}`);

  const depositIface = new ethers.Interface([
    "function depositNative(bytes32) payable",
  ]);
  const callData = depositIface.encodeFunctionData("depositNative", [
    commitmentHex,
  ]);

  const blockBefore = (await api.rpc.chain.getHeader()).number.toNumber();

  const depositTxHash = await new Promise<string>((resolve, reject) => {
    api.tx.revive
      .call(
        CONTRACT,
        AMOUNT_PLANCK,
        { refTime: 1_500_000_000_000n, proofSize: 8_000_000n },
        500_000_000_000n.toString(),
        callData,
      )
      .signAndSend(pair, ({ status, txHash, dispatchError }: any) => {
        if (dispatchError) {
          if (dispatchError.isModule) {
            const { index, error } = api.registry.findMetaError(
              dispatchError.asModule,
            );
            reject(new Error(`${index}.${error}`));
          } else reject(new Error(dispatchError.toString()));
        }
        if (status.isFinalized) resolve(txHash.toHex());
      })
      .catch(reject);
  });
  console.log(`Tx: ${depositTxHash}`);

  // Verify via Substrate events
  let depositBlock: number | null = null;
  for (let bn = blockBefore + 1; bn <= blockBefore + 10; bn++) {
    try {
      const bh = await api.rpc.chain.getBlockHash(bn);
      const events = await api.query.system.events.at(bh);
      for (const r of events) {
        if (!r.phase.isApplyExtrinsic) continue;
        const ev: any = r.event;
        if (ev.section === "revive" && ev.method === "ContractEmitted") {
          if (ev.data[0].toString().toLowerCase() !== CONTRACT.toLowerCase())
            continue;
          const emitted = BigInt(ev.data[1].toHex ? ev.data[1].toHex() : ev.data[1].toString());
          if (emitted === commitment) {
            depositBlock = bn;
            break;
          }
        }
      }
      if (depositBlock !== null) break;
    } catch {}
  }
  if (depositBlock === null)
    throw new Error("Deposit not found in events within 10 blocks!");
  console.log(`Confirmed at block ${depositBlock}`);

  // Insert into tree & re-verify root
  tree.insert(commitment);
  const chainRoot2 = BigInt((await poolContract.currentRoot()).toString());
  console.log(`Post-deposit: tree_root=${tree.root}, chain_root=${chainRoot2}, match=${tree.root === chainRoot2}`);
  if (tree.root !== chainRoot2) throw new Error("Root mismatch after deposit!");

  // ── 2. ZK PROOF ──
  console.log("\n--- Generating ZK proof ---");
  const SNARK_FIELD =
    21888242871839275222246405745257275088548364400416034343698204186575808495617n;

  const ctxHash = ethers.keccak256(
    ethers.solidityPacked(["address", "address"], [h160, ethers.ZeroAddress]),
  );
  const context = (BigInt(ctxHash) % SNARK_FIELD).toString();

  const ns = ethers.randomBytes(31);
  const newSecret =
    "0x" +
    Array.from(ns)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  const newSecretBN = BigInt(newSecret);
  const newNullifier = poseidon2([newSecretBN, 1n]).toString();

  const leafIdx = tree.findLeafIndex(commitment);
  const merkleProof = tree.getProof(leafIdx);

  const circuitInput = {
    withdrawnValue: AMOUNT_WEI.toString(),
    root: chainRoot2.toString(),
    treeDepth: "128",
    context,
    asset: "0x0000000000000000000000000000000000000000",
    existingValue: AMOUNT_WEI.toString(),
    existingNullifier: nullifier.toString(),
    existingSecret: secretBN.toString(),
    newNullifier,
    newSecret: newSecretBN.toString(),
    siblings: merkleProof.siblings,
    leafIndex: leafIdx.toString(),
  };

  const tStart = Date.now();
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    circuitInput,
    "public/withdraw_phase2_fixed_v7.wasm",
    "public/withdraw_phase2_fixed_v7_0001.zkey",
  );
  console.log(`Proof: ${(Date.now() - tStart) / 1000}s`);

  // Format proof (G2 transpose for Solidity verifier)
  const formattedProof = [
    [BigInt(proof.pi_a[0]), BigInt(proof.pi_a[1])],
    [
      [BigInt(proof.pi_b[0][1]), BigInt(proof.pi_b[0][0])],
      [BigInt(proof.pi_b[1][1]), BigInt(proof.pi_b[1][0])],
    ],
    [BigInt(proof.pi_c[0]), BigInt(proof.pi_c[1])],
  ];
  const pub = publicSignals.map((s: string) => BigInt(s));

  // ── 3. WITHDRAW ──
  console.log("\n--- WITHDRAW ---");
  const wdIface = new ethers.Interface([
    "function withdraw(uint256[2],uint256[2][2],uint256[2],uint256[8],address)",
  ]);
  const wdCallData = wdIface.encodeFunctionData("withdraw", [
    formattedProof[0],
    formattedProof[1],
    formattedProof[2],
    pub.slice(0, 8),
    h160,
  ]);

  const wHash = await new Promise<string>((resolve, reject) => {
    api.tx.revive
      .call(
        CONTRACT,
        0n,
        { refTime: 1_000_000_000_000n, proofSize: 8_000_000n },
        100_000_000_000n.toString(),
        wdCallData,
      )
      .signAndSend(pair, ({ status, txHash, dispatchError }: any) => {
        if (dispatchError) {
          if (dispatchError.isModule) {
            const { index, error } = api.registry.findMetaError(
              dispatchError.asModule,
            );
            reject(new Error(`${index}.${error}`));
          } else reject(new Error(dispatchError.toString()));
        }
        if (status.isFinalized) resolve(txHash.toHex());
      })
      .catch(reject);
  });
  console.log(`Withdraw tx: ${wHash}`);
  console.log("\n=== ROUNDTRIP COMPLETE ===");
  await api.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});