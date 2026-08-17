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
  allNetworks,
  projectId,
  polkadotAssetHub,
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
  const appKit = createAppKit({
    adapters: [wagmiAdapter],
    projectId,
    networks: allNetworks as any,
    defaultNetwork: polkadotAssetHub,
    metadata,
    universalProviderConfigOverride: {
      methods: {
        polkadot: ["polkadot_signTransaction", "polkadot_signMessage"],
      },
    },
    features: {
      analytics: true,
      email: false,
      socials: [],
    },
    themeMode: "dark",
    themeVariables: {
      "--w3m-accent": "#e91e63",
      "--w3m-border-radius-master": "8px",
    },
  });
  // Store AppKit globally for wallet selector to access
  (window as any).__appKit = appKit;
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
          /* Override the overlay container — anchor to top so the QR card
             isn't pushed below the fold */
          wui-flex[data-testid="w3m-modal-overlay"] {
            align-items: flex-start !important;
            justify-content: center !important;
            padding: 2vh 20px 20px 20px !important;
          }
          
          /* Position the card and allow full height */
          wui-card[data-testid="w3m-modal-card"] {
            max-height: 92vh !important;
            height: auto !important;
            min-height: auto !important;
            width: 90vw !important;
            max-width: 420px !important;
            margin-top: 0 !important;
            position: relative !important;
            transform: none !important;
          }
          
          /* Ensure router fits inside */
          w3m-router {
            max-height: 85vh !important;
            overflow-y: auto !important;
          }
          
          /* Stretch QR code container */
          w3m-qrcode {
            width: 100% !important;
          }
          
          w3m-qrcode img {
            width: 100% !important;
            height: auto !important;
            max-width: 280px !important;
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
