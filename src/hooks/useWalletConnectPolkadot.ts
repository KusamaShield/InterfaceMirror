/*
 * Copyright 2025 Kusama Shield Developers on behalf of the Kusama DAO, see LICENSE in main folder.
 *
 * WalletConnect Substrate (polkadot) signer utility.
 * When Nova or other wallets connect via WalletConnect with polkadot namespace,
 * this provides signing via polkadot_signTransaction.
 */

import type UniversalProvider from "@walletconnect/universal-provider";
import { getPolkadotSignerFromPjs, type PolkadotSigner } from "polkadot-api/pjs-signer";
import type { AppKit } from "@reown/appkit";

export type Caip10Account = {
  namespace: string;
  chainId: string;
  address: string;
};

export function parseCaip10Account(caip: string): Caip10Account | null {
  const parts = caip.split(":");
  if (parts.length < 3) return null;
  const [namespace, chainId, ...addressParts] = parts;
  return { namespace, chainId, address: addressParts.join(":") };
}

export function getAccountsFromProvider(
  provider: UniversalProvider,
): Record<string, Caip10Account[]> {
  const namespaces = provider.session?.namespaces;
  if (!namespaces) return {};

  return Object.fromEntries(
    Object.entries(namespaces).map(([key, ns]) => [
      key,
      ns.accounts
        .map(parseCaip10Account)
        .filter((a): a is Caip10Account => a !== null),
    ]),
  );
}

export function hasPolkadotNamespace(
  provider: UniversalProvider,
): boolean {
  const accounts = getAccountsFromProvider(provider);
  const polkadotAccounts = accounts.polkadot;
  return !!(polkadotAccounts && polkadotAccounts.length > 0);
}

export function getPolkadotAddress(
  provider: UniversalProvider,
): string | null {
  const accounts = getAccountsFromProvider(provider);
  return accounts.polkadot?.[0]?.address ?? null;
}

export function getEip155Address(
  provider: UniversalProvider,
): string | null {
  const accounts = getAccountsFromProvider(provider);
  return accounts.eip155?.[0]?.address ?? null;
}

/**
 * Create a PolkadotSigner that signs transactions via WalletConnect.
 * This is the same approach used by Hydration UI.
 */
export function createWalletConnectPolkadotSigner(
  appKit: AppKit,
  address: string,
): PolkadotSigner {
  const provider = appKit.getProvider<UniversalProvider>("polkadot");
  if (!provider) throw new Error("No polkadot provider found");

  return getPolkadotSignerFromPjs(
    address,
    // signTx callback
    (transactionPayload: any) => {
      if (!provider.session) throw new Error("No WalletConnect session");
      const genesisHash = transactionPayload.genesisHash;
      return provider.client.request({
        topic: provider.session.topic,
        chainId: `polkadot:${genesisHash.substring(2, 34)}`,
        request: {
          method: "polkadot_signTransaction",
          params: {
            address,
            transactionPayload,
          },
        },
      });
    },
    // signBytes callback (for messages)
    async ({ address, data }: { address: string; data: any }) => {
      if (!provider.session) throw new Error("No WalletConnect session");
      const networks = appKit.getCaipNetworks("polkadot");
      const chainId = networks[0]?.caipNetworkId;
      if (!chainId) throw new Error("No chainId found");
      return provider.client.request({
        topic: provider.session.topic,
        chainId,
        request: {
          method: "polkadot_signMessage",
          params: { address, message: data },
        },
      });
    },
  );
}
