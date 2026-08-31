/**
 * Full roundtrip: deposit → inspect Substrate events → withdraw
 * All via eth-rpc + Substrate WS against local revive dev node.
 *
 * Usage: npx tsx src/tests/deposit_events_and_withdraw.ts
 */
import { ApiPromise, WsProvider } from "@polkadot/api";
import { cryptoWaitReady } from "@polkadot/util-crypto";
import { ethers } from "ethers";
import * as snarkjs from "snarkjs";
import { poseidon1, poseidon2 } from "poseidon-lite";
import * as path from "path";
import * as fs from "fs";

// =========================================================================== //
// Config
// =========================================================================== //

const ETH_RPC = "http://localhost:8545";
const WS_RPC = "ws://127.0.0.1:9944";
const CONTRACT = "0x3ed62137c5DB927cb137c26455969116BF0c23Cb";
const VERIFIER = "0x970951a12F975E6762482ACA81E57D5A2A4e73F4";
const POSEIDON = "0xc01Ee7f10EA4aF4673cFff62710E1D7792aBa8f3";
const ALITH_KEY = "0x5fb92d6e98884f76de468fa3f6278f8807c48bebc13595d45af5bdc4da702133";
const BN254_R = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;

// =========================================================================== //
// Init
// =========================================================================== //

await cryptoWaitReady();

const provider = new ethers.JsonRpcProvider(ETH_RPC);
const wallet = new ethers.Wallet(ALITH_KEY, provider);
const aliceH160 = wallet.address;

// Also connect Substrate WS for event inspection
const ws = new WsProvider(WS_RPC);
const api = await ApiPromise.create({ provider: ws });

console.log("=== Full Roundtrip: Deposit → Events → Withdraw ===\n");
console.log("Alith:", aliceH160);
console.log("Contract:", CONTRACT);
console.log("Alith ETH balance:", ethers.formatEther(await provider.getBalance(aliceH160)));
const initAlithBalance = await provider.getBalance(aliceH160);
const initContractBalance = await provider.getBalance(CONTRACT);

const poolIface = new ethers.Interface([
  "function treeSize() external view returns (uint256)",
  "function currentRoot() external view returns (uint256)",
]);

const beforeSize = parseInt(
  await provider.call({ to: CONTRACT, data: poolIface.encodeFunctionData("treeSize") }),
  16,
);
console.log("Tree size before:", beforeSize);

// =========================================================================== //
// PHASE 1: DEPOSIT via eth-rpc
// =========================================================================== //

console.log("\n" + "=".repeat(60));
console.log(" PHASE 1: DEPOSIT ");
console.log("=".repeat(60));

const amountPlanck = 1_000_000n;
const secretBytes = ethers.randomBytes(31);
const secretHex = "0x" + Array.from(secretBytes).map(b => b.toString(16).padStart(2, "0")).join("");
const secretBN = BigInt(secretHex);
const nullifier = poseidon2([secretBN, 1n]);
const nullifierHash = poseidon1([nullifier]);
const precommitment = poseidon2([nullifier, secretBN]);
const valueAssetHash = poseidon2([amountPlanck.toString(), 0n]);
const commitment = poseidon2([valueAssetHash, precommitment]);
const commitmentHex = "0x" + commitment.toString(16).padStart(64, "0");

console.log("Amount:", amountPlanck.toString(), "planck");
console.log("Commitment:", commitmentHex);

const depositIface = new ethers.Interface(["function depositNative(bytes32) payable"]);
const depositCalldata = depositIface.encodeFunctionData("depositNative", [commitmentHex]);

const gas = await provider.estimateGas({
  from: wallet.address, to: CONTRACT, value: amountPlanck, data: depositCalldata,
});
console.log("Estimated gas:", gas.toString());

const depositTx = await wallet.sendTransaction({
  to: CONTRACT, value: amountPlanck, data: depositCalldata,
  gasLimit: BigInt(gas) * 3n / 2n,
});
console.log("Deposit tx:", depositTx.hash);
const depositReceipt = await depositTx.wait();
const depositBlock = depositReceipt?.blockNumber ?? 0;
console.log("Status:", depositReceipt?.status === 1 ? "✅" : "❌");
console.log("Block:", depositBlock);

