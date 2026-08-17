/*
 * Copyright 2025 Kusama Shield Developers on behalf of the Kusama DAO, see LICENSE in main folder.
 */

import React, { useState, useRef, useEffect } from "react";
import { useAppKit, useAppKitAccount } from "@reown/appkit/react";
import { useDisconnect, useWalletClient } from "wagmi";
import { toast } from "react-toastify";
import { WalletSelect } from "@talismn/connect-components";
import {
  TalismanWallet,
  NovaWallet,
  SubWallet,
  MantaWallet,
  PolkaGate,
  FearlessWallet,
  EnkryptWallet,
  PolkadotjsWallet,
  AlephZeroWallet,
} from "@talismn/connect-wallets";
import { ethers } from "ethers";
import {
  getAccountsFromProvider,
  hasPolkadotNamespace,
  getPolkadotAddress,
} from "../hooks/useWalletConnectPolkadot";

// Custom provider wrapper that works with wagmi's wallet client
class WagmiEthersProvider {
  private walletClient: any;
  private _provider: ethers.BrowserProvider | null = null;

  constructor(walletClient: any) {
    this.walletClient = walletClient;
  }

  async getSigner(): Promise<ethers.Signer> {
    const { account, chain, transport } = this.walletClient;
    if (!account || !chain) throw new Error("Wallet not connected");
    const network = { chainId: chain.id, name: chain.name };
    const provider = new ethers.BrowserProvider(transport, network);
    return new ethers.JsonRpcSigner(provider, account.address);
  }

  async getNetwork() {
    return {
      chainId: BigInt(this.walletClient.chain?.id || 1),
      name: this.walletClient.chain?.name || "unknown",
    };
  }
}

interface UnifiedWalletSelectorProps {
  isWalletConnected: boolean;
  evmAddress: string | null;
  selectedNetwork: string;
  onAccountSelected: (account: any) => void;
  onWalletSelected: (wallet: any) => void;
  setEvmAddress: (address: string) => void;
  setSelectedWalletEVM: (provider: any) => void;
  setIsWalletConnected: (connected: boolean) => void;
  setPolkadotAddress?: (address: string | null) => void;
}

