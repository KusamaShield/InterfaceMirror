/*
 * Copyright 2025 Kusama Shield Developers on behalf of the Kusama DAO, see LICENSE in main folder.
 *
 * Nova Wallet / ECDSA forwarder flow — full dry-run test.
 *
 * Generates every wallet and transaction used in the Nova shield flow WITHOUT
 * broadcasting anything:
 *
 *   1. One-time ECDSA wallet + Substrate fallback SS58 (eth_addr + 0xEE*12)
 *   2. Funding transfer   — balances.transferAllowDeath (Nova signs via
 *                           polkadot_signTransaction). Prints the exact
 *                           SignerPayloadJSON handed to Nova + the unsigned
 *                           extrinsic, but does NOT sign/send.
 *   3. Deposit            — depositNative(bytes32 commitment). Builds calldata,
 *                           signs it locally with the ECDSA wallet and prints
 *                           the raw signed tx (ready for eth_sendRawTransaction).
 *   4. Sweep              — native transfer of leftover DOT back to the user's
 *                           H160. Signs locally and prints the raw signed tx.
 *
 * Run:
 *   npx tsx src/tests/nova_flow_test.ts [amountDOT] [senderSS58]
 *
 * Env (optional overrides):
 *   EVM_RPC        EVM JSON-RPC endpoint
 *   WS_RPC         Substrate WS endpoint
 *   CONTRACT       Pool contract address
 *   CHAIN_ID       EVM chain id
 */

import { ApiPromise, WsProvider } from "@polkadot/api";
import { cryptoWaitReady } from "@polkadot/util-crypto";
import { ethers } from "ethers";
import * as dotenv from "dotenv";
import {
  generateEcdsaWallet,
  computeCommitment,
  computeFallbackSS58,
  deriveH160,
} from "../transactions/forwarder";

dotenv.config();

const EVM_RPCS = [
  process.env.EVM_RPC,
  "https://eth-rpc.polkadot.io/",
  "https://polkadot-assethub-rpc.laissez-faire.trade",
].filter(Boolean) as string[];
const WS_RPCS = [
  process.env.WS_RPC,
  "wss://polkadot-asset-hub-rpc.polkadot.io",
  "wss://rpc-asset-hub-polkadot.stakeworld.io",
  "wss://rpc-asset-hub-polkadot.luckyfriday.io",
].filter(Boolean) as string[];
const CONTRACT =
  process.env.CONTRACT || "0x0D694Da746e73D1e255c1894F90e38170db45809";
const CHAIN_ID = Number(process.env.CHAIN_ID || 420420419);
const GAS_BUFFER_DOT = 0.05; // shield funding buffer
const DEPOSIT_GAS_LIMIT = 200000n;
const SWEEP_GAS_LIMIT = 21000n;

const amountDOT = Number(process.argv[2] || "0.1");
const senderSS58 =
  process.argv[3] ||
  process.env.SENDER_ADDRESS ||
  "5GBb8s3oANu6BdbXnHMKTsYREADggZ6vhKG9t5cZRBT8AJST";

