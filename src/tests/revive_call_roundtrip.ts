/**
 * Local Revive Dev Node: Deposit → Withdraw via revive.call (Substrate extrinsics)
 *
 * Uses //Alice (sr25519) → derives H160 → revive.call for both deposit and withdraw.
 * Works against the local revive dev node at ws://127.0.0.1:9944.
 *
 * Key facts:
 *  - Local token: MINI, 12 decimals (1 MINI = 10^12 planck)
 *  - NativeToEthRatio = 1_000_000 → 1 planck = 10^6 wei
 *  - revive.call `value` is native planck; the contract sees msg.value = value * 1e6
 *  - H160 derivation for sr25519: keccak256(pubkey)[12..32]
 *
 * Usage: npx tsx src/tests/revive_call_roundtrip.ts
 *
 * Prerequisites:
 *   make -C /home/pi/nodes/test-node node
 *   make -C /home/pi/nodes/test-node eth-rpc
 *   make -C /home/pi/nodes/test-node deploy
 */
import { ApiPromise, WsProvider } from "@polkadot/api";
import { Keyring } from "@polkadot/keyring";
import { cryptoWaitReady, decodeAddress } from "@polkadot/util-crypto";
import { ethers } from "ethers";
import * as snarkjs from "snarkjs";
import { poseidon1, poseidon2 } from "poseidon-lite";
import * as path from "path";
import * as fs from "fs";

await cryptoWaitReady();

const WS_RPC = "ws://127.0.0.1:9944";
const ETH_RPC = "http://localhost:8545";
const CONTRACT = "0x3ed62137c5DB927cb137c26455969116BF0c23Cb";
const VERIFIER = "0x970951a12F975E6762482ACA81E57D5A2A4e73F4";
const BN254_R = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
const NATIVE_TO_ETH_RATIO = 1_000_000n; // NativeToEthRatio on dev node

// Amount to shield/unshield: 1 MINI = 10^12 planck = 10^18 wei
const AMOUNT_PLANCK = 1_000_000_000_000n; // 1 MINI in native planck
const AMOUNT_WEI = AMOUNT_PLANCK * NATIVE_TO_ETH_RATIO; // 10^18 wei

const poolIface = new ethers.Interface([
  "function treeSize() external view returns (uint256)",
  "function currentRoot() external view returns (uint256)",
  "function isNullifierSpent(bytes32) external view returns (bool)",
]);
const depositIface = new ethers.Interface([
  "function depositNative(bytes32 commitment) external payable",
]);
const withdrawIface = new ethers.Interface([
  "function withdraw(uint256[2] pA, uint256[2][2] pB, uint256[2] pC, uint[8] pubSignals, address recipient) external",
  "event Withdrawal(address indexed asset, uint256 amount, address indexed recipient, uint256 newCommitment)",
]);
const verifierIface = new ethers.Interface([
  "function verifyProof(uint256[2] pA, uint256[2][2] pB, uint256[2] pC, uint256[8] pubSignals) view returns (bool)",
]);

// ── Init ────────────────────────────────────────────────────────────────

const keyring = new Keyring({ type: "sr25519" });
const pair = keyring.addFromUri("//Alice");
const ss58 = pair.address;
const pubkey = decodeAddress(ss58);
// Correct H160 derivation for sr25519 (non-eth-derived): keccak256(pubkey)[12..32]
const userH160 = "0x" + ethers.keccak256(pubkey).slice(2).slice(24);

console.log("=== Revive.call Deposit → Withdraw Roundtrip ===\n");
console.log("SS58 (//Alice):", ss58);
console.log("Derived H160:   ", userH160);
console.log("Pool contract:  ", CONTRACT);
console.log("Verifier:       ", VERIFIER);
console.log("Amount:         ", AMOUNT_PLANCK.toString(), "planck =", AMOUNT_WEI.toString(), "wei");

const ws = new WsProvider(WS_RPC);
const api = await ApiPromise.create({ provider: ws });

const provider = new ethers.JsonRpcProvider(ETH_RPC);

// Verify account is mapped
const mapping: any = await api.query.revive.originalAccount(userH160);
console.log("Account mapped: ", mapping.isEmpty ? "❌ NOT MAPPED" : "✅ " + mapping.toHuman());

