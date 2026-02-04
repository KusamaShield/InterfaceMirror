/*
 * Copyright 2025 Kusama Shield Developers on behalf of the Kusama DAO, see LICENSE in main folder.
 */

import { ethers } from "ethers";

const MOONBEAM_TESTNET_RPC = "wss://moonbase-alpha.public.blastapi.io";
const SHIELD_CONTRACT_ADDRESS = "0x..."; // Replace with actual shield contract address

// ABI for the shield contract's withdraw function
const SHIELD_CONTRACT_ABI = [
  "function withdraw(uint256[2] a, uint256[2][2] b, uint256[2] c, bytes32 expectedCommitment, bytes32 nullifier, uint256 amount, address recipient) external",
  "function withdrawSimple(uint256[2] calldata a, uint256[2][2] calldata b, uint256[2] calldata c, bytes32 expectedCommitment, bytes32 nullifier, uint256 amount, address recipient) external"
];

export const fetchKzgParams = async (url: string) => {
  //if (k < 11 || k > 19)
  // throw new Error("Invalid parameter 'k'. It must be between 11 and 19, inclusive.")

  const response = await fetch(url);
  const bytes = await response.arrayBuffer();

  const params = new Uint8Array(bytes);
  return params;
};

export async function unshieldTokens(
  evmAddress: string,
  secret: string,
): Promise<ethers.TransactionResponse> {
  try {
    // Connect to Moonbeam testnet
    const provider = new ethers.WebSocketProvider(MOONBEAM_TESTNET_RPC);

    // Get the signer from the connected wallet
    const signer = await provider.getSigner();

    // Create contract instance
    const shieldContract = new ethers.Contract(
      SHIELD_CONTRACT_ADDRESS,
      SHIELD_CONTRACT_ABI,
      signer,
    );

    // Call the withdraw function
    const tx = await shieldContract.withdraw(secret, {
      from: evmAddress,
    });

    // Wait for the transaction to be mined
    await tx.wait();

    return tx;
  } catch (error) {
    throw new Error(
      `Unshield transaction failed: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}
