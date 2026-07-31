/*
 * Copyright 2025 Kusama Shield Developers on behalf of the Kusama DAO, see LICENSE in main folder.
 */

import React, { ReactNode, useEffect } from "react";
import { QueryClient } from "@tanstack/query-core";
import { QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider } from "wagmi";
import { createAppKit, useAppKit } from "@reown/appkit/react";
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
      socials: [], // Disable social logins
    },
    themeMode: "dark",
    themeVariables: {
      "--w3m-accent": "#e91e63",
      "--w3m-border-radius-master": "8px",
    },
  });
}

// Hook to inject modal positioning styles
function useModalPositioning() {
  useEffect(() => {
    // Style injection function
    const injectModalStyles = () => {
      // First try to find the w3m-modal element
      const modalElement = document.querySelector("w3m-modal");
      if (modalElement && modalElement.shadowRoot) {
        const style = document.createElement("style");
        style.textContent = `
          /* Override the overlay container */
          wui-flex[data-testid="w3m-modal-overlay"] {
            align-items: flex-start !important;
            padding-top: 5vh !important;
          }
          
          /* Position the card near the top */
          wui-card[data-testid="w3m-modal-card"] {
            max-height: 70vh !important;
            height: auto !important;
            width: 90vw !important;
            max-width: 90vw !important;
            margin-top: 0 !important;
            position: relative !important;
            transform: none !important;
          }
          
          /* Ensure router fits inside */
          w3m-router {
            max-height: 65vh !important;
            overflow-y: auto !important;
          }
        `;
        modalElement.shadowRoot.appendChild(style);
        console.log("Modal positioning styles injected");
        return true;
      }
      return false;
    };

    // Try immediately
    if (!injectModalStyles()) {
      // Watch for modal to be added to DOM
      const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          if (mutation.addedNodes.length > 0) {
            if (injectModalStyles()) {
              observer.disconnect();
              break;
            }
          }
        }
      });

      observer.observe(document.body, { childList: true, subtree: true });
    }
  }, []);
}

interface Web3ProviderProps {
  children: ReactNode;
}

export default function Web3Provider({ children }: Web3ProviderProps) {
  // Trigger modal positioning styles
  useModalPositioning();

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
