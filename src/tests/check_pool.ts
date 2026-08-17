import { ethers } from "ethers";
const CONTRACT = "0x0D694Da746e73D1e255c1894F90e38170db45809";
const RPC = "https://polkadot-assethub-rpc.laissez-faire.trade/";

const provider = new ethers.JsonRpcProvider(RPC);
const iface = new ethers.Interface(["function treeSize() external view returns (uint256)"]);
const sizeResult = await provider.call({ to: CONTRACT, data: iface.encodeFunctionData("treeSize") });
console.log("Pool size:", parseInt(sizeResult, 16));
