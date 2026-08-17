import { ethers } from "ethers";
const CONTRACT = "0x0D694Da746e73D1e255c1894F90e38170db45809";
const RPC = "https://polkadot-assethub-rpc.laissez-faire.trade/";

const provider = new ethers.JsonRpcProvider(RPC);

const iface = new ethers.Interface([
  "function depositAsset(uint256 assetId, uint256 amount, bytes32 commitment) external",
  "function treeSize() external view returns (uint256)",
]);

const sizeResult = await provider.call({
  to: CONTRACT,
  data: iface.encodeFunctionData("treeSize"),
});
console.log("Pool size before:", parseInt(sizeResult, 16));

const amount = BigInt(1e18);
const commitment = "0x" + "00".repeat(32);
const data = iface.encodeFunctionData("depositAsset", [0, amount, commitment]);

try {
  const result = await provider.call({
    from: "0x0000000000000000000000000000000000000001",
    to: CONTRACT,
    data: data,
  });
  console.log("depositAsset result:", result);
} catch (e: any) {
  console.log("depositAsset error:", e.message.slice(0, 200));
}