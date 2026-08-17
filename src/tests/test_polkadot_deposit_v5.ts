import { ApiPromise, WsProvider } from "@polkadot/api";
import { Keyring } from "@polkadot/keyring";
import { cryptoWaitReady, decodeAddress, encodeAddress } from "@polkadot/util-crypto";
import { ethers } from "ethers";
import * as dotenv from "dotenv";
import { poseidon2 } from "poseidon-lite";
dotenv.config();

await cryptoWaitReady();

const seed = process.env.FORWARDER_SEED;
if (!seed) throw new Error("FORWARDER_SEED not set");

const keyring = new Keyring({ type: "sr25519" });
const pair = keyring.addFromUri(seed);
const ss58Address = pair.address;

console.log("=== Testing Path A with 0x58d5cfaf (commit) function ===\n");

const CONTRACT = "0x0D694Da746e73D1e255c1894F90e38170db45809";
const WS_RPC = "wss://asset-hub-polkadot-rpc.n.dwellir.com";
const EVM_RPC = "https://polkadot-assethub-rpc.laissez-faire.trade/";

const wsProvider = new WsProvider(WS_RPC);
const api = await ApiPromise.create({ provider: wsProvider });

// Generate commitment (different format - just amount, no secret)
const amountWei = BigInt(1e18);
const commitment = poseidon2([amountWei.toString(), 1n]); // Using 1 as second param
const commitmentHex = "0x" + commitment.toString(16).padStart(64, "0");

console.log("Commitment (commit style):", commitmentHex);

// Try calling with commit function (0x58d5cfaf)
// This takes amount as parameter, not msg.value
// Looking at the working example: 0x58d5cfaf + amount (10 in that case)
// Let me try with amount in the simplest way

// Try different approaches with 0x58d5cfaf
const approaches = [
  // Just amount as bytes32
  "0x58d5cfaf" + amountWei.toString(16).padStart(64, '0'),
  // Amount as uint256 (should be same)
  "0x58d5cfaf" + "000000000000000000000000000000000000000000000000000000000000" + BigInt(1).toString(16).padStart(4, '0'),
];

const provider = new ethers.JsonRpcProvider(EVM_RPC);

for (let i = 0; i < approaches.length; i++) {
  console.log(`\n--- Approach ${i + 1} ---`);
  console.log("Calldata:", approaches[i].slice(0, 50) + "...");
  
  try {
    const result = await provider.call({
      from: pair.address,
      to: CONTRACT,
      data: approaches[i],
    });
    console.log("Result:", result);
  } catch (e: any) {
    console.log("Error:", e.message.slice(0, 100));
  }
}

// Actually try with revive.call - let's see what happens
console.log("\n=== Try revive.call with 0x58d5cfaf ===");

const tx = api.tx.revive.call(
  CONTRACT,
  "0", // no value
  { refTime: 1000000000000n, proofSize: 1000000n },
  null,
  approaches[0] // use first approach
);

console.log("Tx method hex:", tx.method.toHex());

const hash = await new Promise<string>((resolve, reject) => {
  tx.signAndSend(pair, ({ status, txHash, dispatchError }: any) => {
    console.log("Status:", status.type);
    if (dispatchError) {
      console.log("Error:", dispatchError.toString());
    }
    if (status.isInBlock || status.isFinalized) resolve(txHash.toHex());
  }).catch(reject);
});

console.log("Hash:", hash);

// Check pool
const poolIface = new ethers.Interface(["function treeSize() external view returns (uint256)"]);
const sizeResult = await provider.call({ to: CONTRACT, data: poolIface.encodeFunctionData("treeSize") });
console.log("Pool size:", parseInt(sizeResult, 16));

await api.disconnect();