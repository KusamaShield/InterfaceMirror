/*
 * Copyright 2025 Kusama Shield Developers on behalf of the Kusama DAO, see LICENSE in main folder.
 *
 * Polkadot.js browser extension wallet shield/unshield via `revive.call`
 * Substrate extrinsics on Polkadot Asset Hub (v7 pool).
 *
 * This mirrors src/tests/roundtrip_revive_polkadot.ts exactly:
 *   - depositNative(bytes32 commitment)                     [single param]
 *   - withdraw(uint256[2],uint256[2][2],uint256[2],uint256[8],address)
 *   - commitment = Poseidon2(Poseidon2(amountWei, asset), Poseidon2(nullifier, secret))
 *     nullifier   = Poseidon2(secret, 1)
 *   - value passed to revive.call is in native planck; the pallet converts to
 *     wei via NativeToEthRatio (100_000_000 on Polkadot AH).
 */

import { ApiPromise, WsProvider } from "@polkadot/api";
import { ethers } from "ethers";
import { poseidon2 } from "poseidon-lite";
import { LeanIMT } from "./merkle";
import { ss58ToEth, computeCommitment } from "./forwarder";
import worker from "../workers/snarkjs-client";

export const POLKADOT_V7_POOL = "0x0D694Da746e73D1e255c1894F90e38170db45809";
export const POLKADOT_EVM_RPC = "https://polkadot-assethub-rpc.laissez-faire.trade";
export const POLKADOT_WS_RPCS = [
  "wss://asset-hub-polkadot-rpc.n.dwellir.com",
  "wss://asset-hub-polkadot.gatotech.network",
  "wss://rpc-asset-hub-polkadot.helixstreet.io",
  "wss://rpc-asset-hub-polkadot.luckyfriday.io",
  "wss://statemint.api.onfinality.io/public-ws",
  "wss://polkadot-asset-hub-rpc.polkadot.io",
  "wss://rpc-asset-hub-polkadot.stakeworld.io",
];
export const POLKADOT_PROXY_URL = "https://proxyswap.laissez-faire.trade";

// 1 DOT = 1e10 planck; the revive pallet multiplies planck by this to get wei.
export const NATIVE_TO_ETH_RATIO = 100_000_000n;
// Kusama AH: KSM 12 decimals, NativeToEthRatio = 1e6 (verified via revive consts).
export const KUSAMA_NATIVE_TO_ETH_RATIO = 1_000_000n;
export const KUSAMA_NATIVE_DECIMALS = 12;

/** Per-network native decimals (planck) for revive.call amounts. */
export function networkNativeDecimals(network?: string): number {
  return network === "kusama" ? KUSAMA_NATIVE_DECIMALS : 10;
}

/** Per-network NativeToEthRatio (planck → wei inside the revive pallet). */
export function networkNativeToEthRatio(network?: string): bigint {
  return network === "kusama" ? KUSAMA_NATIVE_TO_ETH_RATIO : NATIVE_TO_ETH_RATIO;
}

const SNARK_FIELD =
  21888242871839275222246405745257275088548364400416034343698204186575808495617n;

const WS_TIMEOUT_MS = 15000;
const DEPOSIT_GAS = { refTime: 1_500_000_000_000n, proofSize: 8_000_000n };
const WITHDRAW_GAS = { refTime: 1_000_000_000_000n, proofSize: 8_000_000n };
const DEPOSIT_STORAGE_DEPOSIT = 500_000_000_000n;
const WITHDRAW_STORAGE_DEPOSIT = 100_000_000_000n;

export { ss58ToEth };

/** Parse a human DOT/KSM amount into planck (native decimals) and wei. */
export function parseDotAmount(
  amount: string,
  network?: string,
): { amountPlanck: bigint; amountWei: bigint } {
  const num = parseFloat(amount);
  if (isNaN(num) || num <= 0) throw new Error("Invalid amount");
  const decimals = networkNativeDecimals(network);
  const amountPlanck = BigInt(Math.round(num * 10 ** decimals));
  const amountWei = amountPlanck * networkNativeToEthRatio(network);
  return { amountPlanck, amountWei };
}

/** Connect to the first reachable Substrate WS endpoint (failover + timeout). */
export async function connectSubstrate(
  wsEndpoints: string[] = POLKADOT_WS_RPCS,
): Promise<ApiPromise> {
  let lastErr: unknown;
  for (const wsUrl of wsEndpoints) {
    const ws = new WsProvider(wsUrl);
    const api = new ApiPromise({ provider: ws, noInitWarn: true });
    try {
      await Promise.race([
        api.isReady,
        new Promise<never>((_, r) =>
          setTimeout(
            () => r(new Error(`WS timeout after 15s`)),
            WS_TIMEOUT_MS,
          ),
        ),
      ]);
      return api;
    } catch (e) {
      lastErr = e;
      console.warn(`[revive] WS ${wsUrl} failed:`, (e as any)?.message || e);
      // Don't call api.disconnect() here — it triggers a background
      // metadata fetch that fires FATAL unhandled rejections. The dangling
      // ApiPromise will be GC'd naturally.
    }
  }
  throw lastErr ?? new Error("All Polkadot WS endpoints unreachable");
}

/** Ensure the AccountId32 is mapped for revive (mapAccount if unmapped).
 *  Returns true if a mapAccount tx was sent, false if already mapped. */
export async function ensureAccountMapped(
  api: ApiPromise,
  ss58: string,
  h160: string,
  signer: any,
  walletSource?: string,
): Promise<boolean> {
  const mapped: any = await api.query.revive.accountInfoOf(h160);
  if (!mapped.isEmpty) {
    console.log("[revive] account already mapped, h160:", h160);
    return false;
  }

  console.log("[revive] account NOT mapped, mapping via mapAccount(). walletSource:", walletSource || "(none)");

  // Upgrade to the polkadot.js extension's proper signer when available.
  let extSigner = signer;
  try {
    const { web3Enable, web3FromAddress, web3FromSource } = await import("@polkadot/extension-dapp");
    await web3Enable("Kusama Shield");
    if (walletSource) {
      const injected = await web3FromSource(walletSource);
      if (injected?.signer) { extSigner = injected.signer; console.log("[revive] using web3FromSource signer:", walletSource); }
    } else {
      const injected = await web3FromAddress(ss58);
      if (injected?.signer) { extSigner = injected.signer; console.log("[revive] using web3FromAddress signer"); }
    }
  } catch (e) {
    console.warn("[revive] signer upgrade failed, using wallet signer:", (e as any)?.message || e);
  }

  await new Promise<void>((resolve, reject) => {
    let done = false;
    api.tx.revive
      .mapAccount()
      .signAndSend(ss58, { signer: extSigner }, ({ status, txHash, dispatchError }: any) => {
        if (done) {
          if (dispatchError && dispatchError.isModule) {
            const { index, name } = api.registry.findMetaError(dispatchError.asModule);
            console.warn(`[revive] mapAccount belated dispatch error: ${index}.${name}`);
          }
          return;
        }
        if (dispatchError) {
          done = true;
          if (dispatchError.isModule) {
            const { index, name } = api.registry.findMetaError(dispatchError.asModule);
            if (name === "AccountAlreadyMapped") resolve();
            else reject(new Error(`mapAccount: ${index}.${name}`));
          } else reject(new Error(dispatchError.toString()));
          return;
        }
        if (txHash && (status.isInBlock || status.isFinalized)) {
          done = true;
          console.log("[revive] mapAccount in block, tx:", txHash.toHex());
          resolve();
        }
      })
      .catch(reject);
  });

// Verify on-chain. On Kusama AH the originalAccount query can hang on
  // some WS endpoints — add a timeout so we don't block forever.
  // Also, block state may lag behind the isInBlock notification on stale WS
  // connections, so retry once after a delay.
  let queryErr = false;
  try {
    const verifyMapped: any = await Promise.race([
      api.query.revive.accountInfoOf(h160),
      new Promise((_, r) => setTimeout(() => r(new Error("QUERY_TIMEOUT")), 8000)),
    ]) as any;
    if (verifyMapped && !verifyMapped.isEmpty) {
      console.log("[revive] account mapped successfully, verified on-chain");
      return true;
    }
  } catch (e) {
    queryErr = true;
    if ((e as Error).message === "QUERY_TIMEOUT") {
      console.warn("[revive] accountInfoOf query timed out, retrying after delay...");
    } else {
      console.warn("[revive] accountInfoOf query error, retrying:", (e as Error).message);
    }
  }

  // WS block import is often slow on Dwellir — wait and retry.
  console.log("[revive] waiting 4s for WS to import block, then retrying...");
  await new Promise((r) => setTimeout(r, 4000));
  try {
    const retry: any = await Promise.race([
      api.query.revive.accountInfoOf(h160),
      new Promise((_, r) => setTimeout(() => r(new Error("QUERY_TIMEOUT")), 8000)),
    ]) as any;
    if (retry && !retry.isEmpty) {
      console.log("[revive] account mapped (verified on retry)");
      return true;
    }
    console.warn("[revive] account still unmapped after retry — query returned empty");
  } catch (e) {
    console.warn("[revive] accountInfoOf retry also failed:", (e as Error).message);
  }
  // Proceed anyway — if mapping truly failed, the deposit will fail with a clear error.
  console.warn("[revive] proceeding with deposit despite unverified mapping");
  return true;
}

/** Read the pool's current root from the EVM RPC. */
export async function getChainRoot(
  poolAddress: string = POLKADOT_V7_POOL,
  evmRpc: string = POLKADOT_EVM_RPC,
): Promise<bigint> {
  const provider = new ethers.JsonRpcProvider(evmRpc);
  const contract = new ethers.Contract(
    poolAddress,
    [
      "function currentRoot() view returns (uint256)",
      "function treeSize() view returns (uint256)",
    ],
    provider,
  );
  return BigInt((await contract.currentRoot()).toString());
}

/** Fetch the ordered leaf list from the Flask proxy and rebuild a LeanIMT.
 *  Retries up to maxRetries times with delayMs between attempts if the
 *  local root doesn't match the on-chain root (proxy monitor may lag
 *  behind the latest block). */
export async function fetchProxyTree(
  network = "polkadot",
  options?: { maxRetries?: number; delayMs?: number; poolAddress?: string; evmRpc?: string },
): Promise<{ tree: LeanIMT; leaves: bigint[]; size: number }> {
  const maxRetries = options?.maxRetries ?? 3;
  const delayMs = options?.delayMs ?? 5000;

  const chainRoot = await getChainRoot(options?.poolAddress, options?.evmRpc);

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const res = await fetch(`${POLKADOT_PROXY_URL}/tree-leaves/${network}`);
    if (!res.ok) throw new Error(`Proxy fetch failed: ${res.status}`);
    const data = await res.json();
    if (!data.leaves || data.leaves.length === 0)
      throw new Error("Proxy returned empty leaves");

    const leaves = data.leaves.map((l: string | number) => BigInt(l));
    const tree = new LeanIMT();
    for (const leaf of leaves) {
      if (leaf !== 0n) tree.insert(leaf);
    }

    const proxyRoot = data.root ? BigInt(data.root) : 0n;
    console.log(`[fetchProxyTree] attempt ${attempt + 1}/${maxRetries}: proxy_size=${tree.size} proxy_root=${tree.root} chain_root=${chainRoot}`);

    if (tree.root === chainRoot) {
      console.log(`[fetchProxyTree] root match on attempt ${attempt + 1}`);
      return { tree, leaves, size: tree.size };
    }

    if (attempt < maxRetries - 1) {
      console.log(`[fetchProxyTree] root mismatch, retrying in ${delayMs / 1000}s...`);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }

  // Last attempt — return the tree even if root doesn't match.
  // The caller should insert their own commitment and re-check.
  const res = await fetch(`${POLKADOT_PROXY_URL}/tree-leaves/${network}`);
  const data = await res.json();
  const leaves = data.leaves.map((l: string | number) => BigInt(l));
  const tree = new LeanIMT();
  for (const leaf of leaves) {
    if (leaf !== 0n) tree.insert(leaf);
  }
  console.log(`[fetchProxyTree] returning stale tree: size=${tree.size} root=${tree.root} (chain has ${chainRoot})`);
  return { tree, leaves, size: tree.size };
}

/**
 * Submit a deposit via revive.call → depositNative(bytes32 commitment).
 * The value is in planck; the pallet converts to wei before the call.
 * Returns the tx hash and the Substrate block the deposit landed in.
 */
export async function submitReviveDeposit(
  api: ApiPromise,
  ss58: string,
  signer: any,
  amountPlanck: bigint,
  commitmentHex: string,
  poolAddress: string = POLKADOT_V7_POOL,
  walletSource?: string,
): Promise<{ txHash: string; block: number | null }> {
  const depositIface = new ethers.Interface([
    "function depositNative(bytes32) payable",
  ]);
  const callData = depositIface.encodeFunctionData("depositNative", [
    commitmentHex,
  ]);

  const blockBefore = (await api.rpc.chain.getHeader()).number.toNumber();

  // Use the polkadot.js extension's proper signer when available.
  let extSigner = signer;
  try {
    const { web3Enable, web3FromAddress, web3FromSource } = await import("@polkadot/extension-dapp");
    await web3Enable("Kusama Shield");
    if (walletSource) {
      const injected = await web3FromSource(walletSource);
      if (injected?.signer) { extSigner = injected.signer; console.log("[revive] using web3FromSource signer:", walletSource); }
    } else {
      const injected = await web3FromAddress(ss58);
      if (injected?.signer) { extSigner = injected.signer; console.log("[revive] using web3FromAddress signer"); }
    }
  } catch (e) {
    console.warn("[revive] signer upgrade failed, using wallet signer:", (e as any)?.message || e);
  }

  const txHash = await new Promise<string>((resolve, reject) => {
    let done = false;
    api.tx.revive
      .call(
        poolAddress,
        amountPlanck,
        DEPOSIT_GAS,
        DEPOSIT_STORAGE_DEPOSIT.toString(),
        callData,
      )
      .signAndSend(ss58, { signer: extSigner }, ({ status, txHash, dispatchError }: any) => {
        if (done) {
          if (dispatchError && dispatchError.isModule) {
            const { index, name } = api.registry.findMetaError(dispatchError.asModule);
            console.warn(`[revive] deposit belated dispatch error: ${index}.${name}`);
          }
          return;
        }
        if (dispatchError) {
          done = true;
          if (dispatchError.isModule) {
            const { index, name } = api.registry.findMetaError(
              dispatchError.asModule,
            );
            reject(new Error(`deposit: ${index}.${name}`));
          } else reject(new Error(dispatchError.toString()));
          return;
        }
        if (txHash && (status.isInBlock || status.isFinalized)) {
          done = true;
          resolve(txHash.toHex());
        }
      })
      .catch(reject);
  });

  // Locate the deposit block via revive.ContractEmitted events.
  const commitment = BigInt(commitmentHex);
  let depositBlock: number | null = null;
  for (let bn = blockBefore + 1; bn <= blockBefore + 10; bn++) {
    try {
      const bh = await api.rpc.chain.getBlockHash(bn);
      const events: any[] = await api.query.system.events.at(bh);
      for (const r of events) {
        if (!r.phase.isApplyExtrinsic) continue;
        const ev: any = r.event;
        if (ev.section === "revive" && ev.method === "ContractEmitted") {
if (
            ev.data[0].toString().toLowerCase() !==
            poolAddress.toLowerCase()
          )
            continue;
          const emitted = BigInt(
            ev.data[1].toHex ? ev.data[1].toHex() : ev.data[1].toString(),
          );
          if (emitted === commitment) {
            depositBlock = bn;
            break;
          }
        }
      }
      if (depositBlock !== null) break;
    } catch {}
  }

  return { txHash, block: depositBlock };
}

/** Generate the v7 withdraw ZK proof (via the snarkjs worker). */
export async function generateWithdrawProof(params: {
  h160: string;
  amountWei: bigint;
  tree: LeanIMT;
  commitment: bigint;
  secretBN: bigint;
  nullifier: bigint;
  root: bigint;
}): Promise<{ proof: any; publicSignals: string[] }> {
  const { h160, amountWei, tree, commitment, secretBN, nullifier, root } =
    params;

  const ctxHash = ethers.keccak256(
    ethers.solidityPacked(["address", "address"], [h160, ethers.ZeroAddress]),
  );
  const context = (BigInt(ctxHash) % SNARK_FIELD).toString();

  const ns = ethers.randomBytes(31);
  const newSecret =
    "0x" +
    Array.from(ns)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  const newSecretBN = BigInt(newSecret);
  const newNullifier = poseidon2([newSecretBN, 1n]).toString();

  const leafIdx = tree.findLeafIndex(commitment);
  if (leafIdx === -1) throw new Error("Commitment not found in Merkle tree");
  const merkleProof = tree.getProof(leafIdx);

  const input = {
    withdrawnValue: amountWei.toString(),
    root: root.toString(),
    treeDepth: "128",
    context,
    asset: "0x0000000000000000000000000000000000000000",
    existingValue: amountWei.toString(),
    existingNullifier: nullifier.toString(),
    existingSecret: secretBN.toString(),
    newNullifier,
    newSecret: newSecretBN.toString(),
    siblings: merkleProof.siblings,
    leafIndex: leafIdx.toString(),
  };

  return worker.groth16FullProve(
    input,
    "/withdraw_phase2_fixed_v7.wasm",
    "/withdraw_phase2_fixed_v7_0001.zkey",
  );
}

/** Format a snarkjs proof for the Solidity verifier (G2 transpose). */
export function formatProof(proof: any) {
  return [
    [BigInt(proof.pi_a[0]), BigInt(proof.pi_a[1])],
    [
      [BigInt(proof.pi_b[0][1]), BigInt(proof.pi_b[0][0])],
      [BigInt(proof.pi_b[1][1]), BigInt(proof.pi_b[1][0])],
    ],
    [BigInt(proof.pi_c[0]), BigInt(proof.pi_c[1])],
  ];
}

/**
 * Submit a withdraw via revive.call → withdraw(proof, 8 pubSignals, recipient).
 * The recipient is the user's derived H160, so funds land on their Substrate
 * account balance on Asset Hub.
 */
export async function submitReviveWithdraw(
  api: ApiPromise,
  ss58: string,
  signer: any,
  h160: string,
  proof: any,
  publicSignals: string[],
  poolAddress: string = POLKADOT_V7_POOL,
  walletSource?: string,
): Promise<string> {
  const formatted = formatProof(proof);
  const pub = publicSignals.map((s) => BigInt(s));

  const wdIface = new ethers.Interface([
    "function withdraw(uint256[2],uint256[2][2],uint256[2],uint256[8],address)",
  ]);
  const wd = wdIface.encodeFunctionData("withdraw", [
    formatted[0],
    formatted[1],
    formatted[2],
    pub.slice(0, 8),
    h160,
  ]);

  // Use the polkadot.js extension's proper signer when available.
  let extSigner = signer;
  try {
    const { web3Enable, web3FromAddress, web3FromSource } = await import("@polkadot/extension-dapp");
    await web3Enable("Kusama Shield");
    if (walletSource) {
      const injected = await web3FromSource(walletSource);
      if (injected?.signer) { extSigner = injected.signer; console.log("[revive] using web3FromSource signer:", walletSource); }
    } else {
      const injected = await web3FromAddress(ss58);
      if (injected?.signer) { extSigner = injected.signer; console.log("[revive] using web3FromAddress signer"); }
    }
  } catch (e) {
    console.warn("[revive] signer upgrade failed, using wallet signer:", (e as any)?.message || e);
  }

  return new Promise<string>((resolve, reject) => {
    api.tx.revive
      .call(
        poolAddress,
        0n,
        WITHDRAW_GAS,
        WITHDRAW_STORAGE_DEPOSIT.toString(),
        wd,
      )
      .signAndSend(ss58, { signer: extSigner }, ({ status, txHash, dispatchError }: any) => {
        if (dispatchError) {
          if (dispatchError.isModule) {
            const { index, name } = api.registry.findMetaError(
              dispatchError.asModule,
            );
            reject(new Error(`withdraw: ${index}.${name}`));
          } else reject(new Error(dispatchError.toString()));
        }
        if (txHash && (status.isInBlock || status.isFinalized)) resolve(txHash.toHex());
      })
      .catch(reject);
  });
}

/**
 * Submit withdraw via Flask proxy (forwarder approach).
 * The proxy generates the ZK proof and submits the transaction.
 * Returns the tx hash.
 */
export async function submitWithdrawViaProxy(
  secret: string,
  network: string,
  amountWei: string,
  recipient: string,
  proxyUrl: string = POLKADOT_PROXY_URL,
): Promise<string> {
  console.log(`[proxy-withdraw] Calling proxy for ${network}, amount=${amountWei}, recipient=${recipient}`);
  
  const response = await fetch(`${proxyUrl}/pool-withdraw`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      secret,
      network,
      amount_wei: amountWei,
      recipient,
    }),
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || `Proxy withdraw failed: ${response.status}`);
  }
  
  const data = await response.json();
  console.log(`[proxy-withdraw] Received withdraw_id: ${data.withdraw_id}`);
  
  // Poll for status
  let status = data.status;
  while (status === "pending" || status === "processing") {
    await new Promise((r) => setTimeout(r, 5000));
    const statusResp = await fetch(`${proxyUrl}/pool-withdraw-status/${data.withdraw_id}`);
    const statusData = await statusResp.json();
    status = statusData.status;
    console.log(`[proxy-withdraw] Status: ${status} - ${statusData.message || ""}`);
    
    if (status === "confirmed" || status === "forwarding") {
      return statusData.tx_hash || data.withdraw_id;
    }
    if (status === "failed" || status === "error") {
      throw new Error(statusData.message || "Withdraw failed");
    }
  }
  
  return data.withdraw_id;
}

/**
 * Compute the v7 deposit commitment + nullifier for a given amount/secret.
 * Returns the pieces needed for both shield and unshield.
 */
export function deriveV7Commitment(amountWei: bigint, secret: string) {
  const { commitmentHex, nullifier, secretBN } = computeCommitment(
    amountWei,
    0n,
    secret,
  );
  return {
    commitment: BigInt(commitmentHex),
    commitmentHex,
    nullifier,
    secretBN,
  };
}
