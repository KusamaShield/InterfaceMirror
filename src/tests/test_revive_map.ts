import { ApiPromise, WsProvider } from "@polkadot/api";
import { decodeAddress } from "@polkadot/util-crypto";

const WS_ENDPOINT = "wss://asset-hub-polkadot-rpc.n.dwellir.com";
const SS58_ADDRESS = "155KxucBz9PxAinQMUGJBRLFUM6neixkBXQEn9oUsQ8w8M4Y"; // Your Nova address

async function main() {
  const wsProvider = new WsProvider(WS_ENDPOINT);
  const api = await ApiPromise.create({ provider: wsProvider });

  try {
    console.log("=== Checking revive account mapping ===\n");

    // Convert SS58 to H160 (first 20 bytes of decoded address)
    const decoded = decodeAddress(SS58_ADDRESS);
    const h160 = "0x" + Buffer.from(decoded.slice(0, 20)).toString("hex");
    console.log("SS58:", SS58_ADDRESS);
    console.log("H160:", h160);
    console.log("");

    // Check if account is already mapped via accountInfoOf
    if (api.query.revive?.accountInfoOf) {
      console.log("\n--- Checking revive accountInfoOf ---");
      try {
        const info = await api.query.revive.accountInfoOf(h160);
        console.log("accountInfoOf result:", info.toHuman());
        console.log("Is mapped:", !info.isEmpty);
      } catch (e: any) {
        console.log("accountInfoOf failed:", e.message);
      }
    }

    // Check if account is already mapped
    // Try querying the account mapping
    if (api.query.revive) {
      console.log("\nrevive query methods:", Object.keys(api.query.revive).join(", "));
    }

    // Check account via the EVM address
    if (api.query.system?.account) {
      const accountInfo = await api.query.system.account(SS58_ADDRESS);
      console.log("\nAccount exists:", !accountInfo.isEmpty);
      console.log("Nonce:", accountInfo.nonce?.toNumber());
      console.log("Free balance:", accountInfo.data?.free?.toString());
    }

    // Check if there's an H160 mapping stored
    // The revive pallet stores mappings: Substrate account -> H160
    // Try to query via the evm_accounts or similar storage
    const storageKeys = Object.keys(api.query).filter(k => 
      k.toLowerCase().includes("revive") || k.toLowerCase().includes("evm") || k.toLowerCase().includes("account")
    );
    console.log("\nRelevant query modules:", storageKeys.join(", "));

    // Build mapAccount tx (0 args - maps the caller)
    if (api.tx.revive?.mapAccount) {
      console.log("\n--- Testing mapAccount (0 args) ---");
      const tx = api.tx.revive.mapAccount();
      console.log("mapAccount() tx built:", tx.method.toHex());
    }

  } catch (e) {
    console.error("Error:", e);
  } finally {
    await api.disconnect();
    wsProvider.disconnect();
    process.exit(0);
  }
}

main();