const beforeAlithBal = await provider.getBalance(userH160);
const beforePoolBal = await provider.getBalance(CONTRACT);
const beforeSize = parseInt(
  await provider.call({ to: CONTRACT, data: poolIface.encodeFunctionData("treeSize") }),
  16,
);

console.log("\n--- Initial State ---");
console.log("H160 balance:    ", ethers.formatEther(beforeAlithBal));
console.log("Pool balance:    ", ethers.formatEther(beforePoolBal));
console.log("Tree size:       ", beforeSize);

// ======================================================================= //
// PHASE 1: Deposit via revive.call
// ======================================================================= //

console.log("\n" + "=".repeat(60));
console.log(" PHASE 1: DEPOSIT via revive.call ");
console.log("=".repeat(60));

const secretBN = BigInt(ethers.hexlify(ethers.randomBytes(31)));
const nullifier = poseidon2([secretBN, 1n]);
const nullifierHash = poseidon1([nullifier]);
const precommitment = poseidon2([nullifier, secretBN]);
const valueAssetHash = poseidon2([AMOUNT_WEI.toString(), 0n]);
const commitment = poseidon2([valueAssetHash, precommitment]);
const commitmentHex = "0x" + commitment.toString(16).padStart(64, "0");

console.log("Amount (wei):   ", AMOUNT_WEI.toString());
console.log("Commitment:     ", commitmentHex);

const depositCalldata = depositIface.encodeFunctionData("depositNative", [commitmentHex]);

// Storage deposit: the deposit inserts a Merkle leaf (needs ~2.6e9 planck).
// Give a generous limit of 0.1 MINI = 1e11 planck.
const storageDepositLimit = 100_000_000_000n; // 0.1 MINI

const txDeposit = api.tx.revive.call(
  CONTRACT,                            // dest
  AMOUNT_PLANCK.toString(),            // value in native planck
  { refTime: 400_000_000_000n, proofSize: 3_000_000n },  // gas limit (under ~1.17e12 block limit)
  storageDepositLimit.toString(),       // storage deposit limit
  depositCalldata,                     // EVM calldata
);

let depositBlock = 0;
let depositOk = false;

const depositHash = await new Promise<string>((resolve, reject) => {
  txDeposit.signAndSend(pair, ({ status, txHash, dispatchError }: any) => {
    if (dispatchError) {
      console.error("  Dispatch error:", dispatchError.toString());
      reject(new Error(dispatchError.toString()));
      return;
    }
    console.log("  Status:", status.type, txHash?.toHex());
    if ((status.isInBlock || status.isFinalized) && txHash) {
      resolve(txHash.toHex());
    }
  }).catch(reject);
});

await new Promise(r => setTimeout(r, 2000));

// Find deposit event by scanning recent blocks
const header = await api.rpc.chain.getHeader();
const latestBlock = header.number.toNumber();
const depositEventSig = ethers.id("Deposit(address,bytes32)");

for (let b = latestBlock; b >= latestBlock - 10; b--) {
  const blockHash = await api.rpc.chain.getBlockHash(b);
  const events = await api.query.system.events.at(blockHash);
  for (const record of events) {
    if (!record.phase.isApplyExtrinsic) continue;
    const ev = record.event;
    if (
      ev.section === "revive" &&
      ev.method === "ContractEmitted" &&
      ev.data[0]?.toString?.()?.toLowerCase() === CONTRACT.toLowerCase()
    ) {
      const topics = ev.data[2] as any[];
      if (topics[0].toString() === depositEventSig) {
        console.log(`  ✅ Found Deposit event at block ${b}, tx: ${depositHash}`);
        depositBlock = b;
        depositOk = true;
        break;
      }
    }
  }
  if (depositOk) break;
}

console.log("Deposit hash:   ", depositHash);
console.log("Deposit ok:     ", depositOk ? "✅ YES" : "❌ NO");

const afterDepAlithBal = await provider.getBalance(userH160);
const afterDepPoolBal = await provider.getBalance(CONTRACT);
const afterSize = parseInt(
  await provider.call({ to: CONTRACT, data: poolIface.encodeFunctionData("treeSize") }),
  16,
);

