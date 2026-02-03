/*
 * Copyright 2025 Kusama Shield Developers on behalf of the Kusama DAO, see LICENSE in main folder.
 */

import React, { ReactNode } from "react";
import { QueryClient } from "@tanstack/query-core";
import { QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider } from "wagmi";
import { createAppKit } from "@reown/appkit/react";
import {
  wagmiConfig,
  wagmiAdapter,
  networks,
  projectId,
  kusamaAssetHub,
} from "../config/wagmi";

const queryClient = new QueryClient();

const metadata = {
  name: "Kusama Shield",
  description: "Privacy-preserving transfers on Kusama",
  url: typeof window !== "undefined" ? window.location.origin : "https://kusamashield.app",
  icons: ["https://kusamashield.app/icon.png"],
};

// Initialize AppKit outside the component render cycle
if (projectId) {
  createAppKit({
    adapters: [wagmiAdapter],
    projectId,
    networks: [...networks],
    defaultNetwork: kusamaAssetHub,
    metadata,
    features: {
      analytics: true,
      email: false, // Disable email login
      socials: [], // Disable social logins, set to ['google', 'github', etc.] to enable
    },
    themeMode: "dark",
    themeVariables: {
      "--w3m-accent": "#e91e63", // Pink accent to match app theme
      "--w3m-border-radius-master": "8px",
    },
  });
}

interface Web3ProviderProps {
  children: ReactNode;
}

export default function Web3Provider({ children }: Web3ProviderProps) {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
