import { ethers } from "ethers";
import { poseidon2 } from "poseidon-lite";
const CONTRACT = "0x0D694Da746e73D1e255c1894F90e38170db45809";
const RPC = "https://polkadot-assethub-rpc.laissez-faire.trade/";

const provider = new ethers.JsonRpcProvider(RPC);

const iface = new ethers.Interface([
  "function depositAsset(uint256 assetId, uint256 amount, bytes32 commitment) external",
  "function treeSize() external view returns (uint256)",
]);

// Generate valid commitment
const secretBytes = ethers.randomBytes(31);
const secretHex = "0x" + Array.from(secretBytes).map(b => b.toString(16).padStart(2, '0')).join('');
const secretBN = BigInt(secretHex);
const amountWei = BigInt(1e18);
const nullifier = poseidon2([secretBN, 1n]);
const precommitment = poseidon2([nullifier, secretBN]);
const valueAssetHash = poseidon2([amountWei.toString(), 0n]);
const commitment = poseidon2([valueAssetHash, precommitment]);
const commitmentHex = "0x" + commitment.toString(16).padStart(64, "0");

console.log("Commitment:", commitmentHex);

// Try depositAsset - assetId=0 (DOT), amount in wei
const data = iface.encodeFunctionData("depositAsset", [0, amountWei, commitmentHex]);

try {
  const result = await provider.call({
    from: "0x0000000000000000000000000000000000000001",
    to: CONTRACT,
    data: data,
  });
  console.log("depositAsset result:", result);
  console.log("SUCCESS!");
} catch (e: any) {
  console.log("depositAsset error:", e.message.slice(0, 300));
}