import { ethers } from "ethers";
const CONTRACT = "0x0D694Da746e73D1e255c1894F90e38170db45809";
const RPC = "https://polkadot-assethub-rpc.laissez-faire.trade/";

const provider = new ethers.JsonRpcProvider(RPC);

const code = await provider.getCode(CONTRACT);
console.log("Contract code length:", code.length);

const iface = new ethers.Interface(["function depositNative(bytes32 commitment) external payable"]);
const data = iface.encodeFunctionData("depositNative", ["0x" + "00".repeat(32)]);

try {
  const result = await provider.call({ to: CONTRACT, data: data });
  console.log("Call result (no value):", result);
} catch (e: any) {
  console.log("Call error (no value):", e.message.slice(0, 150));
}

try {
  const result2 = await provider.call({
    to: CONTRACT,
    data: data,
    value: "0x" + BigInt(1e18).toString(16),
  });
  console.log("Call result (with 1 DOT):", result2);
} catch (e: any) {
  console.log("Call error (with value):", e.message.slice(0, 150));
}