/*
 * Copyright 2025 Kusama Shield Developers on behalf of the Kusama DAO, see LICENSE in main folder.
 *
 * Client-side ECDSA wallet utilities for Nova Wallet / Substrate wallet users on
 * Polkadot Asset Hub.
 *
 * Flow: generate a temporary ECDSA wallet, prompt the user to send DOT from their
 * Nova wallet to its Substrate fallback address (eth_addr + 0xEE*12), wait for the
 * balance to appear via eth_getBalance, then submit the EVM transaction via
 * eth_sendRawTransaction. Sweep leftover funds back to the user's own H160.
 */

import { ethers } from "ethers";
import { encodeAddress, decodeAddress } from "@polkadot/util-crypto";
import { poseidon2 } from "poseidon-lite";

export interface EcdsaWallet {
  wallet: ethers.BaseWallet;
  /** ETH address (H160) */
  ethAddress: string;
  /** Substrate SS58 fallback address: eth_addr + 0xEE*12 */
  fallbackSS58: string;
}

/**
 * Build and submit a Substrate balances.transferAllowDeath from a Nova/Substrate
 * wallet to the temporary ECDSA wallet's fallback address. The user confirms the
 * transfer in their Nova wallet (polkadot_signTransaction).
 */
export async function fundViaSubstrateTransfer(
  polkadotAddress: string,
  destFallbackSS58: string,
  amountPlanck: bigint,
  wsEndpoints: string | string[],
): Promise<string> {
  const { WsProvider, ApiPromise } = await import("@polkadot/api");
  const endpoints =
    typeof wsEndpoints === "string" ? [wsEndpoints] : wsEndpoints;

  const wcSigner = {
    signPayload: async (payload: any) => {
      const appKit = (window as any).__appKit;
      const universalProvider = await appKit.getUniversalProvider();
      if (!universalProvider?.session) throw new Error("No WalletConnect session");
      const result = await universalProvider.client.request({
        topic: universalProvider.session.topic,
        chainId: `polkadot:${payload.genesisHash.substring(2, 34)}`,
        request: {
          method: "polkadot_signTransaction",
          params: {
            address: payload.address,
            transactionPayload: payload.toPayload ? payload.toPayload() : payload,
          },
        },
      });
      return { id: 0, signature: result.signature };
    },
  };

  // Randomly pick an endpoint each attempt (load-balancing + avoid thundering herd)
  let lastError: any;
  const maxAttempts = endpoints.length * 2;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const wsEndpoint = endpoints[Math.floor(Math.random() * endpoints.length)];
    const wsProvider = new WsProvider(wsEndpoint);
    // Use the constructor (NOT ApiPromise.create) so isReady can be raced
    // against a timeout — create() awaits isReady internally and hangs.
    const api = new ApiPromise({ provider: wsProvider, noInitWarn: true });
    try {
      await Promise.race([
        api.isReady,
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("WS connection timed out after 15 s")), 15000),
        ),
      ]);
      const tx = api.tx.balances.transferAllowDeath(destFallbackSS58, amountPlanck);

      return await new Promise<string>((resolve, reject) => {
        tx.signAndSend(polkadotAddress, { signer: wcSigner } as any, ({ status, txHash, dispatchError }: any) => {
          if (dispatchError) {
            reject(new Error(`Transfer failed: ${dispatchError.toString()}`));
            return;
          }
          if (status.isFinalized || status.isInBlock) {
            resolve(txHash.toHex());
          }
        }).catch(reject);
      });
    } catch (err: any) {
      lastError = err;
      console.warn(`fundViaSubstrateTransfer attempt ${attempt + 1}/${maxAttempts} (${wsEndpoint}):`, err?.message || err);
    } finally {
      try { await api.disconnect(); } catch (_) {}
    }
  }

  throw lastError ?? new Error("Failed to submit funding transfer — all WS endpoints unreachable");
}

/**
 * Derive the H160 (Ethereum address) from a Nova/Substrate SS58 address.
 * On Asset Hub, the first 20 bytes of the AccountId32 are the H160.
 */
export function deriveH160(ss58Address: string): string {
  const decoded = decodeAddress(ss58Address);
  return "0x" + Buffer.from(decoded.slice(0, 20)).toString("hex");
}

/**
 * Convert SS58 to Ethereum address.
 * - If last 12 bytes are 0xEE: strip suffix to get original 20-byte ETH address
 * - Otherwise: hash with Keccak256 and take last 20 bytes
 */
export function ss58ToEth(ss58Address: string): string {
  const substrateBytes = decodeAddress(ss58Address);
  const last12 = substrateBytes.slice(20);
  const isEthDerived = last12.every((b: number) => b === 0xEE);

  let ethBytes: Uint8Array;
  if (isEthDerived) {
    ethBytes = substrateBytes.slice(0, 20);
  } else {
    const hash = ethers.keccak256(substrateBytes);
    ethBytes = ethers.getBytes(hash).slice(-20);
  }

  return "0x" + Buffer.from(ethBytes).toString("hex");
}

