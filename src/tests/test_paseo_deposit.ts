/**
 * Paseo Shield Test: Deposit via revive pallet using Substrate/Polkadot account.
 * Usage: Set PASEO_MNEMONIC in .env, then run:
 *   npx tsx src/tests/test_paseo_deposit.ts
 */

import { ethers } from "ethers";
import { ApiPromise, WsProvider } from "@polkadot/api";
import { Keyring } from "@polkadot/keyring";
import { cryptoWaitReady } from "@polkadot/util-crypto";
import * as dotenv from "dotenv";
dotenv.config();

const CONTRACT = "0xbcE09D4De052b2816df1285663ac89528DF45380";
const EVM_RPC = "https://paseo-assethub-rpc.laissez-faire.trade/";
const WS_RPC = "wss://sys.turboflakes.io/asset-hub-paseo";

async function generateCommitment(amountWei: bigint) {
  const { poseidon2 } = await import("poseidon-lite");
  const secretBytes = ethers.randomBytes(31);
  const secretHex = "0x" + Array.from(secretBytes).map(b => b.toString(16).padStart(2, '0')).join('');
  const secretBN = BigInt(secretHex);
  const nullifier = poseidon2([secretBN, 1n]);
  const precommitment = poseidon2([nullifier, secretBN]);
  const valueAssetHash = poseidon2([amountWei.toString(), 0n]);
  const commitment = poseidon2([valueAssetHash, precommitment]);
  return {
    commitment: "0x" + commitment.toString(16).padStart(64, '0'),
    nullifier,
    secretHex,
    nullifierHash: "0x" + nullifier.toString(16).padStart(64, '0'),
  };
}

