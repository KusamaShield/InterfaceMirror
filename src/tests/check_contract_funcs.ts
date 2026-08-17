import { ethers } from "ethers";
const RPC = "https://polkadot-assethub-rpc.laissez-faire.trade/";
const CONTRACT = "0x0D694Da746e73D1e255c1894F90e38170db45809";

const provider = new ethers.JsonRpcProvider(RPC);

// Get contract bytecode
const code = await provider.getCode(CONTRACT);
console.log("Code length:", code.length);

// Try common function selectors
const selectors = [
  "0x42ef5fbb", // depositNative
  "0x58d5cfaf", // commit?
  "0xa7e6e70c", // maybe commit
  "0x0c3ff70f",
  "0x6ee4e78c", // maybe depositAsset
];

for (const sel of selectors) {
  try {
    const result = await provider.call({
      to: CONTRACT,
      data: sel + "0".repeat(64),
    });
    console.log("Selector", sel, "-> result:", result.slice(0, 80));
  } catch (e: any) {
    console.log("Selector", sel, "-> error:", e.message.slice(0, 80));
  }
}

// Also try with value
console.log("\n--- With value ---");
for (const sel of selectors) {
  try {
    const result = await provider.call({
      to: CONTRACT,
      data: sel + "0".repeat(64),
      value: "0x" + BigInt(1e18).toString(16),
    });
    console.log("Selector", sel, "+ value -> result:", result.slice(0, 80));
  } catch (e: any) {
    console.log("Selector", sel, "+ value -> error:", e.message.slice(0, 80));
  }
}