const afterDepositAlithBalance = await provider.getBalance(aliceH160);
const afterDepositContractBalance = await provider.getBalance(CONTRACT);
const depositGasCost = depositReceipt?.gasUsed ? depositReceipt.gasUsed * depositReceipt.gasPrice : 0n;
const alithDeltaDeposit = afterDepositAlithBalance - initAlithBalance;
const contractDeltaDeposit = afterDepositContractBalance - initContractBalance;
console.log(`\n  === Balance Changes (Deposit) ===`);
console.log(`  Alith:   ${ethers.formatEther(initAlithBalance)} → ${ethers.formatEther(afterDepositAlithBalance)}`);
console.log(`           Δ = ${ethers.formatEther(alithDeltaDeposit)} ETH (sent ${ethers.formatEther(amountPlanck)} + gas ${ethers.formatEther(depositGasCost)})`);
console.log(`  Pool:    ${ethers.formatEther(initContractBalance)} → ${ethers.formatEther(afterDepositContractBalance)}`);
console.log(`           Δ = +${ethers.formatEther(contractDeltaDeposit)} ETH`);

const afterSize = parseInt(
  await provider.call({ to: CONTRACT, data: poolIface.encodeFunctionData("treeSize") }),
  16,
);
console.log("Tree size after:", afterSize);
console.log("Deposit succeeded:", afterSize > beforeSize ? "✅ YES" : "❌ NO");

// =========================================================================== //
// PHASE 2: INSPECT SUBSTRATE EVENTS
// =========================================================================== //

console.log("\n" + "=".repeat(60));
console.log(" PHASE 2: SUBSTRATE EVENTS ");
console.log("=".repeat(60));

const blockHash = await api.rpc.chain.getBlockHash(depositBlock);
const events = await api.query.system.events.at(blockHash);
const signedBlock = await api.rpc.chain.getBlock(blockHash);

// Find our extrinsic by looking for ethereum.transact (eth-rpc) or revive.call (direct)
let extIdx = -1;
for (let i = 0; i < signedBlock.block.extrinsics.length; i++) {
  const ext = signedBlock.block.extrinsics[i];
  if (
    (ext.method.section === "ethereum" && ext.method.method === "transact") ||
    (ext.method.section === "revive" && ext.method.method === "call")
  ) {
    extIdx = i;
    break;
  }
}

// Fallback: if no matching extrinsic by section, scan all events for revive events
if (extIdx === -1) {
  console.log("Could not find extrinsic by section, scanning all events...");
  // Just show all events in the block (instant-seal has few)
  for (const record of events) {
    const ev = record.event;
    if (ev.section === "revive" || ev.section === "ethereum") {
      console.log(`  [BLOCK] ${ev.section}.${ev.method} ${ev.data.toHex().substring(0, 60)}`);
    }
  }
}

console.log(`Block #${depositBlock}, ext idx for events: ${extIdx}`);

const depositEventSig = ethers.id("Deposit(address,bytes32)");

for (const record of events) {
  if (!record.phase.isApplyExtrinsic) continue;
  if (record.phase.asApplyExtrinsic.toNumber() !== extIdx) continue;
  const ev = record.event;
  console.log(`  ${ev.section}.${ev.method}`);

  if (ev.section === "revive" && ev.method === "ContractEmitted") {
    const cAddr = ev.data[0].toString();
    const nonIndexed = ev.data[1].toString();
    const topicsVec = ev.data[2] as any[];
    const eventSig = topicsVec[0].toString();
    const topic1 = topicsVec.length > 1 ? topicsVec[1].toString() : "0x";

    console.log(`    contract: ${cAddr}`);
    console.log(`    non-indexed-data: ${nonIndexed}`);
    console.log(`    event-sig: ${eventSig}`);
    console.log(`    topic[1]: ${topic1}`);

    if (eventSig === depositEventSig) {
      console.log(`    ✅ This is the 'Deposit(address,bytes32)' event!`);
      console.log(`    ✅ Commitment: ${nonIndexed} == ${commitmentHex} ? ${nonIndexed === commitmentHex ? "YES" : "NO"}`);
      console.log(`    ✅ Asset: ${topic1 === "0x0000000000000000000000000000000000000000000000000000000000000000" ? "NATIVE" : topic1}`);
    }
  }
}