async function main() {
  await cryptoWaitReady();

  // ---------------------------------------------------------------------
  // 1. ECDSA wallet + Substrate fallback
  // ---------------------------------------------------------------------
  const { wallet, ethAddress, fallbackSS58 } = generateEcdsaWallet();
  const userH160 = deriveH160(senderSS58);

  console.log("=== 1. Wallets ===");
  console.log("Temporary ETH address: ", ethAddress);
  console.log("Temporary private key: ", wallet.privateKey);
  console.log("Fallback SS58:         ", fallbackSS58);
  console.log("Fallback AccountId32:  ", "0x" + ethAddress.slice(2).toLowerCase() + "ee".repeat(12));
  console.log("User SS58:             ", senderSS58);
  console.log("User H160:             ", userH160);

  // ---------------------------------------------------------------------
  // Commitment (Poseidon2 v7)
  // ---------------------------------------------------------------------
  const depositAmountWei = ethers.parseEther(amountDOT.toFixed(18));
  const { secretHex, nullifierHex, commitmentHex } = computeCommitment(
    depositAmountWei,
    0n,
  );

  console.log("\n=== 2. Deposit commitment ===");
  console.log("Amount (wei):  ", depositAmountWei.toString());
  console.log("Secret:        ", secretHex);
  console.log("Nullifier:     ", nullifierHex);
  console.log("Commitment:    ", commitmentHex);

  // ---------------------------------------------------------------------
  // 3. Funding transfer (Substrate) — build only, no broadcast
  // ---------------------------------------------------------------------
  const fundPlanck = BigInt(Math.floor((amountDOT + GAS_BUFFER_DOT) * 1e10));

  console.log("\n=== 3. Funding transfer (Nova signs) ===");
  console.log(
    "Amount (planck):",
    fundPlanck.toString(),
    `= ${amountDOT + GAS_BUFFER_DOT} DOT`,
  );

  // Shuffle WS endpoints for random selection each run
  const shuffled = [...WS_RPCS].sort(() => Math.random() - 0.5);
  let apiConnected = false;
  for (const wsUrl of shuffled) {
    try {
      console.log(`\nTrying WS: ${wsUrl}`);
      const wsProvider = new WsProvider(wsUrl);
      const api = new ApiPromise({
        provider: wsProvider,
        noInitWarn: true,
      });
      await Promise.race([
        api.isReady,
        new Promise<never>((_, rej) =>
          setTimeout(() => rej(new Error("timeout")), 15000),
        ),
      ]);
      console.log("Connected to", wsUrl);

      const fundingTx = api.tx.balances.transferAllowDeath(
        fallbackSS58,
        fundPlanck,
      );
      const nonce = (
        await api.rpc.system.accountNextIndex(senderSS58)
      ).toNumber();
      const header = await api.rpc.chain.getHeader();
      const blockHash = (
        await api.rpc.chain.getBlockHash()
      ).toHex();

      // Build the exact SignerPayloadJSON that Nova receives via
      // polkadot_signTransaction
      const payload: any = api.registry.createTypeUnsafe("ExtrinsicPayload", [
        fundingTx,
        { version: fundingTx.version },
      ]);
      const signerPayload = {
        address: senderSS58,
        blockHash,
        blockNumber: header.number.toNumber(),
        era: payload.era.toHex(),
        genesisHash: api.genesisHash.toHex(),
        method: payload.method.toHex(),
        nonce,
        signedExtensions: api.registry.signedExtensions as unknown as string[],
        specVersion: payload.specVersion.toNumber(),
        tip: payload.tip.toNumber(),
        transactionVersion: payload.transactionVersion.toNumber(),
        version: fundingTx.version,
      };

      console.log("Call (method) hex:  ", payload.method.toHex());
      console.log("Unsigned extrinsic: ", fundingTx.toHex());
      console.log(
        "Signing payload (polkadot_signTransaction input):",
      );
      console.log(JSON.stringify(signerPayload, null, 2));

      // Fee estimate (read-only)
      try {
        const info = await fundingTx.paymentInfo(senderSS58);
        console.log(
          `Partial fee: ${info.partialFee.toString()} plancks (${(Number(info.partialFee) / 1e10).toFixed(6)} DOT)`,
        );
      } catch (e: any) {
        console.warn("paymentInfo failed:", e?.message);
      }

      await api.disconnect();
      apiConnected = true;
      break;
    } catch (e: any) {
      console.warn(`  WS ${wsUrl}: ${e?.message || e}`);
    }
  }

  if (!apiConnected) {
    console.log(
      "\n⚠️  No WS endpoint reachable — funding tx signing payload could not be built.",
    );
    console.log(
      "   The ECDSA wallet, commitment, and EVM transactions are below.",
    );
  }

  // ---------------------------------------------------------------------
  // 4. Deposit (EVM) — build + sign locally, no broadcast
  // ---------------------------------------------------------------------
  console.log("\n=== 4. Deposit transaction (ECDSA signs) ===");

  let depositProvider: ethers.JsonRpcProvider | null = null;
  for (const rpcUrl of EVM_RPCS) {
    try {
      const p = new ethers.JsonRpcProvider(rpcUrl, CHAIN_ID, {
        staticNetwork: ethers.Network.from(CHAIN_ID),
      });
      const block = await Promise.race([
        p.getBlockNumber(),
        new Promise<never>((_, rej) =>
          setTimeout(() => rej(new Error("timeout")), 10000),
        ),
      ]);
      console.log("  EVM RPC ok:", rpcUrl, "(block", block, ")");
      depositProvider = p;
      break;
    } catch (e: any) {
      console.warn(`  EVM RPC ${rpcUrl}: ${e?.message || e}`);
    }
  }

  if (!depositProvider) {
    throw new Error("No EVM RPC reachable — cannot build deposit tx");
  }

  const depositIface = new ethers.Interface([
    "function depositNative(bytes32 commitment) external payable",
  ]);
  const depositCalldata = depositIface.encodeFunctionData("depositNative", [
    commitmentHex,
  ]);

  const evmNonce = await depositProvider.getTransactionCount(ethAddress);
  const feeData = await depositProvider.getFeeData();
  const gasPrice = feeData.gasPrice ?? ethers.parseUnits("1", "gwei");

  console.log("Contract:        ", CONTRACT);
  console.log("Calldata:        ", depositCalldata);
  console.log("Value (wei):     ", depositAmountWei.toString());
  console.log("Nonce:           ", evmNonce);
  console.log("Gas price:       ", gasPrice.toString());

  const depositTx = await wallet.signTransaction({
    type: 2,
    chainId: CHAIN_ID,
    to: CONTRACT,
    value: depositAmountWei,
    data: depositCalldata,
    gasLimit: DEPOSIT_GAS_LIMIT,
    maxFeePerGas: gasPrice,
    maxPriorityFeePerGas: gasPrice,
    nonce: evmNonce,
  });
  console.log("Raw signed tx (eth_sendRawTransaction):", depositTx);

  // ---------------------------------------------------------------------
  // 5. Sweep (EVM) — build + sign locally, no broadcast
  // ---------------------------------------------------------------------
  console.log("\n=== 5. Sweep transaction (ECDSA signs) ===");
  const currentEthBalance = await depositProvider.getBalance(ethAddress);
  const sweepGasCost = SWEEP_GAS_LIMIT * gasPrice;
  const sweepAmount =
    currentEthBalance > sweepGasCost ? currentEthBalance - sweepGasCost : 0n;

  console.log("Current ETH balance:", currentEthBalance.toString(), "wei");
  console.log("Sweep gas cost:     ", sweepGasCost.toString(), "wei");

  if (sweepAmount > 0n) {
    const sweepTx = await wallet.signTransaction({
      type: 2,
      chainId: CHAIN_ID,
      to: userH160,
      value: sweepAmount,
      gasLimit: SWEEP_GAS_LIMIT,
      maxFeePerGas: gasPrice,
      maxPriorityFeePerGas: gasPrice,
      nonce: evmNonce + 1,
    });
    console.log("Sweep to:          ", userH160);
    console.log("Sweep amount (wei):", sweepAmount.toString());
    console.log("Raw signed tx (eth_sendRawTransaction):", sweepTx);
  } else {
    console.log("No leftover to sweep (fund the temp wallet to see a non-zero sweep).");
  }

  console.log("\n=== Done (nothing was broadcast) ===");
  process.exit(0);
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
