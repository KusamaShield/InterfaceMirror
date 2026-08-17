import { ethers } from "ethers";
import { poseidon2 } from "poseidon-lite";
import * as dotenv from "dotenv";
dotenv.config();

const ethPrivateKey = process.env.ETH_PRIVATE_KEY;
if (!ethPrivateKey) throw new Error("ETH_PRIVATE_KEY not set");

const CONTRACT = "0x0D694Da746e73D1e255c1894F90e38170db45809";
const RPC = "https://polkadot-assethub-rpc.laissez-faire.trade/";
const CHAIN_ID = 420_420_419;

console.log("=== Path B: eth_sendRawTransaction ===\n");

const provider = new ethers.JsonRpcProvider(RPC, CHAIN_ID, {
  staticNetwork: ethers.Network.from(CHAIN_ID),
});
const wallet = new ethers.Wallet(ethPrivateKey, provider);

console.log("ETH address:", wallet.address);

// Check balance
const balance = await provider.getBalance(wallet.address);
console.log("ETH balance:", ethers.formatEther(balance), "DOT");
console.log("ETH balance (wei):", balance.toString());

// Pool info
const poolIface = new ethers.Interface(["function treeSize() external view returns (uint256)"]);
const sizeResult = await provider.call({ to: CONTRACT, data: poolIface.encodeFunctionData("treeSize") });
console.log("Pool size:", parseInt(sizeResult, 16));

// Generate commitment
const secretBytes = ethers.randomBytes(31);
const secretBN = BigInt("0x" + Array.from(secretBytes).map(b => b.toString(16).padStart(2, "0")).join(""));
const amountWei = ethers.parseEther("1.0");
const nullifier = poseidon2([secretBN, 1n]);
const precommitment = poseidon2([nullifier, secretBN]);
const valueAssetHash = poseidon2([amountWei.toString(), 0n]);
const commitment = poseidon2([valueAssetHash, precommitment]);
const commitmentHex = "0x" + commitment.toString(16).padStart(64, "0");

// Build deposit call
const depositIface = new ethers.Interface(["function depositNative(bytes32 commitment) external payable"]);
const calldata = depositIface.encodeFunctionData("depositNative", [commitmentHex]);

console.log("\n=== Building Transaction ===");
console.log("Commitment:", commitmentHex);

// Get nonce
const nonce = await provider.getTransactionCount(wallet.address);
console.log("Nonce:", nonce);

// Get fee data
const feeData = await provider.getFeeData();
console.log("Gas price:", feeData.gasPrice?.toString());
console.log("Max fee:", feeData.maxFeePerGas?.toString());

// Estimate gas
let gasLimit;
try {
  gasLimit = await provider.estimateGas({
    from: wallet.address,
    to: CONTRACT,
    value: amountWei,
    data: calldata,
  });
  console.log("Estimated gas:", gasLimit.toString());
} catch (e: any) {
  console.log("Gas estimate failed:", e.message?.slice(0, 100));
  gasLimit = 500000n;
  console.log("Using fallback gas:", gasLimit.toString());
}

// Send raw transaction
const tx = await wallet.sendTransaction({
  to: CONTRACT,
  value: amountWei,
  data: calldata,
  gasLimit: gasLimit,
  gasPrice: feeData.gasPrice || 100000000n,
});

console.log("\n=== Transaction Sent ===");
console.log("Hash:", tx.hash);
console.log("Nonce:", tx.nonce);

// Wait for confirmation
console.log("\nWaiting for confirmation...");
const receipt = await tx.wait();
console.log("Status:", receipt?.status === 1 ? "SUCCESS" : "FAILED");
console.log("Block:", receipt?.blockNumber);
console.log("Gas used:", receipt?.gasUsed.toString());

// Check final state
const newSize = await provider.call({ to: CONTRACT, data: poolIface.encodeFunctionData("treeSize") });
console.log("New pool size:", parseInt(newSize, 16));

console.log("\n=== Deposit Note ===");
console.log("Secret:", "0x" + secretBytes.reduce((s, b) => s + b.toString(16).padStart(2, "0"), ""));
console.log("Nullifier:", "0x" + nullifier.toString(16).padStart(64, "0"));
console.log("Commitment:", commitmentHex);
console.log("Amount: 1.0 DOT");