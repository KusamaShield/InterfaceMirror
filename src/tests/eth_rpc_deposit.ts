import { ethers } from "ethers";
import { poseidon2 } from "poseidon-lite";

const RPC = "http://localhost:8545";
const KEY = "0x5fb92d6e98884f76de468fa3f6278f8807c48bebc13595d45af5bdc4da702133";
const CONTRACT = "0xEC69d4f48f4f1740976968FAb9828d645Ad1d77f";

const provider = new ethers.JsonRpcProvider(RPC);
const wallet = new ethers.Wallet(KEY, provider);

const poolIface = new ethers.Interface(["function treeSize() view returns (uint256)"]);
const before = parseInt(
  await provider.call({ to: CONTRACT, data: poolIface.encodeFunctionData("treeSize") }),
  16,
);
console.log("Tree size before:", before);

const bytes = ethers.randomBytes(31);
const secretHex = "0x" + Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
const secretBN = BigInt(secretHex);
const n = poseidon2([secretBN, 1n]);
const val = poseidon2([1000000n.toString(), 0n]);
const commitment = poseidon2([val, poseidon2([n, secretBN])]);
const commitmentHex = "0x" + commitment.toString(16).padStart(64, "0");

const iface = new ethers.Interface(["function depositNative(bytes32) payable"]);
const data = iface.encodeFunctionData("depositNative", [commitmentHex]);

const gas = await provider.estimateGas({
  from: wallet.address, to: CONTRACT, value: 1000000n, data,
});
console.log("Estimated gas:", gas.toString());

const tx = await wallet.sendTransaction({
  to: CONTRACT, value: 1000000n, data, gasLimit: BigInt(gas) * 3n / 2n,
});
console.log("Tx hash:", tx.hash);
const receipt = await tx.wait();
console.log("Status:", receipt?.status === 1 ? "✅" : "❌");
console.log("Block:", receipt?.blockNumber);

const after = parseInt(
  await provider.call({ to: CONTRACT, data: poolIface.encodeFunctionData("treeSize") }),
  16,
);
console.log("Tree size after:", after, after > before ? "✅" : "❌");

console.log("\n=== Deposit Note ===");
console.log("SECRET:", secretHex);
console.log("COMMITMENT:", commitmentHex);
console.log("NULLIFIER:", "0x" + n.toString(16).padStart(64, "0"));