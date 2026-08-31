/**
 * Withdraw-only — pickup from the existing deposit at block 19866309.
 * Deposit was made by roundtrip_revive_polkadot.ts.
 *
 * Usage: npx tsx src/tests/withdraw_revive_polkadot.ts
 */

import { ApiPromise, WsProvider } from "@polkadot/api";
import { Keyring } from "@polkadot/keyring";
import { cryptoWaitReady, decodeAddress } from "@polkadot/util-crypto";
import * as dotenv from "dotenv";
import { ethers } from "ethers";
import { poseidon2 } from "poseidon-lite";
import * as snarkjs from "snarkjs";
import { execSync } from "child_process";
dotenv.config();

const CONTRACT = "0x0D694Da746e73D1e255c1894F90e38170db45809";
const EVM_RPC = "https://polkadot-assethub-rpc.laissez-faire.trade";
const WS_RPC = "wss://asset-hub-polkadot-rpc.n.dwellir.com";

// Deposit params from roundtrip_revive_polkadot.ts output
const SECRET = "0x98705803bea49bc6d85b5e38f26c8e45fadbcc999e851c421f51b0c4270ab5";
const AMOUNT_WEI = 100000000000000000n; // 1e17 wei (0.1 DOT)
const DEPOSIT_BLOCK = 19866309;

function ss58ToEth(ss58: string): string {
  const pubkey = decodeAddress(ss58);
  if (pubkey.length >= 32 && !pubkey.slice(12).every((b) => b === 0xEE)) {
    return "0x" + ethers.keccak256(Buffer.from(pubkey)).slice(2).slice(24);
  }
  return "0x" + Buffer.from(pubkey.slice(0, 20)).toString("hex");
}

// Inline LeanIMT
class LeanIMT {
  leaves: bigint[] = [];
  private sideNodes = new Map<number, bigint>();
  private depthVal = 0;
  root: bigint = 0n;
  get size() { return this.leaves.length; }
  insert(leaf: bigint) {
    const idx = this.leaves.length;
    if ((1 << this.depthVal) < idx + 1) this.depthVal++;
    let node = leaf;
    for (let lvl = 0; lvl < this.depthVal; lvl++) {
      if ((idx >> lvl) & 1) node = poseidon2([this.sideNodes.get(lvl) ?? 0n, node]);
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
        next.push(i + 1 < layer.length ? poseidon2([layer[i], layer[i + 1]]) : layer[i]);
      layer = next;
      idx = Math.floor(idx / 2);
    }
    while (siblings.length < 128) siblings.push(0n);
    return { siblings: siblings.map((s) => s.toString()), root: this.root.toString() };
  }
}

