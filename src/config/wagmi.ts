/*
 * Copyright 2025 Kusama Shield Developers on behalf of the Kusama DAO, see LICENSE in main folder.
 */

import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
import { createConfig, http } from "wagmi";
import { defineChain, Chain } from "viem";
import type { AppKitNetwork } from "@reown/appkit/networks";

export const projectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID;

if (!projectId) {
  console.warn(
    "VITE_WALLETCONNECT_PROJECT_ID is not defined. EVM wallet connections may not work properly.",
  );
}

// Helper to create Substrate network for WalletConnect (polkadot namespace)
// Uses first 16 bytes of genesis hash as network ID (same as Hydration's approach)
const createSubstrateNetwork = (genesisHash: string, name: string): AppKitNetwork => {
  const id = genesisHash.slice(2, 34); // first 16 bytes = 32 hex chars
  return {
    id,
    name,
    nativeCurrency: { name: "", symbol: "", decimals: 0 },
    rpcUrls: { default: { http: [], webSocket: [] } },
    chainNamespace: "polkadot" as const,
    caipNetworkId: `polkadot:${id}`,
  };
};

// Known Substrate genesis hashes for Asset Hubs
const POLKADOT_AH_GENESIS = "0x68d56f15f85d3136970ec16946040bc1752654e906147f7e43e9d539d7c3de01";
const KUSAMA_AH_GENESIS = "0x48239ef607d7928874027a43a67689209727dfb3d3dc5e5b823a03cf8febd803";
const PASEO_AH_GENESIS = "0x42b39a5cf6cf3b7c7c7c7c7c7c7c7c7c7c7c7c7c7c7c7c7c7c7c7c7c7c7c";

export const polkadotAhSubstrate = createSubstrateNetwork(POLKADOT_AH_GENESIS, "Polkadot Asset Hub");
export const kusamaAhSubstrate = createSubstrateNetwork(KUSAMA_AH_GENESIS, "Kusama Asset Hub");
export const paseoAhSubstrate = createSubstrateNetwork(PASEO_AH_GENESIS, "Paseo Asset Hub");

// EVM chains
export const kusamaAssetHub = defineChain({
  id: 420420418, name: "Kusama Asset Hub",
  nativeCurrency: { name: "Kusama", symbol: "KSM", decimals: 18 },
  rpcUrls: { default: { http: ["https://eth-rpc-kusama.polkadot.io/"] } },
  blockExplorers: { default: { name: "Blockscout", url: "https://blockscout-kusama.polkadot.io/" } },
});

export const westendAssetHub = defineChain({
  id: 420420421, name: "Westend Asset Hub",
  nativeCurrency: { name: "Westend", symbol: "WND", decimals: 18 },
  rpcUrls: { default: { http: ["https://westend-asset-hub-eth-rpc.polkadot.io"] } },
  blockExplorers: { default: { name: "Blockscout", url: "https://blockscout-asset-hub.parity-chains-scw.parity.io" } },
  testnet: true,
});

export const paseoAssetHubV3 = defineChain({
  id: 420420417, name: "Paseo Asset Hub v3",
  nativeCurrency: { name: "Paseo", symbol: "PAS", decimals: 18 },
  rpcUrls: { default: { http: ["https://eth-asset-hub-paseo.dotters.network/"] } },
  blockExplorers: { default: { name: "Blockscout", url: "https://blockscout-passet-hub.parity-testnet.parity.io" } },
  testnet: true,
});

export const paseoAssetHub = defineChain({
  id: 420420417, name: "Paseo Asset Hub",
  nativeCurrency: { name: "Paseo", symbol: "PAS", decimals: 18 },
  rpcUrls: { default: { http: ["https://services.polkadothub-rpc.com/testnet/"] } },
  blockExplorers: { default: { name: "Blockscout", url: "https://blockscout-passet-hub.parity-testnet.parity.io" } },
  testnet: true,
});

export const moonbaseAlpha = defineChain({
  id: 1287, name: "Moonbase Alpha",
  nativeCurrency: { name: "DEV", symbol: "DEV", decimals: 18 },
  rpcUrls: { default: { http: ["https://moonbase.public.curie.radiumblock.co/http"] } },
  blockExplorers: { default: { name: "Moonscan", url: "https://moonbase.moonscan.io" } },
  testnet: true,
});

export const polkadotAssetHub = defineChain({
  id: 420420419, name: "Polkadot Asset Hub",
  nativeCurrency: { name: "Polkadot", symbol: "DOT", decimals: 18 },
  rpcUrls: { default: { http: ["https://eth-rpc.polkadot.io/"] } },
  blockExplorers: { default: { name: "Blockscout", url: "https://blockscout.polkadot.io/" } },
});

export const base = defineChain({
  id: 8453, name: "Base",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://mainnet.base.org"] } },
  blockExplorers: { default: { name: "Basescan", url: "https://basescan.org" } },
});

export const moonbeam = defineChain({
  id: 1284, name: "Moonbeam",
  nativeCurrency: { name: "GLMR", symbol: "GLMR", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.api.moonbeam.network"] } },
});

export const moonriver = defineChain({
  id: 2023, name: "Moonriver",
  nativeCurrency: { name: "MOVR", symbol: "MOVR", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.moonriver.moonbeam.network"] } },
});

// EVM networks only (for wagmi)
export const networks: Chain[] = [
  polkadotAssetHub, kusamaAssetHub, westendAssetHub,
  paseoAssetHubV3, paseoAssetHub, moonbaseAlpha,
  base, moonbeam, moonriver,
];

// All networks for AppKit - EVM + Substrate (polkadot namespace)
// This is how Hydration does it: pass both EVM and Substrate networks
export const allNetworks: (Chain | AppKitNetwork)[] = [
  ...networks,
  polkadotAhSubstrate,
  kusamaAhSubstrate,
  paseoAhSubstrate,
];

// Create the Wagmi adapter
export const wagmiAdapter = projectId
  ? new WagmiAdapter({
      projectId,
      networks: allNetworks as any,
    })
  : null;

export const wagmiConfig = wagmiAdapter
  ? wagmiAdapter.wagmiConfig
  : createConfig({
      chains: networks as any,
      transports: Object.fromEntries(networks.map((chain) => [chain.id, http()])),
    });