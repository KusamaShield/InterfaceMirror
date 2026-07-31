/**
 * Test Substrate Transaction on Paseo AssetHub via revive pallet
 * Run with: npx tsx src/tests/test_substrate_transfer_paseo.ts
 */

import { ApiPromise, WsProvider } from "@polkadot/api";
import { Keyring } from "@polkadot/keyring";
import { readFileSync } from "fs";
import { ethers } from "ethers";

const CHAINSPEC_PATH = "/tmp/paseo-asset-hub-2.json";

let CHAINSPEC: any = {};
try {
  CHAINSPEC = JSON.parse(readFileSync(CHAINSPEC_PATH, "utf-8"));
  console.log("📋 Loaded chainspec:", CHAINSPEC.name);
} catch (e) {
  console.log("⚠️ Could not load chainspec");
}

const PASEO_WSS = "wss://asset-hub-paseo-rpc.n.dwellir.com";
const PASEO_RPC = "https://paseo-assethub-rpc.laissez-faire.trade";

// Account 1: Prefunded Substrate (sr25519)
const ACCOUNT_1_SEED = "0xf2c558be8911a7032ac8186983fab42f4c3c96cc17ea20b2abaeaa31fe13f28e";

async function main() {
  console.log("🔗 Connecting to", PASEO_WSS);

  const wsProvider = new WsProvider(PASEO_WSS);
  const api = await ApiPromise.create({
    provider: wsProvider,
    config: {
      chain: CHAINSPEC.properties || { ss58Format: 42, tokenDecimals: 10, tokenSymbol: "PAS" },
    },
  });

  console.log("✅ Connected to", (await api.rpc.system.chain()).toString());

  const srKeyring = new Keyring({ type: "sr25519", ss58Format: 42 });
  const account1 = srKeyring.addFromSeed(ACCOUNT_1_SEED);

  console.log("\n📝 Account 1 (Substrate):", account1.address);

  const balance1 = await api.query.system.account(account1.address);
  console.log("💰 Balance:", Number(balance1.data.free) / 1e10, "PAS");

  // Check revive pallet
  console.log("\n📊 Checking revive pallet...");
  const pallets = Object.keys(api.tx);
  console.log("   Has revive:", "revive" in api.tx);
  
  if (api.tx.revive) {
    console.log("   revive methods:", Object.keys(api.tx.revive).join(', '));
  }

  // Create recipient
  const account2 = srKeyring.createFromUri("//Alice");
  console.log("\n📝 To (Alice):", account2.address);

  // Calculate fallback H160 for account2
  const { keccak_256 } = await import("@noble/hashes/sha3");
  const pubkeyBytes2 = account2.publicKey;
  const keccakHash2 = keccak_256(pubkeyBytes2);
  const h160_2 = "0x" + Buffer.from(keccakHash2.slice(-20)).toString("hex");
  console.log("   Fallback H160:", h160_2);

  // Create EVM transaction to send from account1's fallback H160 to account2's fallback H160
  const evmProvider = new ethers.JsonRpcProvider(PASEO_RPC);
  
  // Get current nonce for the H160 address
  const h160_1 = "0xf8eeb1554c47aa17263229992e8d4517c1831591"; // Account1's fallback
  const nonce = await evmProvider.getTransactionCount(h160_1);
  const feeData = await evmProvider.getFeeData();
  const gasPrice = feeData.gasPrice || BigInt(1000000000);
  
  console.log("\n📤 Creating EVM transaction...");
  console.log("   From H160:", h160_1);
  console.log("   To H160:", h160_2);
  console.log("   Nonce:", nonce);
  console.log("   GasPrice:", gasPrice.toString());

  // Build EVM transaction
  const evmTx = {
    from: h160_1,
    to: h160_2,
    value: ethers.parseEther("0.001"),
    gasLimit: 21000,
    gasPrice: gasPrice,
    nonce: nonce,
    chainId: 420420417,
    type: 0,
  };

  console.log("   Value:", ethers.formatEther(evmTx.value), "PAS");

  // Encode the EVM transaction (ethers v6)
  const tx = ethers.Transaction.from({
    to: h160_2,
    value: ethers.parseEther("0.001"),
    gasLimit: 21000,
    gasPrice: gasPrice,
    nonce: nonce,
    chainId: 420420417,
    type: 0,
  });

  const encodedEvmTx = tx.unsignedSerialized;
  console.log("   Encoded length:", encodedEvmTx.length);

  // Submit via revive.ethTransact
  console.log("\n🚀 Submitting via revive.ethTransact...");
  
  try {
    const ethTransactCall = api.tx.revive.ethTransact(encodedEvmTx);
    
    console.log("   Call section:", ethTransactCall.section);
    console.log("   Call method:", ethTransactCall.method);
    console.log("   CallIndex:", ethTransactCall.callIndex.toString());

    const hash = await ethTransactCall.signAndSend(account1);
    console.log("✅ Success! Hash:", hash.toHex());
  } catch (e: any) {
    console.log("❌ Failed:", e.message?.split("\n")[0].slice(0, 120));
  }

  await api.disconnect();
}

main().catch(console.error);