/*
 * Copyright 2025 Kusama Shield Developers on behalf of the Kusama DAO, see LICENSE in main folder.
 */

import React from "react";
import { useAppKit, useAppKitAccount, useAppKitNetwork } from "@reown/appkit/react";
import { useDisconnect } from "wagmi";

interface EvmWalletConnectionProps {
  onAddressChange?: (address: string | undefined) => void;
}

export const EvmWalletConnection: React.FC<EvmWalletConnectionProps> = ({
  onAddressChange,
}) => {
  const { open } = useAppKit();
  const { address, isConnected } = useAppKitAccount();
  const { caipNetwork } = useAppKitNetwork();
  const { disconnect } = useDisconnect();

  // Notify parent of address changes
  React.useEffect(() => {
    onAddressChange?.(address);
  }, [address, onAddressChange]);

  const formatAddress = (addr: string) => {
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  if (!isConnected) {
    return (
      <div className="space-y-4">
        <button
          onClick={() => open()}
          className="w-full bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700 text-white font-semibold py-3 px-6 rounded-lg transition-all duration-300 transform hover:scale-105"
        >
          Connect EVM Wallet
        </button>
        <div className="text-center text-sm text-purple-300">
          Supports MetaMask, WalletConnect, Coinbase & 300+ wallets
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white/5 rounded-lg p-4 border border-white/10">
      <div className="flex justify-between items-start">
        <div>
          <div className="text-sm font-medium text-purple-200">EVM Wallet Connected</div>
          <div className="mt-2">
            <div className="text-white font-medium font-mono">
              {address ? formatAddress(address) : "Unknown"}
            </div>
            {caipNetwork && (
              <div className="text-xs text-purple-400 mt-1">
                {caipNetwork.name}
              </div>
            )}
          </div>
        </div>
        <div className="flex space-x-2">
          <button
            onClick={() => open({ view: "Networks" })}
            className="border border-white/20 text-purple-200 hover:bg-white/10 hover:text-white px-3 py-1 rounded text-sm"
          >
            Switch Network
          </button>
          <button
            onClick={() => disconnect()}
            className="border border-white/20 text-purple-200 hover:bg-white/10 hover:text-white px-3 py-1 rounded text-sm"
          >
            Disconnect
          </button>
        </div>
      </div>
    </div>
  );
};

// Hook to get connected EVM address for use elsewhere in the app
export function useEvmAddress() {
  const { address, isConnected } = useAppKitAccount();
  return { address, isConnected };
}

// Hook to get the current chain/network
export function useEvmNetwork() {
  const { caipNetwork, switchNetwork } = useAppKitNetwork();
  return { network: caipNetwork, switchNetwork };
}

export default EvmWalletConnection;