async function main() {
  await cryptoWaitReady();

  const mnemonic = process.env.PASEO_MNEMONIC;
  if (!mnemonic) throw new Error("Set PASEO_MNEMONIC in .env");

  const keyring = new Keyring({ type: "sr25519" });
  const pair = keyring.addFromUri(mnemonic);
  const ss58Address = pair.address;
  console.log("=== Paseo Shield Test (Substrate Account) ===");
  console.log("SS58 Address:", ss58Address);

  // Connect to Substrate RPC
  const wsProvider = new WsProvider(WS_RPC);
  const api = await ApiPromise.create({ provider: wsProvider });

  try {
    const genesis = api.genesisHash.toHex();
    console.log("Connected. Genesis:", genesis.substring(0, 16) + "...");

    // Check Substrate balance (12 decimals on Asset Hub)
    const accountInfo: any = await api.query.system.account(ss58Address);
    const free = accountInfo.data.free;
    const nonce = accountInfo.nonce;
    const bal = Number(free.toString()) / 1e12;
    console.log("PAS Balance (Substrate):", bal.toFixed(4));
    console.log("Nonce:", nonce.toString());

// Check EVM balance and revive mapping
    const { decodeAddress } = await import("@polkadot/util-crypto");
    const h160 = "0x" + Buffer.from(decodeAddress(ss58Address).slice(0, 20)).toString("hex");
    console.log("H160 addr:", h160);

    const accountMapping: any = await api.query.revive?.accountInfoOf(h160);
    if (!accountMapping || accountMapping.isEmpty) {
      console.log("\n⚠️  Account not mapped for revive. Mapping now...");
      if (!api.tx.revive?.mapAccount) throw new Error("mapAccount not available");
      
      const mapTx = api.tx.revive.mapAccount();
      console.log("Signing mapAccount...");
      
      await new Promise<void>((resolve, reject) => {
        mapTx.signAndSend(pair, ({ status, events, txHash }: any) => {
          console.log("Map status:", status.type, "Hash:", txHash?.toHex());
          if (status.isInBlock || status.isFinalized) {
            console.log("✅ Account mapped!");
            resolve();
          } else if (status.isInvalid) {
            reject(new Error("mapAccount invalid"));
          }
        }).catch(reject);
      });
    } else {
      console.log("✅ Account already mapped for revive");
    }

    const provider = new ethers.JsonRpcProvider(EVM_RPC);
    try {
      const evmBalance = await provider.getBalance(h160);
      console.log("PAS Balance (EVM):", ethers.formatEther(evmBalance));
    } catch { console.log("(EVM balance unavailable)"); }

    // Check pool state
    const iface = new ethers.Interface([
      "function currentRoot() external view returns (uint256)",
      "function treeSize() external view returns (uint256)",
    ]);
    // Query via EVM RPC
    const rootData = iface.encodeFunctionData("currentRoot");
    const sizeData = iface.encodeFunctionData("treeSize");
    const rootResult = await provider.call({ to: CONTRACT, data: rootData });
    const sizeResult = await provider.call({ to: CONTRACT, data: sizeData });
    const poolRoot = BigInt(rootResult);
    const poolSize = parseInt(sizeResult, 16);
    console.log("Pool root:", poolRoot.toString().substring(0, 20) + "...");
    console.log("Pool size:", poolSize);

    // Build deposit for 1 PAS
    const amount = "1";
    const amountWei = ethers.parseEther(amount);           // 10^18 wei (EVM msg.value)
    const amountPlanck = BigInt(Math.round(Number(amount) * 1e12)); // 10^12 planck (native, 12 dp)
    console.log("\n=== Building Deposit ===");
    console.log("Amount:", amount, "PAS =", amountWei.toString(), "wei =", amountPlanck.toString(), "planck");

    const { commitment, nullifierHash, secretHex } = await generateCommitment(amountWei);
    console.log("Commitment:", commitment);
    console.log("Nullifier hash:", nullifierHash);

    // Build EVM call data
    const depositIface = new ethers.Interface(["function depositNative(bytes32 commitment) external payable"]);
    const evmCallData = depositIface.encodeFunctionData("depositNative", [commitment]);

    // revive.call extrinsic — `value` is in NATIVE units (plancks), not wei.
    // 1 PAS = 10^12 plancks; the pallet converts native → EVM via NativeToEthRatio.
    if (!api.tx.revive?.call) throw new Error("revive.call not available");
    const tx = api.tx.revive.call(
      CONTRACT,
      amountPlanck.toString(),
      { refTime: 200000n, proofSize: 0n },
      null,
      evmCallData,
    );

    console.log("\nrevive.call Tx hex:", tx.method.toHex());
    console.log("\n=== Signing & Submitting ===");

    // Sign and submit
    const hash = await new Promise<string>((resolve, reject) => {
      tx.signAndSend(pair, ({ status, events, txHash }: any) => {
        console.log("Status:", status.type, "Hash:", txHash?.toHex());
        if (status.isInBlock) {
          console.log("✅ Included in block!");
          resolve(txHash.toHex());
        } else if (status.isFinalized) {
          console.log("✅ Finalized!");
          resolve(txHash.toHex());
        } else if (status.isInvalid) {
          reject(new Error("Tx invalid"));
        }
      }).catch(reject);
    });

    console.log("\nTransaction hash:", hash);

    // Check balance after deposit
    const accountInfo2: any = await api.query.system.account(ss58Address);
    const free2 = accountInfo2.data.free;
    console.log("New PAS balance:", (Number(free2.toString()) / 1e12).toFixed(4));
    console.log("Nonce:", accountInfo2.nonce.toString());
    console.log("Cost:", ((Number(free.toString()) - Number(free2.toString())) / 1e12).toFixed(8), "PAS");

    // Secret for test record
    console.log("\n=== Withdrawal Secret (save this!) ===");
    console.log("Secret:", secretHex);

  } finally {
    await api.disconnect();
    wsProvider.disconnect();
    process.exit(0);
  }
}

main().catch(e => { console.error("Fatal:", e); process.exit(1); });