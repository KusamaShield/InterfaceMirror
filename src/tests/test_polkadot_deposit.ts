/**
 * Polkadot Shield Test: Deposit via Ethereum tx (Path B - secp256k1 ECDSA)
 * Creates an ECDSA wallet, derives the fallback Polkadot account (0xEE...EE + eth_addr),
 * and submits the deposit via eth_sendRawTransaction.
 * 
 * Prerequisites: The fallback account must be funded with DOT.
 * Usage: npx tsx src/tests/test_polkadot_deposit.ts
 */

import { ethers } from "ethers";
import * as dotenv from "dotenv";
dotenv.config();

const CONTRACT = "0x0D694Da746e73D1e255c1894F90e38170db45809";
const EVM_RPC = "https://polkadot-assethub-rpc.laissez-faire.trade/";
const CHAIN_ID = 420_420_419n; // Asset Hub Polkadot

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
  console.log("=== Polkadot Shield Test (Ethereum Path B - ECDSA) ===\n");

  const ethPrivateKey = process.env.ETH_PRIVATE_KEY;
  if (!ethPrivateKey) {
    console.error("Set ETH_PRIVATE_KEY in .env (secp256k1 private key with 0x prefix)");
    console.log("\nTo generate one: npx tsx -e \"import { ethers } from 'ethers'; const w = ethers.Wallet.createRandom(); console.log('ETH_PRIVATE_KEY=' + w.privateKey); console.log('Address:', w.address);\"");
    process.exit(1);
  }

  const provider = new ethers.JsonRpcProvider(EVM_RPC, CHAIN_ID, { staticNetwork: true });
  const wallet = new ethers.Wallet(ethPrivateKey, provider);

  // Fallback Polkadot account: 0xEE...EE + eth_address (12 bytes of 0xEE + 20 bytes eth addr)
  const ethAddr = wallet.address.replace('0x', '').toLowerCase();
  const fallbackAcct32 = '0x' + 'ee'.repeat(12) + ethAddr;
  console.log("ETH address:", wallet.address);
  console.log("Fallback AccountId32:", fallbackAcct32);
  console.log("(Fund this account with DOT before depositing)");

  // Check balances
  const ethBalance = await provider.getBalance(wallet.address);
  console.log("ETH wallet DOT balance:", ethers.formatEther(ethBalance));

  // Check pool state
  const poolIface = new ethers.Interface([
    "function currentRoot() external view returns (uint256)",
    "function treeSize() external view returns (uint256)",
  ]);
  const rootResult = await provider.call({ to: CONTRACT, data: poolIface.encodeFunctionData("currentRoot") });
  const sizeResult = await provider.call({ to: CONTRACT, data: poolIface.encodeFunctionData("treeSize") });
  console.log("Pool root:", BigInt(rootResult).toString().slice(0, 20) + "...");
  console.log("Pool size:", parseInt(sizeResult, 16));

  // Build deposit
  const amount = "1";
  const amountWei = ethers.parseEther(amount);
  console.log("\n=== Building Deposit ===");
  console.log("Amount:", amount, "DOT =", amountWei.toString(), "wei");

  const { commitment, nullifierHash, secretHex } = await generateCommitment(amountWei);
  console.log("Commitment:", commitment);
  console.log("Nullifier:", nullifierHash);

  const depositIface = new ethers.Interface(["function depositNative(bytes32 commitment) external payable"]);
  const evmCallData = depositIface.encodeFunctionData("depositNative", [commitment]);

  // Get nonce and gas price
  const nonce = await provider.getTransactionCount(wallet.address, "latest");
  const feeData = await provider.getFeeData();

  // Build and send EIP-1559 transaction
  console.log("\n=== Sending via eth_sendRawTransaction ===");
  const tx = await wallet.sendTransaction({
    to: CONTRACT,
    data: evmCallData,
    value: amountWei,
    gasLimit: 300000,
    nonce,
    chainId: CHAIN_ID,
  });

  console.log("Tx hash:", tx.hash);
  console.log("Waiting for confirmation...");
  const receipt = await tx.wait();
  console.log("✅ Confirmed in block:", receipt?.blockNumber);
  console.log("Gas used:", receipt?.gasUsed.toString());

  // Check final balances
  const ethBalance2 = await provider.getBalance(wallet.address);
  console.log("\nNew DOT balance:", ethers.formatEther(ethBalance2));
  console.log("Cost:", ethers.formatEther(ethBalance - ethBalance2), "DOT");

  // Verify pool
  const sizeResult2 = await provider.call({ to: CONTRACT, data: poolIface.encodeFunctionData("treeSize") });
  console.log("New pool size:", parseInt(sizeResult2, 16));

  console.log("\n=== Deposit Note (save for withdraw!) ===");
  console.log("Secret:", secretHex);
  console.log("Commitment:", commitment);
  console.log("Amount:", amountWei.toString());
  console.log("Asset ID:", 0);
  console.log("Tx hash:", tx.hash);

}

main().catch(e => { console.error("Fatal:", e); process.exit(1); });