import { ethers } from "ethers";
import { ApiPromise, WsProvider } from "@polkadot/api";

const WS_ENDPOINT = "wss://asset-hub-polkadot-rpc.n.dwellir.com";
const CONTRACT_ADDRESS = "0x0D694Da746e73D1e255c1894F90e38170db45809";
const ABI = ["function depositNative(bytes32 commitment) external payable"];

async function main() {
  const wsProvider = new WsProvider(WS_ENDPOINT);
  const api = await ApiPromise.create({ provider: wsProvider });

  try {
    console.log("=== Testing Substrate EVM call wrapping on Polkadot Asset Hub ===\n");

    // 1. Show available pallets
    console.log("Available tx pallets:");
    const pallets = Object.keys(api.tx).sort();
    console.log(pallets.join(", "));
    console.log("");

    // 2. Show genesis info
    console.log("Genesis hash:", api.genesisHash.toHex());
    console.log("Spec version:", api.runtimeVersion.specVersion.toNumber());
    console.log("Tx version:", api.runtimeVersion.transactionVersion.toNumber());
    console.log("");

    // 3. Build EVM call data
    const iface = new ethers.Interface(ABI);
    const secretBytes = ethers.randomBytes(31);
    const secretHex = "0x" + Array.from(secretBytes).map(b => b.toString(16).padStart(2, '0')).join('');
    const secretBN = BigInt(secretHex);
    const { poseidon2 } = await import("poseidon-lite");
    const depositAmount = ethers.parseEther("1");
    const nullifier = poseidon2([secretBN, 1n]);
    const precommitment = poseidon2([nullifier, secretBN]);
    const valueAssetHash = poseidon2([depositAmount.toString(), 0n]);
    const commitment = poseidon2([valueAssetHash, precommitment]);
    const commitmentHex = "0x" + commitment.toString(16).padStart(64, "0");

    console.log("Deposit amount: 1 DOT =", depositAmount.toString(), "wei");
    console.log("Commitment:", commitmentHex);
    console.log("");

    const evmCallData = iface.encodeFunctionData("depositNative", [commitmentHex]);
    console.log("EVM call data:", evmCallData);
    console.log("EVM call data length:", evmCallData.length - 2, "hex chars");
    console.log("");

    // 4. Check which pallet to use
    console.log("=== Checking pallets for EVM wrapping ===");
    
    // Check revive pallet
    if (api.tx.revive) {
      console.log("revive pallet exists!");
      console.log("  Methods:", Object.keys(api.tx.revive).join(", "));
      
      if (api.tx.revive.call) {
        console.log("  revive.call args:", api.tx.revive.call.meta.args.map((a: any) => `${a.name}: ${a.type}`).join(", "));
      }
    } else {
      console.log("revive pallet: NOT FOUND");
    }

    // Check ethereum pallet
    if (api.tx.ethereum) {
      console.log("ethereum pallet exists!");
      console.log("  Methods:", Object.keys(api.tx.ethereum).join(", "));
      
      if (api.tx.ethereum.transact) {
        console.log("  ethereum.transact args:", api.tx.ethereum.transact.meta.args.map((a: any) => `${a.name}: ${a.type}`).join(", "));
      }
    } else {
      console.log("ethereum pallet: NOT FOUND");
    }

    // Check evm pallet  
    if (api.tx.evm) {
      console.log("evm pallet exists!");
      console.log("  Methods:", Object.keys(api.tx.evm).join(", "));
    } else {
      console.log("evm pallet: NOT FOUND");
    }

    // 5. Try to build tx with available pallet
    console.log("\n=== Building extrinsics ===");

    // revive.ethTransact - wraps an EVM transaction in a Substrate extrinsic
    if (api.tx.revive?.ethTransact) {
      console.log("\n--- revive.ethTransact ---");
      console.log("  revive.ethTransact args:", api.tx.revive.ethTransact.meta.args.map((a: any) => `${a.name}: ${a.type}`).join(", "));
      try {
        const tx = api.tx.revive.ethTransact({
          Legacy: {
            nonce: 0,
            gasPrice: 0,
            gasLimit: 200000,
            action: { Call: CONTRACT_ADDRESS },
            value: depositAmount.toString(),
            input: evmCallData,
            signature: {
              v: 0,
              r: "0x" + "00".repeat(32),
              s: "0x" + "00".repeat(32),
            },
          },
        });
        console.log("revive.ethTransact tx built successfully!");
        console.log("tx.method.toHex():", tx.method.toHex());
        console.log("tx.hash:", tx.hash.toHex());
      } catch (e: any) {
        console.error("revive.ethTransact failed:", e.message || e);
      }
    }

    // revive.call - direct contract call (newer interface)
    if (api.tx.revive?.call) {
      console.log("\n--- revive.call ---");
      try {
        const tx = api.tx.revive.call(
          CONTRACT_ADDRESS,   // dest: H160
          depositAmount.toString(), // value: u128
          { refTime: 200000, proofSize: 0 }, // weightLimit: WeightV2
          null,               // storageDepositLimit: Option<u128>
          evmCallData,        // data: bytes
        );
        console.log("revive.call tx built successfully!");
        console.log("tx.method.toHex():", tx.method.toHex());
        console.log("tx.hash:", tx.hash.toHex());
      } catch (e: any) {
        console.error("revive.call failed:", e.message || e);
      }
    }

  } catch (e) {
    console.error("Error:", e);
  } finally {
    await api.disconnect();
    wsProvider.disconnect();
    process.exit(0);
  }
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});