// =========================================================================== //
// PHASE 3: BUILD MERKLE TREE FROM EVM LOGS
// =========================================================================== //

console.log("\n" + "=".repeat(60));
console.log(" PHASE 3: MERKLE TREE ");
console.log("=".repeat(60));

const depositSig = depositEventSig; // reuse from above
const newCommitmentTopic = ethers.id("NewCommitment(bytes32)");

// Build full binary Merkle tree from leaves (matches chain currentRoot)
interface TreeState {
  leaves: bigint[];
  sideNodes: Map<number, bigint>;
  root: bigint;
  depth: number;
}

async function buildTree(startBlock: number): Promise<TreeState> {
  const logs = await provider.getLogs({
    address: CONTRACT,
    fromBlock: startBlock,
    toBlock: "latest",
    topics: [[depositSig, newCommitmentTopic]],
  });

  const events: { blockNumber: number; logIndex: number; leaf: bigint }[] = [];
  for (const log of logs) {
    if (log.topics[0] === depositSig || log.topics[0] === newCommitmentTopic) {
      events.push({ blockNumber: log.blockNumber, logIndex: log.index, leaf: BigInt(log.data) });
    }
  }
  events.sort((a, b) =>
    a.blockNumber !== b.blockNumber ? a.blockNumber - b.blockNumber : a.logIndex - b.logIndex,
  );

  const tree: TreeState = { leaves: [], sideNodes: new Map(), root: 0n, depth: 0 };
  for (const ev of events) {
    if (ev.leaf === 0n) continue;
    const index = tree.leaves.length;
    tree.leaves.push(ev.leaf);
    let d = tree.depth;
    while ((1n << BigInt(d)) < BigInt(index + 1)) d++;
    tree.depth = d;
    let node = ev.leaf;
    for (let level = 0; level < d; level++) {
      const key = level;
      if ((index >> level) & 1) {
        const sideNode = tree.sideNodes.get(key) ?? 0n;
        node = poseidon2([sideNode, node]);
        tree.sideNodes.delete(key);
      } else {
        tree.sideNodes.set(key, node);
        break;
      }
    }
    tree.root = node;
  }
  return tree;
}

const tree = await buildTree(0);
console.log(`Leaves: ${tree.leaves.length}`);

// Build full Merkle tree layers for proof generation (matching chain currentRoot)
function buildFullLayers(leaves: bigint[]): bigint[][] {
  const layers: bigint[][] = [leaves.slice()];
  for (let level = 0; level < 128 && layers[level].length > 1; level++) {
    const current = layers[level];
    const next: bigint[] = [];
    for (let i = 0; i < current.length; i += 2) {
      next.push(i + 1 < current.length ? poseidon2([current[i], current[i + 1]]) : current[i]);
    }
    layers.push(next);
  }
  return layers;
}

const layers = buildFullLayers(tree.leaves);

function getFullTreeProof(leafIndex: number) {
  const siblings: string[] = [];
  let idx = leafIndex;
  for (let level = 0; level < layers.length - 1 && level < 128; level++) {
    const current = layers[level];
    const sib = (idx % 2 === 0) ? (idx + 1 < current.length ? current[idx + 1] : 0n) : current[idx - 1];
    siblings.push(sib.toString());
    idx = Math.floor(idx / 2);
  }
  while (siblings.length < 128) siblings.push("0");
  return { siblings, root: layers[layers.length - 1][0].toString(), leafIndex };
}

const leafIdx = tree.leaves.findIndex(l => l === commitment);
if (leafIdx === -1) {
  console.log("❌ Commitment not in tree!");
  await api.disconnect();
  process.exit(1);
}
console.log(`Leaf index: ${leafIdx}`);
console.log(`Leaves: ${tree.leaves.map(l => l.toString().substring(0, 20) + "...")}`);

const fullRoot = layers[layers.length - 1][0];
const chainRoot = BigInt(
  await provider.call({ to: CONTRACT, data: poolIface.encodeFunctionData("currentRoot") }),
);
console.log(`Full root: ${fullRoot}`);
console.log(`Chain root: ${chainRoot}`);
console.log(`Root match: ${chainRoot === fullRoot ? "✅" : "❌"}`);

const mp = getFullTreeProof(leafIdx);
console.log(`Non-zero siblings: ${mp.siblings.filter((s: string) => s !== "0").length}`);