console.log("\n--- After Deposit ---");
console.log("H160 balance:    ", ethers.formatEther(afterDepAlithBal));
console.log("Pool balance:    ", ethers.formatEther(afterDepPoolBal));
console.log("Tree size:       ", afterSize);
console.log("DepositΔ(H160):  ", ethers.formatEther(afterDepAlithBal - beforeAlithBal));
console.log("DepositΔ(Pool):  ", ethers.formatEther(afterDepPoolBal - beforePoolBal));

if (!depositOk) {
  console.error("❌ Deposit failed. Check tx above for dispatch errors.");
  await api.disconnect();
  process.exit(1);
}

// ======================================================================= //
// PHASE 2: Build Merkle tree from Substrate events
// ======================================================================= //
// revive.call deposits do NOT appear in eth_getLogs — they are emitted as
// Substrate `revive.ContractEmitted` events. Scan Substrate events from the
// deployment block to capture ALL leaves (deposits + newCommitments) in order.
// ======================================================================= //

console.log("\n" + "=".repeat(60));
console.log(" PHASE 2: MERKLE TREE (Substrate events) ");
console.log("=".repeat(60));

const depositSig = ethers.id("Deposit(address,bytes32)");
const newCommitmentTopic = ethers.id("NewCommitment(bytes32)");
const withdrawalTopic = ethers.id("Withdrawal(address,uint256,address,uint256)");

interface TreeState {
  leaves: bigint[];
  sideNodes: Map<number, bigint>;
  root: bigint;
  depth: number;
}

function insertIntoTree(tree: TreeState, leaf: bigint) {
  const idx = tree.leaves.length;
  tree.leaves.push(leaf);
  let d = tree.depth;
  while ((1n << BigInt(d)) < BigInt(idx + 1)) d++;
  tree.depth = d;
  let node = leaf;
  for (let level = 0; level < d; level++) {
    if ((idx >> level) & 1) {
      const sn = tree.sideNodes.get(level) ?? 0n;
      node = poseidon2([sn, node]);
      tree.sideNodes.delete(level);
    } else {
      tree.sideNodes.set(level, node);
      break;
    }
  }
  tree.root = node;
}

async function buildTreeFromSubstrateEvents(fromBlock: number): Promise<TreeState> {
  const tree: TreeState = { leaves: [], sideNodes: new Map(), root: 0n, depth: 0 };
  const header = await api.rpc.chain.getHeader();
  const latest = header.number.toNumber();
  const seen = new Set<string>();

  for (let b = fromBlock; b <= latest; b++) {
    const blockHash = await api.rpc.chain.getBlockHash(b);
    const events = await api.query.system.events.at(blockHash);
    for (const record of events) {
      if (!record.phase.isApplyExtrinsic) continue;
      const ev = record.event;
      if (
        ev.section === "revive" &&
        ev.method === "ContractEmitted" &&
        ev.data[0]?.toString?.()?.toLowerCase() === CONTRACT.toLowerCase()
      ) {
        const topics = ev.data[2] as any[];
        const sig = topics[0].toString();
        if (sig === depositSig || sig === newCommitmentTopic) {
          // data[1] = non-indexed data (commitment / newCommitmentHash)
          const leaf = BigInt(ev.data[1].toString());
          if (leaf === 0n) continue;
          const key = leaf.toString();
          if (seen.has(key)) continue;
          seen.add(key);
          insertIntoTree(tree, leaf);
        }
      }
    }
  }
  return tree;
}

function buildLayers(leaves: bigint[]): bigint[][] {
  const layers: bigint[][] = [leaves.slice()];
  for (let lvl = 0; lvl < 128 && layers[lvl].length > 1; lvl++) {
    const cur = layers[lvl];
    const nxt: bigint[] = [];
    for (let i = 0; i < cur.length; i += 2) {
      nxt.push(i + 1 < cur.length ? poseidon2([cur[i], cur[i + 1]]) : cur[i]);
    }
    layers.push(nxt);
  }
  return layers;
}

