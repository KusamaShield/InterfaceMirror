/*
 * Copyright 2025-2026 Kusama Shield Developers on behalf of the Kusama DAO, see LICENSE in main folder.
 */

import { ethers } from "ethers";

async function getBalanceWithEthers(rpcurl: string, address: string) {
  // Connect to provider (Infura, Alchemy, etc.)
  const provider = new ethers.JsonRpcProvider(rpcurl);

  // Get balance (returns BigInt in wei)
  const balanceWei = await provider.getBalance(address);

  // Convert to ETH
  const balanceEth = ethers.formatEther(balanceWei);

  return { wei: balanceWei.toString(), eth: balanceEth };
}

async function main() {
  console.log(`main`);
  const output = await getBalanceWithEthers(
    "https://eth-asset-hub-kusama.dotters.network",
    "0xDe734DB4aB4A8D9AD59D69737e402F54A84d4C17",
  );
  console.log(`got output:`, output);
  console.log(`EOL`);
}

main().finally();