// =========================================================================== //
// PHASE 4: ZK PROOF
// =========================================================================== //

console.log("\n" + "=".repeat(60));
console.log(" PHASE 4: ZK PROOF ");
console.log("=".repeat(60));

const wasmPath = path.join(process.cwd(), "public", "withdraw_phase2_fixed_v7.wasm");
const zkeyPath = path.join(process.cwd(), "public", "withdraw_phase2_fixed_v7_0001.zkey");
if (!fs.existsSync(wasmPath) || !fs.existsSync(zkeyPath)) {
  console.log("❌ Circuit files missing:", wasmPath, zkeyPath);
  await api.disconnect();
  process.exit(1);
}

const context = BigInt(ethers.keccak256(ethers.solidityPacked(["address"], [aliceH160]))) % BN254_R;
const newSecret = ethers.hexlify(ethers.randomBytes(31));
const newNullifier = poseidon2([BigInt(newSecret), 1n]).toString();

console.log("Proving...");
const t0 = Date.now();
const { proof, publicSignals } = await snarkjs.groth16.fullProve(
  {
    withdrawnValue: amountPlanck.toString(),
    root: mp.root,
    treeDepth: "128",
    context: context.toString(),
    asset: "0x0000000000000000000000000000000000000000",
    existingValue: amountPlanck.toString(),
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

// =========================================================================== //
// PHASE 5: WITHDRAW via eth-rpc
// =========================================================================== //

console.log("\n" + "=".repeat(60));
console.log(" PHASE 5: WITHDRAW ");
console.log("=".repeat(60));

// Print deposit note first (so we can retry with it)
console.log("\n=== Deposit Note ===");
console.log(JSON.stringify({
  secret: secretHex,
  nullifier: "0x" + nullifier.toString(16).padStart(64, "0"),
  nullifierHash: "0x" + nullifierHash.toString(16).padStart(64, "0"),
  commitment: commitmentHex,
  amount: amountPlanck.toString(),
  leafIndex: leafIdx,
  treeRoot: mp.root,
}, null, 2));
console.log("\nPublic signals:");
const psData = publicSignals.map((s: string) => BigInt(s));
console.log("  [0] newCommitmentHash:", "0x" + psData[0].toString(16));
console.log("  [1] existingNullifierHash:", "0x" + psData[1].toString(16));
console.log("  [2] contextHash:", "0x" + psData[2].toString(16));
console.log("  [3] withdrawnValue:", psData[3].toString());
console.log("  [4] treeDepth:", psData[4].toString());
console.log("  [5] context:", "0x" + psData[5].toString(16));
console.log("  [6] root:", "0x" + psData[6].toString(16));
console.log("  [7] asset:", "0x" + psData[7].toString(16));

// Check spent
const poolIface2 = new ethers.Interface([
  "function spentNullifiers(bytes32) view returns (bool)",
]);
const spentHex = "0x" + psData[1].toString(16).padStart(64, "0");
const isSpent = BigInt(await provider.call({ to: CONTRACT, data: poolIface2.encodeFunctionData("spentNullifiers", [spentHex]) }));
console.log("Nullifier already spent:", isSpent !== 0n ? "YES ❌" : "NO ✅");

// Test verifier directly
console.log("\nTesting verifier.verifyProof...");
console.log("  pA:", formattedProof[0].map(v=>v.toString()));
console.log("  pB0:", formattedProof[1][0].map(v=>v.toString()));
console.log("  pB1:", formattedProof[1][1].map(v=>v.toString()));
console.log("  pC:", formattedProof[2].map(v=>v.toString()));
const verifierIface = new ethers.Interface([
  "function verifyProof(uint256[2] pA, uint256[2][2] pB, uint256[2] pC, uint256[8] pubSignals) view returns (bool)",
]);
const vCalldata = verifierIface.encodeFunctionData("verifyProof", [
  formattedProof[0], formattedProof[1], formattedProof[2],
  publicSignals.map((s: string) => BigInt(s)),
]);
try {
  const vResult = await provider.call({ to: VERIFIER, data: vCalldata });
  console.log("  result:", vResult, vResult === "0x0000000000000000000000000000000000000000000000000000000000000001" ? "✅ VALID" : "❌ INVALID");
} catch(e: any) { console.log("  verifier call failed:", e.shortMessage); }

// Send withdraw tx directly (skip estimateGas)
console.log("\nSubmitting withdraw (skip estimateGas)...");
const withdrawIface = new ethers.Interface([
  "function withdraw(uint256[2] pA, uint256[2][2] pB, uint256[2] pC, uint[8] pubSignals, address recipient) external",
  "event Withdrawal(address indexed asset, uint256 amount, address indexed recipient, uint256 newCommitment)",
]);
const withdrawCalldata = withdrawIface.encodeFunctionData("withdraw", [
  formattedProof[0], formattedProof[1], formattedProof[2],
  publicSignals.map((s: string) => BigInt(s)),
  aliceH160,
]);
try {
  const beforeWithdrawAlithBalance = await provider.getBalance(aliceH160);
  const beforeWithdrawContractBalance = await provider.getBalance(CONTRACT);

  const wTx = await wallet.sendTransaction({
    to: CONTRACT, data: withdrawCalldata, gasLimit: 50000000n,
  });
  console.log("Withdraw tx:", wTx.hash);
  const wReceipt = await wTx.wait();
  console.log("Status:", wReceipt?.status === 1 ? "✅" : "❌");
  console.log("Block:", wReceipt?.blockNumber);

  const afterWithdrawAlithBalance = await provider.getBalance(aliceH160);
  const afterWithdrawContractBalance = await provider.getBalance(CONTRACT);
  const withdrawGasCost = wReceipt?.gasUsed ? wReceipt.gasUsed * wReceipt.gasPrice : 0n;
  const alithDeltaWithdraw = afterWithdrawAlithBalance - beforeWithdrawAlithBalance;
  const contractDeltaWithdraw = afterWithdrawContractBalance - beforeWithdrawContractBalance;

  console.log(`\n  === Balance Changes (Withdraw) ===`);
  console.log(`  Alith:   ${ethers.formatEther(beforeWithdrawAlithBalance)} → ${ethers.formatEther(afterWithdrawAlithBalance)}`);
  console.log(`           Δ = ${ethers.formatEther(alithDeltaWithdraw)} ETH (received ${ethers.formatEther(amountPlanck)} − gas ${ethers.formatEther(withdrawGasCost)})`);
  console.log(`  Pool:    ${ethers.formatEther(beforeWithdrawContractBalance)} → ${ethers.formatEther(afterWithdrawContractBalance)}`);
  console.log(`           Δ = ${ethers.formatEther(contractDeltaWithdraw)} ETH`);

  // Check for withdrawal event
  if (wReceipt?.status === 1) {
    const withdrawEventSig = ethers.id("Withdrawal(address,uint256,address,uint256)");
    const wLogs = await provider.getLogs({ address: CONTRACT, fromBlock: wReceipt.blockNumber, toBlock: wReceipt.blockNumber });
    for (const log of wLogs) {
      if (log.topics[0] === withdrawEventSig) {
        try {
          const decoded = withdrawIface.decodeEventLog("Withdrawal", log.data, log.topics) as any;
          console.log("  \n  ✅ Withdrawal event:", decoded[1].toString(), "planck to", decoded[2]);
        } catch {
          console.log("  \n  ✅ Withdrawal event found (raw data:", log.data.substring(0, 50), "...)");
        }
      }
    }
  }
} catch(e: any) {
  console.log("Withdraw failed:", e.shortMessage || e.message);
}

// =========================================================================== //
// SUMMARY
// =========================================================================== //

const finalAlithBalance = await provider.getBalance(aliceH160);
const finalContractBalance = await provider.getBalance(CONTRACT);

console.log("\n" + "=".repeat(60));
console.log(" ROUNDTRIP SUMMARY ");
console.log("=".repeat(60));
console.log(`  Amount shielded/unshielded: ${ethers.formatEther(amountPlanck)} ETH`);
console.log(`  Alith final balance:       ${ethers.formatEther(finalAlithBalance)} ETH`);
console.log(`  Pool final balance:        ${ethers.formatEther(finalContractBalance)} ETH`);
console.log(`  Total gas cost:            ~${ethers.formatEther(initAlithBalance - finalAlithBalance)} ETH`);

// =========================================================================== //
// Cleanup
// =========================================================================== //

await api.disconnect();
console.log("\nDone!");
process.exit(0);