function getProof(layers: bigint[][], leafIdx: number) {
  const siblings: string[] = [];
  let idx = leafIdx;
  for (let lvl = 0; lvl < layers.length - 1 && lvl < 128; lvl++) {
    const cur = layers[lvl];
    const sib = (idx & 1) ? cur[idx - 1] : (idx + 1 < cur.length ? cur[idx + 1] : 0n);
    siblings.push(sib.toString());
    idx = Math.floor(idx / 2);
  }
  while (siblings.length < 128) siblings.push("0");
  return { siblings, root: layers[layers.length - 1][0].toString(), leafIndex: leafIdx };
}

const tree = await buildTreeFromSubstrateEvents(0);
console.log("Tree leaves:     ", tree.leaves.length);

const layers = buildLayers(tree.leaves);
const fullRoot = layers[layers.length - 1][0];

const chainRoot = BigInt(
  await provider.call({ to: CONTRACT, data: poolIface.encodeFunctionData("currentRoot") }),
);
console.log("Local root:      ", fullRoot.toString());
console.log("Chain root:      ", chainRoot.toString());
console.log("Root match:      ", fullRoot === chainRoot ? "✅" : "❌");

const leafIdx = tree.leaves.findIndex(l => l === commitment);
if (leafIdx === -1) {
  console.error("❌ Commitment not in tree!");
  await api.disconnect();
  process.exit(1);
}
console.log("Leaf index:      ", leafIdx);

const mp = getProof(layers, leafIdx);
console.log("Non-0 siblings:  ", mp.siblings.filter(s => s !== "0").length);

// ======================================================================= //
// PHASE 3: ZK PROOF
// ======================================================================= //

console.log("\n" + "=".repeat(60));
console.log(" PHASE 3: ZK PROOF ");
console.log("=".repeat(60));

const wasmPath = path.join(process.cwd(), "public", "withdraw_phase2_fixed_v7.wasm");
const zkeyPath = path.join(process.cwd(), "public", "withdraw_phase2_fixed_v7_0001.zkey");
if (!fs.existsSync(wasmPath) || !fs.existsSync(zkeyPath)) {
  console.error("❌ Circuit files missing");
  await api.disconnect();
  process.exit(1);
}

const context = BigInt(ethers.keccak256(ethers.solidityPacked(["address", "address"], [userH160, ethers.ZeroAddress]))) % BN254_R;
const newSecret = ethers.hexlify(ethers.randomBytes(31));
const newNullifier = poseidon2([BigInt(newSecret), 1n]).toString();

console.log("Proving...");
const t0 = Date.now();
const { proof, publicSignals } = await snarkjs.groth16.fullProve(
  {
    withdrawnValue: AMOUNT_WEI.toString(),
    root: chainRoot.toString(),
    treeDepth: "128",
    context: context.toString(),
    asset: "0x0000000000000000000000000000000000000000",
    existingValue: AMOUNT_WEI.toString(),
    existingNullifier: nullifier.toString(),
    existingSecret: secretBN.toString(),
    newNullifier,
    newSecret: BigInt(newSecret).toString(),
    siblings: mp.siblings,
    leafIndex: leafIdx.toString(),
  },
  wasmPath,
  zkeyPath,
);
console.log(`✅ ${((Date.now() - t0) / 1000).toFixed(1)}s`);

const formattedProof = [
  [BigInt(proof.pi_a[0]), BigInt(proof.pi_a[1])],
  [
    [BigInt(proof.pi_b[0][1]), BigInt(proof.pi_b[0][0])],
    [BigInt(proof.pi_b[1][1]), BigInt(proof.pi_b[1][0])],
  ],
  [BigInt(proof.pi_c[0]), BigInt(proof.pi_c[1])],
];

// Verify proof on-chain
console.log("Verifying ZK proof on-chain...");
const vCalldata = verifierIface.encodeFunctionData("verifyProof", [
  formattedProof[0], formattedProof[1], formattedProof[2],
  publicSignals.map((s: string) => BigInt(s)),
]);
const vResult = await provider.call({ to: VERIFIER, data: vCalldata });
const valid = vResult === "0x0000000000000000000000000000000000000000000000000000000000000001";
console.log("Verifier result:", valid ? "✅ VALID" : "❌ INVALID");
if (!valid) {
  console.error("❌ Proof invalid");
  await api.disconnect();
  process.exit(1);
}

// ======================================================================= //
// PHASE 4: WITHDRAW via revive.call
// ======================================================================= //