/**
 * Compute the Substrate fallback AccountId32 for a given ETH address.
 * Format: eth_addr_bytes (20 bytes) + 0xEE * 12 (12 bytes)
 */
export function computeFallbackSS58(ethAddress: string): string {
  const ethAddrNoPrefix = ethAddress.replace("0x", "").toLowerCase();
  const substrateHex = "0x" + ethAddrNoPrefix + "ee".repeat(12);
  return encodeAddress(substrateHex, 0);
}

/**
 * Generate a fresh one-time ECDSA wallet and compute its Substrate fallback SS58.
 */
export function generateEcdsaWallet(): EcdsaWallet {
  const wallet = ethers.Wallet.createRandom();
  return {
    wallet,
    ethAddress: wallet.address,
    fallbackSS58: computeFallbackSS58(wallet.address),
  };
}

/**
 * Compute deposit commitment matching the v7 circuit.
 * commitment = Poseidon2(Poseidon2(amount, assetId), Poseidon2(nullifier, secret))
 * nullifier = Poseidon2(secret, 1)
 */
export function computeCommitment(
  amountWei: bigint,
  assetId: bigint = 0n,
  secret?: string,
): { secretHex: string; nullifierHex: string; commitmentHex: string; nullifier: bigint; secretBN: bigint } {
  let secretBN: bigint;
  if (secret) {
    secretBN = BigInt(secret);
  } else {
    const secretBytes = ethers.randomBytes(31);
    secretBN = BigInt("0x" + Array.from(secretBytes).map((b) => b.toString(16).padStart(2, "0")).join(""));
  }
  const nullifier = poseidon2([secretBN, 1n]);
  const precommitment = poseidon2([nullifier, secretBN]);
  const valueAssetHash = poseidon2([amountWei, assetId]);
  const commitment = poseidon2([valueAssetHash, precommitment]);

  return {
    secretHex: "0x" + secretBN.toString(16).padStart(64, "0"),
    nullifierHex: "0x" + nullifier.toString(16).padStart(64, "0"),
    commitmentHex: "0x" + commitment.toString(16).padStart(64, "0"),
    nullifier,
    secretBN,
  };
}

const RPC_TIMEOUT_MS = 12000;

function toRpcList(rpc: string | string[]): string[] {
  const list = typeof rpc === "string" ? [rpc] : rpc;
  return list.filter((u) => u && u.trim().length > 0);
}

