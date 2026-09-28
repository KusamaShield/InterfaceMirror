/*
 * Copyright 2025 Kusama Shield Developers on behalf of the Kusama DAO, see LICENSE in main folder.
 */

import { ethers } from "ethers";

const SHIELD_CONTRACT_ADDRESS = "0x..."; // Replace with actual shield contract address

// ABI for the shield contract's withdraw function
const SHIELD_CONTRACT_ABI = [
  "function withdraw(uint256[2] a, uint256[2][2] b, uint256[2] c, bytes32 expectedCommitment, bytes32 nullifier, uint256 amount, address recipient) external",
  "function withdrawSimple(uint256[2] calldata a, uint256[2][2] calldata b, uint256[2] calldata c, bytes32 expectedCommitment, bytes32 nullifier, uint256 amount, address recipient) external",
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
  throw new Error(
    "unshieldTokens is deprecated (Moonbeam network support has been removed)",
  );
}
