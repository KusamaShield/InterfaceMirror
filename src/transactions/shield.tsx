/*
 * Copyright 2025 Kusama Shield Developers on behalf of the Kusama DAO, see LICENSE in main folder.
 */

import { ethers } from 'ethers'
import { toast } from 'react-toastify'

const SHIELD_CONTRACT_ADDRESS = '0xDEB209D0a993A4ce495FB668698c08Eb5ca1F33d' // Replace with actual shield contract address
const fakeerc20asset = '0x2a9173fbad551e719ff442b22d7064cbb4fef7a7';//'0x74f65B42E6BcE24285A557cd3f19a84dF132eAC1'


const erc20Abi = [
  "function approve(address spender, uint256 amount) external returns (bool)"
];

const shielderAbi = [
  "function deposit(address,uint256,bytes32) payable", 
   "function withdraw(bytes,address,uint256,address,uint256)",
   "function withdraw2(bytes,address,uint256,uint256[])",
   "function withdraw22(bytes, address, uint256[])"
]

/*
    function withdraw2(bytes calldata proof, address asset, uint256 amount, uint256[] calldata instances)
*/


export default {SHIELD_CONTRACT_ADDRESS, fakeerc20asset, erc20Abi, shielderAbi};

export async function testo(
  inputen: string,
) {
  console.log(`testo start`);
  const s = "not set";
  // const s = await generate_commitment(inputen);
  console.log(`testo finished`);
  return s;
}


export async function fakeshield(
  evmAddress: string,
  amount: string,
  secret: string,
): Promise<boolean> {
  try {
    const linko =   "";

 
    // Get the signer from the connected wallet
  //  showToast('Shielding tokens...', 'success')
  toast('🐦 Tokens shielded!', {
    position: "top-right",
    autoClose: 7000,
    hideProgressBar: false,
    closeOnClick: false,
    pauseOnHover: true,
    draggable: true,
    progress: undefined,
    theme: "dark",
    });
    return true
  } catch (error) {
    const errorMessage = `Shield transaction failed: ${error instanceof Error ? error.message : 'Unknown error'}`
  //  showToast(errorMessage, 'error')
    throw new Error(errorMessage)
  }
}

export async function shieldTokens(
  evmAddress: string,
  amount: string,
  secret: string,
): Promise<ethers.TransactionResponse> {
  throw new Error(
    "shieldTokens is deprecated (Moonbeam network support has been removed)",
  );
}