async function withTimeout<T>(
  p: Promise<T>,
  ms: number,
  label: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out`)), ms);
  });
  try {
    return await Promise.race([p, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/** Minimal JSON-RPC fetch with an abort timeout (never hangs the flow). */
async function rpcFetch(
  rpcUrl: string,
  method: string,
  params: unknown[],
): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), RPC_TIMEOUT_MS);
  try {
    const res = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      signal: controller.signal,
    });
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Connect to the first reachable EVM RPC endpoint, failing over fast.
 */
async function connectProvider(
  rpcs: string[],
  chainId: number,
): Promise<ethers.JsonRpcProvider> {
  let lastErr: unknown;
  for (const rpcUrl of rpcs) {
    try {
      const provider = new ethers.JsonRpcProvider(rpcUrl, chainId, {
        staticNetwork: ethers.Network.from(chainId),
      });
      await withTimeout(
        provider.getBlockNumber(),
        RPC_TIMEOUT_MS,
        `RPC ${rpcUrl}`,
      );
      return provider;
    } catch (e) {
      lastErr = e;
      console.warn(
        `EVM RPC ${rpcUrl} unreachable:`,
        (e as any)?.message || e,
      );
    }
  }
  throw lastErr ?? new Error("All EVM RPC endpoints unreachable");
}

/**
 * Wait for ETH balance to appear at an address after Substrate funding.
 * Asset Hub auto-maps Substrate balance → EVM balance after transfer is finalized.
 * Returns the balance once it appears.
 */
export async function waitForEthBalance(
  evmRpc: string | string[],
  ethAddress: string,
  maxAttempts = 30,
  delayMs = 4000,
): Promise<bigint> {
  const rpcs = toRpcList(evmRpc);
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, delayMs));
    for (const rpcUrl of rpcs) {
      try {
        const d = await rpcFetch(rpcUrl, "eth_getBalance", [
          ethAddress,
          "latest",
        ]);
        const bal = d.result ? BigInt(d.result) : 0n;
        if (bal > 0n) return bal;
      } catch (e: any) {
        console.warn(
          `waitForEthBalance ${rpcUrl} failed:`,
          e?.message || e,
        );
      }
    }
  }
  throw new Error("Timed out waiting for DOT balance to appear. Please confirm you sent funds to the correct SS58 address.");
}

/**
 * Submit depositNative via eth_sendRawTransaction using the ECDSA wallet.
 */
export async function submitDeposit(
  wallet: ethers.BaseWallet,
  evmRpc: string | string[],
  chainId: number,
  contractAddress: string,
  commitmentHex: string,
  amountWei: bigint,
): Promise<{ receipt: ethers.TransactionReceipt; gasPrice: bigint }> {
  const provider = await connectProvider(toRpcList(evmRpc), chainId);
  const signer = wallet.connect(provider);

  const iface = new ethers.Interface([
    "function depositNative(bytes32 commitment) external payable",
  ]);
  const calldata = iface.encodeFunctionData("depositNative", [commitmentHex]);

  const nonce = await provider.getTransactionCount(wallet.address);
  const feeData = await provider.getFeeData();
  const gasPrice = feeData.gasPrice!;
  let gasLimit = 200000n;
  try {
    gasLimit = await provider.estimateGas({
      from: wallet.address, to: contractAddress,
      value: amountWei, data: calldata,
    });
  } catch (_) { /* use fallback */ }

  const maxCost = amountWei + gasLimit * gasPrice;
  const balance = await provider.getBalance(wallet.address);
  if (balance < maxCost) {
    throw new Error(
      `Insufficient funds. Have ${ethers.formatEther(balance)} DOT, need ${ethers.formatEther(maxCost)} DOT. ` +
      `Send at least ${ethers.formatEther(maxCost)} DOT to ${computeFallbackSS58(wallet.address)}`
    );
  }

  const tx = await signer.sendTransaction({
    to: contractAddress, value: amountWei,
    data: calldata, gasLimit, gasPrice, nonce,
  });

  const receipt = await tx.wait();
  if (receipt?.status !== 1) throw new Error("Deposit transaction failed");
  return { receipt, gasPrice };
}

/**
 * Sweep leftover balance from a temporary ECDSA wallet to a destination H160.
 */
export async function sweepBalance(
  wallet: ethers.BaseWallet,
  evmRpc: string | string[],
  chainId: number,
  destH160: string,
  gasPrice?: bigint,
): Promise<void> {
  const provider = await connectProvider(toRpcList(evmRpc), chainId);
  const signer = wallet.connect(provider);

  const gp = gasPrice ?? (await provider.getFeeData()).gasPrice!;
  const sweepGas = 21000n * gp;

  const balance = await provider.getBalance(wallet.address);
  if (balance <= sweepGas) return;

  const sweepAmount = balance - sweepGas;
  const nonce = await provider.getTransactionCount(wallet.address);

  const tx = await signer.sendTransaction({
    to: destH160, value: sweepAmount,
    gasLimit: 21000n, gasPrice: gp, nonce,
  });
  await tx.wait();
}

/**
 * Submit withdraw via eth_sendRawTransaction using the ECDSA wallet.
 * The withdrawn amount goes to `recipient` — set this to the user's H160.
 */
export async function submitWithdraw(
  wallet: ethers.BaseWallet,
  evmRpc: string | string[],
  chainId: number,
  contractAddress: string,
  formattedProof: [bigint, bigint],
  piB: [[bigint, bigint], [bigint, bigint]],
  piC: [bigint, bigint],
  pubSignals: bigint[],
  recipient: string,
): Promise<ethers.TransactionReceipt> {
  const provider = await connectProvider(toRpcList(evmRpc), chainId);
  const signer = wallet.connect(provider);

  const withdrawIface = new ethers.Interface([
    "function withdraw(uint256[2] a, uint256[2][2] b, uint256[2] c, uint[8] pubSignals, address recipient) external",
  ]);
  const calldata = withdrawIface.encodeFunctionData("withdraw", [
    formattedProof, piB, piC, pubSignals, recipient,
  ]);

  const nonce = await provider.getTransactionCount(wallet.address);
  const feeData = await provider.getFeeData();
  const gasPrice = feeData.gasPrice!;
  let gasLimit = 2000000n;
  try {
    gasLimit = await provider.estimateGas({
      from: wallet.address, to: contractAddress, data: calldata,
    });
  } catch (e: any) { /* fallback */ }

  const maxCost = gasLimit * gasPrice;
  const balance = await provider.getBalance(wallet.address);
  if (balance < maxCost) {
    throw new Error(
      `Insufficient gas. Have ${ethers.formatEther(balance)} DOT, need ${ethers.formatEther(maxCost)} DOT. ` +
      `Send ~0.2 DOT to ${computeFallbackSS58(wallet.address)}`
    );
  }

  const tx = await signer.sendTransaction({
    to: contractAddress, data: calldata,
    gasLimit, gasPrice, nonce,
  });
  const receipt = await tx.wait();
  if (receipt?.status !== 1) throw new Error("Withdraw transaction failed");
  return receipt;
}