console.log("\n" + "=".repeat(60));
console.log(" PHASE 4: WITHDRAW via revive.call ");
console.log("=".repeat(60));

const withdrawCalldata = withdrawIface.encodeFunctionData("withdraw", [
  formattedProof[0],
  formattedProof[1],
  formattedProof[2],
  publicSignals.map((s: string) => BigInt(s)),
  userH160,
]);

const beforeWdAlithBal = await provider.getBalance(userH160);
const beforeWdPoolBal = await provider.getBalance(CONTRACT);

const txWithdraw = api.tx.revive.call(
  CONTRACT,
  "0",
  { refTime: 400_000_000_000n, proofSize: 4_000_000n },
  storageDepositLimit.toString(),
  withdrawCalldata,
);

let withdrawOk = false;
const withdrawHash = await new Promise<string>((resolve, reject) => {
  txWithdraw.signAndSend(pair, ({ status, txHash, dispatchError }: any) => {
    if (dispatchError) {
      console.error("  Dispatch error:", dispatchError.toString());
      reject(new Error(dispatchError.toString()));
      return;
    }
    console.log("  Status:", status.type, txHash?.toHex());
    if ((status.isInBlock || status.isFinalized) && txHash) {
      resolve(txHash.toHex());
    }
  }).catch(reject);
});

await new Promise(r => setTimeout(r, 2000));

// Find withdraw event
const wEventSig = ethers.id("Withdrawal(address,uint256,address,uint256)");
const header2 = await api.rpc.chain.getHeader();
for (let b = header2.number.toNumber(); b >= header2.number.toNumber() - 10; b--) {
  const blockHash = await api.rpc.chain.getBlockHash(b);
  const events = await api.query.system.events.at(blockHash);
  for (const record of events) {
    if (!record.phase.isApplyExtrinsic) continue;
    const ev = record.event;
    if (
      ev.section === "revive" &&
      ev.method === "ContractEmitted" &&
      ev.data[0]?.toString?.()?.toLowerCase() === CONTRACT.toLowerCase()
    ) {
      const topics = ev.data[2] as any[];
      if (topics[0].toString() === wEventSig) {
        console.log(`  ✅ Found Withdrawal event at block ${b}`);
        withdrawOk = true;
        break;
      }
    }
  }
  if (withdrawOk) break;
}

console.log("Withdraw hash:  ", withdrawHash);
console.log("Withdraw ok:    ", withdrawOk ? "✅ YES" : "❌ NO");

const afterWdAlithBal = await provider.getBalance(userH160);
const afterWdPoolBal = await provider.getBalance(CONTRACT);
const afterWdSize = parseInt(
  await provider.call({ to: CONTRACT, data: poolIface.encodeFunctionData("treeSize") }),
  16,
);

console.log("\n--- After Withdraw ---");
console.log("H160 balance:    ", ethers.formatEther(afterWdAlithBal));
console.log("Pool balance:    ", ethers.formatEther(afterWdPoolBal));
console.log("Tree size:       ", afterWdSize);
console.log("WithdrawΔ(H160): ", ethers.formatEther(afterWdAlithBal - beforeWdAlithBal));
console.log("WithdrawΔ(Pool): ", ethers.formatEther(afterWdPoolBal - beforeWdPoolBal));

// ======================================================================= //
// SUMMARY
// ======================================================================= //

console.log("\n" + "=".repeat(60));
console.log(" ROUNDTRIP SUMMARY ");
console.log("=".repeat(60));
console.log("Amount:             ", ethers.formatEther(AMOUNT_WEI));
console.log("Deposit:            ", depositOk ? "✅" : "❌");
console.log("Root match:         ", fullRoot === chainRoot ? "✅" : "❌");
console.log("ZK proof:           ", "✅");
console.log("Verifier:           ", valid ? "✅" : "❌");
console.log("Withdraw:           ", withdrawOk ? "✅" : "❌");
console.log("H160 Δ:             ", ethers.formatEther(afterWdAlithBal - beforeAlithBal));
console.log("Pool Δ:             ", ethers.formatEther(afterWdPoolBal - beforePoolBal));

await api.disconnect();
console.log("\nDone!");
process.exit(0);