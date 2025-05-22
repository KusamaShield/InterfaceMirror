import { ethers } from 'ethers'
import { toast } from 'react-toastify'

const MOONBEAM_TESTNET_RPC = 'wss://moonbase-alpha.public.blastapi.io'
const SHIELD_CONTRACT_ADDRESS = '0xDEB209D0a993A4ce495FB668698c08Eb5ca1F33d' // Replace with actual shield contract address
const fakeerc20asset = '0x74f65B42E6BcE24285A557cd3f19a84dF132eAC1'


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
    // Connect to Moonbeam testnet
//    const provider = new ethers.WebSocketProvider(MOONBEAM_TESTNET_RPC)
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
  try {
    // Connect to Moonbeam testnet
    const provider = new ethers.WebSocketProvider(MOONBEAM_TESTNET_RPC)

    // Get the signer from the connected wallet
    const signer = await provider.getSigner()

    // Create contract instance
    const shieldContract = new ethers.Contract(
      SHIELD_CONTRACT_ADDRESS,
      shielderAbi,
      signer,
    )

    // Convert amount to wei
    const amountInWei = ethers.parseEther(amount)


    // Call the deposit function
    const tx = await shieldContract.deposit(amountInWei, secret, {
      from: evmAddress,
    })

    // Wait for the transaction to be mined
    await tx.wait()

    return tx
  } catch (error) {
    throw new Error(
      `Shield transaction failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    )
  }
}