export const UnifiedWalletSelector: React.FC<UnifiedWalletSelectorProps> = ({
  isWalletConnected,
  evmAddress,
  selectedNetwork,
  onAccountSelected,
  onWalletSelected,
  setEvmAddress,
  setSelectedWalletEVM,
  setIsWalletConnected,
  setPolkadotAddress,
}) => {
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { open: openAppKit } = useAppKit();
  const { address: appKitAddress, isConnected: appKitConnected } = useAppKitAccount();
  const { disconnect: disconnectAppKit } = useDisconnect();
  const { data: walletClient } = useWalletClient();

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Sync AppKit connection with app state - use walletClient for proper WalletConnect support
  useEffect(() => {
    if (appKitConnected && appKitAddress && walletClient) {
      setEvmAddress(appKitAddress);
      setIsWalletConnected(true);
      // Use WagmiEthersProvider wrapper which works with both MetaMask and WalletConnect
      const wagmiProvider = new WagmiEthersProvider(walletClient);
      setSelectedWalletEVM(wagmiProvider);
      setShowDropdown(false);

      // Check for polkadot namespace in WalletConnect session (for Nova/Substrate wallets)
      const checkPolkadot = async () => {
        try {
          const appKit = (window as any).__appKit;
          if (!appKit) return;
          const provider = await appKit.getUniversalProvider();
          if (provider && hasPolkadotNamespace(provider)) {
            const addr = getPolkadotAddress(provider);
            if (addr && setPolkadotAddress) {
              console.log("Detected polkadot namespace wallet:", addr);
              setPolkadotAddress(addr);
            }
          }
        } catch (e) {
          // Silently ignore - polkadot namespace not available
        }
      };
      checkPolkadot();
    }
  }, [appKitConnected, appKitAddress, walletClient]);

  const handleEvmWalletsClick = () => {
    setShowDropdown(false);
    openAppKit();
  };

  // On Polkadot, Nova Wallet can only connect via WalletConnect (QR code),
  // not the polkadot-js browser extension — show a popup guiding the user.
  const handleNovaInfo = () => {
    toast.info(
      <div style={{ fontSize: "12px", lineHeight: "1.4" }}>
        <strong>Nova Wallet on Polkadot</strong>
        <br />
        Please select <strong>EVM Wallets → WalletConnect</strong> and scan the
        QR code with your Nova mobile app.
      </div>,
      {
        position: "top-right",
        autoClose: 15000,
        theme: "dark",
      },
    );
  };

  const formatAddress = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`;

  // Connected state - show address with disconnect option
  if (isWalletConnected && evmAddress) {
    return (
      <div className="wallet-selector-container" ref={dropdownRef}>
        <button
          className="connect-button connected"
          onClick={() => setShowDropdown(!showDropdown)}
        >
          Connected: {formatAddress(evmAddress)}
        </button>
        {showDropdown && (
          <div className="wallet-dropdown">
            <div
              className="wallet-option disconnect"
              onClick={() => {
                disconnectAppKit();
                setIsWalletConnected(false);
                setEvmAddress("");
                setSelectedWalletEVM(null);
                setShowDropdown(false);
                if (setPolkadotAddress) setPolkadotAddress(null);
              }}
            >
              Disconnect Wallet
            </div>
          </div>
        )}
      </div>
    );
  }

  // Not connected - show wallet options
  return (
    <div className="wallet-selector-container" ref={dropdownRef}>
      <button
        className="connect-button"
        onClick={() => setShowDropdown(!showDropdown)}
      >
        Connect Wallet
      </button>
      {showDropdown && (
        <div className="wallet-dropdown">
          <div className="wallet-section-header">Polkadot Wallets</div>
          {selectedNetwork === "polkadot" && (
            <div
              className="wallet-option"
              onClick={handleNovaInfo}
              style={{ border: "1px solid rgba(233, 30, 99, 0.35)" }}
            >
              <span>
                Nova Wallet{" "}
                <span style={{ fontSize: "10px", opacity: 0.5 }}>
                  (use WalletConnect)
                </span>
              </span>
              <span className="wallet-arrow">→</span>
            </div>
          )}
          <WalletSelect
            dappName="KusamaShield"
            showAccountsList
            walletList={[
              new TalismanWallet(),
              ...(selectedNetwork === "polkadot" ? [] : [new NovaWallet()]),
              new SubWallet(),
              new MantaWallet(),
              new PolkaGate(),
              new FearlessWallet(),
              new EnkryptWallet(),
              new PolkadotjsWallet(),
              new AlephZeroWallet(),
            ]}
            triggerComponent={
              <div className="wallet-option">
                <span>
                  {selectedNetwork === "polkadot"
                    ? "Talisman, SubWallet..."
                    : "Talisman, SubWallet, Nova..."}
                </span>
                <span className="wallet-arrow">→</span>
              </div>
            }
            onAccountSelected={(account) => {
              onAccountSelected(account);
              setShowDropdown(false);
            }}
            onWalletSelected={onWalletSelected}
          />

          <div className="wallet-section-header" style={{ marginTop: "12px" }}>
            EVM Wallets
          </div>
          <div className="wallet-option" onClick={handleEvmWalletsClick}>
            <span>MetaMask, WalletConnect...</span>
            <span className="wallet-arrow">→</span>
          </div>
        </div>
      )}
      <style>{`
        .wallet-selector-container {
          position: relative;
          display: inline-block;
        }
        .wallet-dropdown {
          position: absolute;
          top: 100%;
          left: 0;
          right: 0;
          min-width: 280px;
          background: rgba(30, 20, 50, 0.98);
          border: 1px solid rgba(255, 255, 255, 0.15);
          border-radius: 12px;
          padding: 8px;
          margin-top: 8px;
          z-index: 1000;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
        }
        .wallet-section-header {
          font-size: 11px;
          text-transform: uppercase;
          color: rgba(255, 255, 255, 0.5);
          padding: 8px 12px 4px;
          letter-spacing: 0.5px;
        }
        .wallet-option {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px 16px;
          border-radius: 8px;
          cursor: pointer;
          color: white;
          font-size: 14px;
          transition: background 0.2s;
        }
        .wallet-option:hover {
          background: rgba(255, 255, 255, 0.1);
        }
        .wallet-option.disconnect {
          color: #ff6b6b;
          justify-content: center;
        }
        .wallet-option.disconnect:hover {
          background: rgba(255, 107, 107, 0.15);
        }
        .wallet-arrow {
          opacity: 0.5;
        }
      `}</style>
    </div>
  );
};

export default UnifiedWalletSelector;