async function main() {
  await cryptoWaitReady();
  const seed = process.env.FORWARDER_SEED!;
  const keyring = new Keyring({ type: "sr25519" });
  const pair = keyring.addFromUri(seed);
  const ss58 = pair.address;
  const h160 = ss58ToEth(ss58);

  const ws = new WsProvider(WS_RPC);
  const api = await ApiPromise.create({ provider: ws });
  const provider = new ethers.JsonRpcProvider(EVM_RPC);

  console.log(`=== Revive Withdraw ===`);
  console.log(`SS58: ${ss58}`);
  console.log(`H160: ${h160}`);

  // Load cached tree leaves
  const picklePath = "/home/pi/zk/swap/proxy/tree_cache.pickle";
  const leavesRaw = execSync(
    `python3 -c "
import pickle
with open('${picklePath}', 'rb') as f:
    d = pickle.load(f)
for leaf in d.get('polkadot', {}).get('leaves', []):
    print(leaf)
"`,
    { encoding: "utf8" },
  );
  const cachedLeaves = leavesRaw.trim().split("\n").filter(Boolean).map(BigInt);
  const tree = new LeanIMT();
  for (const lf of cachedLeaves) { if (lf !== 0n) tree.insert(lf); }
  console.log(`Cached tree: ${tree.size} leaves`);

  // Check if our deposit is already in the tree (may have been caught by the proxy monitor)
  const alreadyInTree = tree.findLeafIndex(commitment) !== -1;
  if (!alreadyInTree) {
    tree.insert(commitment);
    console.log("Inserted deposit into tree");
  } else {
    console.log("Deposit already in proxy tree (caught by monitor)");
  }

  // Verify root
  const poolContract = new ethers.Contract(CONTRACT, [
    "function currentRoot() view returns (uint256)",
    "function treeSize() view returns (uint256)",
  ], provider);
  const chainRoot = BigInt((await poolContract.currentRoot()).toString());
  const chainSize = Number(await poolContract.treeSize());
  console.log(`Tree: ${tree.size} leaves, root=${tree.root}`);
  console.log(`Chain: ${chainSize} leaves, root=${chainRoot}`);
  console.log(`Match: ${tree.root === chainRoot ? "YES" : "NO"}`);
  if (tree.root !== chainRoot) throw new Error("Root mismatch!");

  // ZK Proof
  console.log("\n--- ZK Proof ---");
  const SNARK_FIELD = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
  const ctxHash = ethers.keccak256(
    ethers.solidityPacked(["address", "address"], [h160, ethers.ZeroAddress]));
  const context = (BigInt(ctxHash) % SNARK_FIELD).toString();

  const ns = ethers.randomBytes(31);
  const newSecret = "0x" + Array.from(ns).map(b => b.toString(16).padStart(2, "0")).join("");
  const newSecretBN = BigInt(newSecret);
  const newNullifier = poseidon2([newSecretBN, 1n]).toString();
  const leafIdx = tree.findLeafIndex(commitment);
  const merkleProof = tree.getProof(leafIdx);

  const circuitInput = {
    withdrawnValue: AMOUNT_WEI.toString(),
    root: chainRoot.toString(),
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

  const t0 = Date.now();
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    circuitInput,
    "public/withdraw_phase2_fixed_v7.wasm",
    "public/withdraw_phase2_fixed_v7_0001.zkey",
  );
  console.log(`Proof: ${(Date.now() - t0) / 1000}s`);

  // Format
  const formattedProof = [
    [BigInt(proof.pi_a[0]), BigInt(proof.pi_a[1])],
    [[BigInt(proof.pi_b[0][1]), BigInt(proof.pi_b[0][0])],
     [BigInt(proof.pi_b[1][1]), BigInt(proof.pi_b[1][0])]],
    [BigInt(proof.pi_c[0]), BigInt(proof.pi_c[1])],
  ];
  const pub = publicSignals.map((s: string) => BigInt(s));

  // Withdraw
  console.log("\n--- WITHDRAW ---");
  const wdIface = new ethers.Interface([
    "function withdraw(uint256[2],uint256[2][2],uint256[2],uint256[8],address)",
  ]);
  const wd = wdIface.encodeFunctionData("withdraw", [
    formattedProof[0], formattedProof[1], formattedProof[2], pub.slice(0, 8), h160,
  ]);

  const wHash = await new Promise<string>((resolve, reject) => {
    api.tx.revive.call(
      CONTRACT, 0n,
      { refTime: 1_000_000_000_000n, proofSize: 8_000_000n },
      100_000_000_000n.toString(),
      wd,
    ).signAndSend(pair, ({ status, txHash, dispatchError }: any) => {
      if (dispatchError) {
        if (dispatchError.isModule) {
          const { index, error } = api.registry.findMetaError(dispatchError.asModule);
          reject(new Error(`dispatch: ${index}.${error}`));
        } else reject(new Error(dispatchError.toString()));
      }
      if (status.isFinalized) resolve(txHash.toHex());
    }).catch(reject);
  });
  console.log(`Withdraw tx: ${wHash}`);

  const poolRoot = BigInt((await poolContract.currentRoot()).toString());
  console.log(`Pool root after: ${poolRoot}`);
  console.log("\n=== ROUNDTRIP COMPLETE ===");
  await api.disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });