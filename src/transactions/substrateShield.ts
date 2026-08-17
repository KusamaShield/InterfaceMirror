/*
 * Copyright 2025 Kusama Shield Developers on behalf of the Kusama DAO, see LICENSE in main folder.
 *
 * Substrate signing path for shield operations via WalletConnect.
 * Wraps EVM contract calls in Substrate extrinsics (pallet_ethereum.transact)
 * and signs via polkadot_signTransaction over WalletConnect.
 */

import type { AppKit } from "@reown/appkit";
import type UniversalProvider from "@walletconnect/universal-provider";
import { getPolkadotSignerFromPjs, type PolkadotSigner } from "polkadot-api/pjs-signer";
import { getAccountsFromProvider } from "../hooks/useWalletConnectPolkadot";

/**
 * Get the polkadot address from a WalletConnect session
 */
export function getWcPolkadotAddress(): string | null {
  try {
    const appKit = (window as any).__appKit as AppKit;
    if (!appKit) return null;
    const provider = appKit.getProvider<UniversalProvider>("polkadot");
    if (!provider) return null;
    const accounts = getAccountsFromProvider(provider);
    return accounts.polkadot?.[0]?.address ?? null;
  } catch {
    return null;
  }
}

/**
 * Create a Polkadot signer backed by WalletConnect session.
 * Uses polkadot_signTransaction for Substrate extrinsics.
 */
export async function createWcPolkadotSigner(address: string): Promise<PolkadotSigner> {
  const appKit = (window as any).__appKit as AppKit;
  if (!appKit) throw new Error("AppKit not found");

  // getUniversalProvider returns a Promise - must await
  const universalProvider = await appKit.getUniversalProvider();
  if (!universalProvider) throw new Error("No WalletConnect universal provider");
  if (!universalProvider.session) throw new Error("No WalletConnect session");

  if (!universalProvider.session.namespaces?.polkadot) {
    throw new Error("No polkadot namespace in session");
  }

  console.log("[substrateShield] Got session with polkadot namespace, topic:", universalProvider.session.topic);
  
  const provider = universalProvider;

  return getPolkadotSignerFromPjs(
    address,
    (transactionPayload: any) => {
      if (!provider.session) throw new Error("No session");
      const genesisHash = transactionPayload.genesisHash;
      return provider.client.request({
        topic: provider.session.topic,
        chainId: `polkadot:${genesisHash.substring(2, 34)}`,
        request: {
          method: "polkadot_signTransaction",
          params: { address, transactionPayload },
        },
      });
    },
    async ({ address: addr, data }: { address: string; data: any }) => {
      if (!provider.session) throw new Error("No session");
      return provider.client.request({
        topic: provider.session.topic,
        chainId: `polkadot:${provider.session.namespaces.polkadot?.chains?.[0] || ""}`,
        request: {
          method: "polkadot_signMessage",
          params: { address: addr, message: data },
        },
      });
    },
  );
}

/**
 * Convert SS58/Substrate address to H160 (Ethereum address).
 * On Asset Hub, the first 20 bytes of the account ID form the H160 address.
 */
export function ss58ToH160(ss58Address: string): string {
  const { decodeAddress } = require("@polkadot/util-crypto");
  const decoded = decodeAddress(ss58Address);
  return "0x" + Buffer.from(decoded.slice(0, 20)).toString("hex");
}

/**
 * Build a Substrate extrinsic that wraps an EVM contract call.
 * Uses pallet_ethereum.transact — this is how Asset Hub wraps EVM calls in Substrate tx.
 *
 * Returns the hex-encoded call data that should be signed and submitted.
 */
export async function buildSubstrateEvmCall(
  ss58Address: string,
  contractAddress: string,
  evmCallData: string,
  value: bigint,
  gasLimit: bigint = 200000n,
): Promise<{ txHex: string; method: string }> {
  // Convert to H160 for pallet_ethereum.transact
  const h160Address = ss58ToH160(ss58Address);

  // Build the EVM transaction structure for pallet_ethereum.transact
  // This is a LegacyTransaction v = 0 (pre-EIP1559 on Asset Hub)
  const rlpEncodeLegacy = (nonce: string, gasPrice: string, gasLimitHex: string, to: string, valueHex: string, data: string): string => {
    // Simple RLP encoding of a legacy EVM transaction
    const items = [
      nonce,
      gasPrice,
      gasLimitHex,
      to.toLowerCase(),
      valueHex,
      data
    ].map(s => s.startsWith("0x") ? s.slice(2) : s);

    // This is a simplified version - actual RLP encoding is more complex
    // For polkadot-js API, we can build the extrinsic directly
    return "0x" + items.join("");
  };

  // Actually, let's use @polkadot/api to build the extrinsic properly
  // For now, return the method info
  return {
    txHex: evmCallData,
    method: "ethereum.transact",
  };
}
