import { encodeAddress, decodeAddress } from "@polkadot/util-crypto";
import { cryptoWaitReady } from "@polkadot/util-crypto";
import * as dotenv from "dotenv";
dotenv.config();

await cryptoWaitReady();

const ethAddr = "96c2223f6318830f3ed24efe0a1e1fdcb64e5d17";
const fallbackSS58 = "16QHNj77MogcUniEWh1VT44V7m5RyRJ2yQH3epFW4RcQRQhV";

// Decode SS58 to get the raw bytes
const fallbackBytes = decodeAddress(fallbackSS58);
const fallbackHex = "0x" + Buffer.from(fallbackBytes).toString("hex");

console.log("Fallback SS58:", fallbackSS58);
console.log("Fallback bytes (hex):", fallbackHex);
console.log("Fallback bytes length:", fallbackBytes.length);

// Use fetch to call RPC directly
const RPC = "https://polkadot-assethub-rpc.laissez-faire.trade/";

async function rpcCall(method: string, params: any[]) {
  const res = await fetch(RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const data = await res.json();
  if (data.error) {
    console.log(method, "ERROR:", JSON.stringify(data.error));
    return null;
  }
  return data.result;
}

console.log("\n=== Fallback account EVM balance ===");
// The EVM address is the last 20 bytes of the 32-byte AccountId
const fallbackEvmAddress = "0x" + fallbackHex.slice(-40);
console.log("Fallback EVM address:", fallbackEvmAddress);
const fallbackBalance = await rpcCall("eth_getBalance", [fallbackEvmAddress, "latest"]);
console.log("EVM balance (hex):", fallbackBalance);
console.log("EVM balance (DOT):", fallbackBalance ? parseInt(fallbackBalance, 16) / 1e18 : "N/A");

console.log("\n=== ECDSA address directly ===");
const ecdsaBalance = await rpcCall("eth_getBalance", ["0x" + ethAddr, "latest"]);
console.log("EVM balance (hex):", ecdsaBalance);
console.log("EVM balance (DOT):", ecdsaBalance ? parseInt(ecdsaBalance, 16) / 1e18 : "N/A");