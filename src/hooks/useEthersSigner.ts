/*
 * Copyright 2025 Kusama Shield Developers on behalf of the Kusama DAO, see LICENSE in main folder.
 */

import { useMemo } from "react";
import { useWalletClient } from "wagmi";
import { ethers } from "ethers";
import type { WalletClient } from "viem";

/**
 * Converts a viem WalletClient to an ethers.js Signer
 * This allows using wagmi-connected wallets (MetaMask, WalletConnect, etc.)
 * with ethers.js contract interactions
 */
function walletClientToSigner(walletClient: WalletClient): ethers.Signer {
  const { account, chain, transport } = walletClient;

  if (!account || !chain) {
    throw new Error("Wallet not connected");
  }

  const network = {
    chainId: chain.id,
    name: chain.name,
    ensAddress: chain.contracts?.ensRegistry?.address,
  };

  // Create an ethers provider from the transport
  const provider = new ethers.BrowserProvider(transport, network);

  // Create a signer that uses the wallet client for signing
  const signer = new ethers.JsonRpcSigner(provider, account.address);

  return signer;
}

/**
 * Hook to get an ethers.js Signer from the currently connected wagmi wallet
 * Works with MetaMask, WalletConnect, Coinbase Wallet, etc.
 */
export function useEthersSigner() {
  const { data: walletClient } = useWalletClient();

  const signer = useMemo(() => {
    if (!walletClient) return null;
    try {
      return walletClientToSigner(walletClient);
    } catch (e) {
      console.error("Failed to create ethers signer:", e);
      return null;
    }
  }, [walletClient]);

  return signer;
}

/**
 * Hook to get an ethers.js Provider from the currently connected wagmi wallet
 */
export function useEthersProvider() {
  const { data: walletClient } = useWalletClient();

  const provider = useMemo(() => {
    if (!walletClient) return null;
    const { chain, transport } = walletClient;
    if (!chain) return null;

    const network = {
      chainId: chain.id,
      name: chain.name,
      ensAddress: chain.contracts?.ensRegistry?.address,
    };

    return new ethers.BrowserProvider(transport, network);
  }, [walletClient]);

  return provider;
}
