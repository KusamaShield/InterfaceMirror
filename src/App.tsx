import "./App.css";
import { useState, useEffect } from "react";
import { WalletSelect } from "@talismn/connect-components";
import { shieldTokens, fakeshield } from "./transactions/shield";
import SHIELD_CONTRACT_ADDRESS from "./transactions/shield";
import fakeerc20asset from "./transactions/shield";
import { make_deposit_tx, gen_tx_no_sig } from "./transactions/txgen";
import { unshieldTokens, fetchKzgParams } from "./transactions/unshield";
import { generate_tx2, xcm_chains } from "./transactions/xcm";
import { westend_pool, generateCommitment } from "./transactions/zkg16";
import { ToastContainer, toast } from "react-toastify";
import { ApiPromise, WsProvider } from "@polkadot/api";
import { Transaction, parseEther, parseUnits } from "ethers";
//import init, { generate_commitment, test_console, test_proofo, generate_proof_data } from '../pkg/generate_zk_wasm'; // adjust path as needed

import {
  AlephZeroWallet,
  EnkryptWallet,
  FearlessWallet,
  MantaWallet,
  NovaWallet,
  PolkadotjsWallet,
  PolkaGate,
  SubWallet,
  TalismanWallet,
} from "@talismn/connect-wallets";
import { ethers, Network } from "ethers";

// Add TypeScript declaration for window.ethereum
declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string }) => Promise<string[]>;
    };
  }
}

// Networks: name, endpoint, native asset
const NETWORKS = {
  moonbase: {
    name: "Moonbase Testnet",
    wsEndpoint: "wss://moonbase-alpha.public.blastapi.io",
    rpcEndpoint: "https://moonbase.public.curie.radiumblock.co/http",
    asset: "DEV",
    faucet: "https://faucet.moonbeam.network/",
    chain_id: 1287,
    block_explorer: "https://moonbase.moonscan.io",
    docs: "https://kusamashield.codeberg.page/networks/moonbase.html",
  },
  shibuya: {
    name: "Shibuya (parachain testnet)",
    rpcEndpoint: "https://evm.shibuya.astar.network",
    asset: "SBY",
    chain_id: 81,
    faucet: "https://portal.astar.network/shibuya-testnet/assets",
    block_explorer: "https://shibuya.subscan.io/",
    vk_address: "0x66021DF8Ce2b63f99ea9C501497Ce70ec49f5724",
    shield_address: "",
  },
  westend_assethub: {
    name: "Westend Assethub",
    wsEndpoint: "wss://westend-asset-hub-rpc.polkadot.io",
    rpcEndpoint: "https://westend-asset-hub-eth-rpc.polkadot.io",
    asset: "WND",
    chain_id: 420420421,
    block_explorer: "https://blockscout-asset-hub.parity-chains-scw.parity.io",
    faucet: "https://faucet.polkadot.io/westend?parachain=1000",
    docs: "https://kusamashield.codeberg.page/networks/WestendAH.html",
  },
  paseo_assethub: {
    name: "Paseo hub",
    asset: "PAS",
    chain_id: 420420422,
    rpcEndpoint: "http://eth-pas-hub.laissez-faire.trade:8545", //"https://testnet-passet-hub-eth-rpc.polkadot.io",
    faucet: "https://faucet.polkadot.io/?parachain=1111",
    block_explorer: "https://blockscout-passet-hub.parity-testnet.parity.io/",
    vk_address: "0x60cc34b6eaf6d3d13e8d34ec25c6cee15b7fdefc",
    shield_address: "0xde734db4ab4a8d9ad59d69737e402f54a84d4c17",
    docs: "https://kusamashield.codeberg.page/networks/PaseoAH.html",
  },
};

const MOONBASE_CHAIN_ID = 1287;

const DAPP_NAME = "KSMSHIELD";
const MOONBASE_RPC_URL = NETWORKS.moonbase.wsEndpoint;
const MOONBASE_CURRENCY = {
  name: "DEV",
  symbol: "DEV",
  decimals: 18,
};

export function App() {
  const [isWalletConnected, setIsWalletConnected] = useState(false);
  const [selectedWallet, setSelectedWallet] = useState<any>(null); // Consider using proper type instead of any
  const [selectedWalletEVM, setSelectedWalletEVM] = useState<any>(null);
  const [evmAddress, setEvmAddress] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"shield" | "unshield" | "bridge">(
    "shield",
  );
  const [secret, setSecret] = useState("");
  const [amount, setAmount] = useState("");
  const [selectedToken, setSelectedToken] = useState<any>(null); //('KSM')
  const [selectedNetwork, setSelectedNetwork] =
    useState<keyof typeof NETWORKS>("moonbase");
  const [fromNetwork, setfromNetwork] = useState<any>(null);
  const [toNetwork, settoNetwork] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [showTerms, setShowTerms] = useState(false);

  const [isWasmLoaded, setIsWasmLoaded] = useState(false);
  const [ProofWorker, setProofWorker] = useState<any>(null);
  const [isGeneratingSecret, setIsGeneratingSecret] = useState(false);
  const [generatedSecret, setGeneratedSecret] = useState<string>("");

  useEffect(() => {
    if (!isWasmLoaded) {
      const loadWasm = async () => {
        try {
          //    console.log(`loading wasmm`);
          const wasmPackage = await import("../pkg/generate_zk_wasm");
          await wasmPackage.default();
          await wasmPackage.init();
          //        console.log(`workerApi ok`);
          //     console.log(`workerApi calling init`);
          //   console.log(`set worker!`);
          // Store the worker functions in state or ref for later use
          setProofWorker(wasmPackage);
          setNetwork("paseo_assethub");
          setIsWasmLoaded(true);
        } catch (err) {
          setError("Failed to load WASM module");
          console.error("WASM Error:", err);
        }
      };

      loadWasm();
    }
  }, []);

  const handleWalletSelected = async (wallet: any) => {
    try {
      console.log(`handle wallet selected called`);
      console.log(`gotten wal: `, wallet);
      //await wallet.enable("KUSAMA SHIELD");
      setSelectedWallet(wallet);
      await wallet.enable(DAPP_NAME);
      const unsubscribe = await wallet.subscribeAccounts(
        (accounts: WalletAccount[]) => {
          console.log(`accounts:`, accounts);
          // Save accounts...
          // Also save the selected wallet name as well...
        },
      );
      //     window.talismanEth.enable()
      //     const wl = (window as any);
      //    console.log(`try it: `, wl);
      const talismanEth = (window as any).talismanEth;
      const provider3 = new ethers.BrowserProvider(talismanEth);
      console.log(`selected wallet:`, talismanEth.selectedAddress);
      if (!talismanEth) {
        throw new Error("Talisman Ethereum provider not detected");
      }
      console.log("got talisman eth");

      //    const currentChainId = await talismanEth.request({
      //        method: "eth_chainId",
      //});
      //      console.log(`current chain is: `, currentChainId);

      setSelectedWalletEVM(provider3);
      console.log(`provider3 ok`);
      //   await wallet.enable("KSMSHIELD");

      const accounts = await wallet.getAccounts();
      const substrateAddress = accounts[0]?.address || null;
      console.log(`substrate address: `, substrateAddress);
      if (accounts.length > 0) {
        const address = accounts[0].address;
        setEvmAddress(address);
        setIsWalletConnected(true);
      } else {
        throw new Error("No accounts found");
      }
    } catch (err) {
      setError("Failed to connect wallet");
    }
  };

  const generateRandomSecret = () => {
    const bits = 128;
    const bytes = bits / 8;
    const randomBuffer = new Uint8Array(bytes);
    window.crypto.getRandomValues(randomBuffer);

    // Convert to hex string then to BigInt
    const hexString = Array.from(randomBuffer)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    const secretStr = BigInt("0x" + hexString).toString();

    setSecret(secretStr);
    setGeneratedSecret(secretStr);
    return secretStr;
  };

  function uint8ArrayToHex(uint8Array: Uint8Array): string {
    return Array.from(uint8Array)
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  }

  const handleShield = async () => {
    if (!isWalletConnected || !amount || !selectedToken || !selectedWallet) {
      toast(`❌ ERROR: Connect wallet and select token`, {
        position: "top-right",
        autoClose: 6000,
        hideProgressBar: false,
        closeOnClick: false,
        pauseOnHover: true,
        draggable: true,
        progress: undefined,
        theme: "dark",
      });
      return;
    }

    setIsGeneratingSecret(true);
    const generatedSecret = generateRandomSecret();

    const ethwall = selectedWalletEVM;
    const ETHsigner = await ethwall.getSigner();

    setIsLoading(true);
    setError("");

    try {
      console.log(`handleshield 1`);
      console.log(
        isWalletConnected,
        amount,
        selectedToken,
        generatedSecret,
        selectedWallet,
      );
      if (!isWalletConnected || !amount || !selectedToken || !selectedWallet)
        return;

      console.log(`sign sign`);

      const accounts = await selectedWallet.getAccounts();
      const account = accounts[0];
      console.log(`account: `, account.address);
      const secret = generatedSecret;
      //      const txdata = await gen_tx_no_sig(Number(amount), fakeerc20asset, account.address);
      //      console.log(`got tx data: `, txdata);
      console.log(`signer caller`);
      const signer = selectedWallet.signer;
      console.log(`signo`);

      console.log(`signed tx`);
      console.log(`westend pool:`, westend_pool);
      var shieldedContract;
      if (selectedNetwork == "moonbase") {
        shieldedContract = new ethers.Contract(
          SHIELD_CONTRACT_ADDRESS.SHIELD_CONTRACT_ADDRESS, // Using the fake ERC-20 address from your constants
          SHIELD_CONTRACT_ADDRESS.shielderAbi,
          ETHsigner,
        );
      } else if (selectedNetwork == "westend_assethub") {
        console.log(`westend shielded contract`);
        shieldedContract = new ethers.Contract(
          westend_pool, // Using the fake ERC-20 address from your constants
          ["function deposit(address,uint256,bytes32) payable"],
          ETHsigner,
        );
      } else if (selectedNetwork == "paseo_assethub") {
        console.log(
          `paseo assethub: `,
          NETWORKS["paseo_assethub"].shield_address,
        );

        shieldedContract = new ethers.Contract(
          NETWORKS["paseo_assethub"].shield_address,
          ["function deposit(address,uint256,bytes32) payable"],
          ETHsigner,
        );
      } else {
        throw new Error(
          "Only Moonbase and Westend Assethub is currently supported",
        );
      }

      // move to seperate functions
      if (NETWORKS[selectedNetwork].asset == selectedToken) {
        console.log(`native token!`);
      } else {
        // console.log(`token set to: `, )
        // console.log(`network token: ${}`);
        // Create contract instance
        const tokenContract = new ethers.Contract(
          fakeerc20asset.fakeerc20asset, // Using the fake ERC-20 address from your constants
          fakeerc20asset.erc20Abi,
          ETHsigner,
        );

        toast(`Step 1 out of 2, approving token for Shielding`, {
          position: "top-right",
          autoClose: 5000,
          hideProgressBar: false,
          closeOnClick: false,
          pauseOnHover: true,
          draggable: true,
          progress: undefined,
          theme: "dark",
        });

        const txResponse = await tokenContract.approve(
          SHIELD_CONTRACT_ADDRESS.SHIELD_CONTRACT_ADDRESS,
          ethers.parseEther(amount), // should get the decimals, but for m1 should be okay
        );

        // const txResponse = await ETHsigner.sendTransaction(transaction66);
        // console.log('Transaction hash:', txResponse.hash);

        toast(`Transaction hash: ${txResponse.hash}`, {
          position: "top-right",
          autoClose: 4000,
          hideProgressBar: false,
          closeOnClick: false,
          pauseOnHover: true,
          draggable: true,
          progress: undefined,
          theme: "dark",
        });
        // 8. Wait for confirmation
        const receipt = await txResponse.wait();

        toast(`Transaction confirmed in block: ${receipt.blockNumber}`, {
          position: "top-right",
          autoClose: 6000,
          hideProgressBar: false,
          closeOnClick: false,
          pauseOnHover: true,
          draggable: true,
          progress: undefined,
          theme: "dark",
        });

        console.log(`serialize`);
      }

      toast(`Shielding Tokens`, {
        position: "top-right",
        autoClose: 5000,
        hideProgressBar: false,
        closeOnClick: false,
        pauseOnHover: true,
        draggable: true,
        progress: undefined,
        theme: "dark",
      });
      let x;
      if (selectedNetwork == "westend_assethub") {
        x = ProofWorker.generate_commitment(secret); //await generateCommitment(secret);
      } else {
        x = ProofWorker.generate_commitment(secret);
      }

      //  const x = "0x"+ generate_commitment("12345");
      console.log(`making tx with commitment: `, x);
      var txResponse2;
      if (NETWORKS[selectedNetwork].asset == selectedToken) {
        var sendamount;
        if (selectedNetwork == "westend_assethub") {
          sendamount = ethers.parseUnits(amount, 18);
          console.log(`westend assethub`);
        } else if (selectedNetwork == "paseo_assethub") {
          console.log(`paseo assethub amount`);
          sendamount = ethers.parseUnits(amount, 18);
        } else {
          sendamount = ethers.parseEther(amount);
        }
        /*
        try {
          const gasEstimate = await shieldedContract.deposit.estimateGas(
            ethers.ZeroAddress,
            "1000000000000000000",
            x,
            { value: "1000000000000000000" }
          );
          console.log("Gas estimate:", gasEstimate);
        } catch (e) {
          console.error("Estimation failed:", e);
        }

*/
        /*
        console.log(`ZeroAddress: `, ethers.ZeroAddress);
        console.log(`send amount: `, sendamount);
        console.log(`x: `, x);
            const talismanEth = (window as any).talismanEth;
      const provider3 = new ethers.BrowserProvider(talismanEth);
         const ethwall = provider3;
    const passigner = await ethwall.getSigner();
const ABI66  = ["function deposit(address,uint256,bytes32) payable", 
           "function withdraw2(uint256[2],uint256[2][2],uint256[2],uint256[3],address,uint256,bytes32)",
          ];
        const contractpase = new ethers.Contract(
          "0xde734db4ab4a8d9ad59d69737e402f54a84d4c17",
          ABI66,//["function deposit(address,uint256,bytes32) payable"],
          ETHsigner,
        );
        console.log(`sending paseo deposit`);
        const myamount = ethers.parseUnits(amount, 18);
           console.log("Sending with params:", {
      token: ethers.ZeroAddress,
      amount: myamount.toString(),
      x,
      value: myamount.toString()
    });
        console.log(`x, myamount:`, x, myamount);
const paddedCommitment = ethers.zeroPadValue(x, 32);
        var gasEstimate;

        try {
  
           gasEstimate = await contractpase.deposit.estimateGas(
            ethers.ZeroAddress,
            1000000000000000000n,
            paddedCommitment, //x,  uint8ArrayToHex(ethers.randomBytes(32))
            { value: 1000000000000000000n }
          );
          console.log("Gas estimate:", gasEstimate);
        } catch (e) {
          console.error("Estimation failed:", e);
        }
*/
        /**/

        //console.log(`pol: `, pol);
        //const gasPrice = await provider3.getGasPrice();
        //console.log("Chain ID:", (await provider3.getNetwork()).chainId);
        //const xx = uint8ArrayToHex(ethers.randomBytes(32));
        //const xxx = ethers.hexlify(ethers.randomBytes(32));
        /* 
console.log(`paddedCommitment:`, paddedCommitment);
const txData = contractpase.interface.encodeFunctionData("deposit", [
  ethers.ZeroAddress,
  "1000000000000000000",
  paddedCommitment
]);
const iface = new ethers.Interface(["function deposit(address,uint256,bytes32)"]);
const txdatan = iface.encodeFunctionData("deposit", [ethers.ZeroAddress, "1000000000000000000", paddedCommitment]);
console.log(`react data:`, txdatan);

console.log("React TX Data:", {
  to: contractpase.target,
  value: "1000000000000000000",
  data: txData,
  gasLimit: "300000",
  chainId: NETWORKS.paseo_assethub.chain_id
});

const feeData = await provider3.getFeeData();
const rawTx = {
  to: "0xde734db4ab4a8d9ad59d69737e402f54a84d4c17",
  value: 1000000000000000000n,
    gasPrice: feeData.gasPrice,
  maxFeePerGas: feeData.maxFeePerGas,
  maxPriorityFeePerGas: feeData.maxPriorityFeePerGas,
 // nonce: await provider3.getTransactionCount("0x25A26A3cDb5c14D0F779888bB851F1293ec1d01D"),
  data: txdatan,
  chainId: 420420422,
 // type: "0x0"
};
console.log(`feeData:`, feeData);
const txHash = await (window as any).talismanEth.request({
      method: "eth_sendTransaction",
      params: [rawTx]
    });
    console.log("Successful TX hash:", txHash);

    */

        //const signedTx = await ETHsigner.signRaw(tx);
        //const receipt = await provider3.sendTransaction(signedTx);
        console.log(`x:`, x);
        /*
        const provider65 = new ethers.JsonRpcProvider(
      "http://eth-pas-hub.laissez-faire.trade:8545",
      {
        chainId: NETWORKS.paseo_assethub.chain_id,
        name: NETWORKS.paseo_assethub.name,
      }
    );


    const commitment = ethers.hexlify(ethers.randomBytes(32));

      const iface = new ethers.Interface([
      "function deposit(address,uint256,bytes32)"
    ]);
    const txData = iface.encodeFunctionData("deposit", [
      ethers.ZeroAddress,
      "1000000000000000000",  // Amount as string
      x
    ]);

    // 5. Format transaction parameters (convert BigInt to hex strings)
    const txParams = {
      from: "0x0Db2EF8BB34C9bb42f3E670354075E855d695d8C",
      to: "0xde734db4ab4a8d9ad59d69737e402f54a84d4c17",
      value: ethers.toQuantity(1000000000000000000n), // Convert to hex string
      data: txData,
      chainId: ethers.toQuantity(NETWORKS.paseo_assethub.chain_id),
      gasLimit: ethers.toQuantity(300000n), // Convert to hex string
      type: "0x0",
    };
     console.log("Formatted TX Params:", JSON.stringify(txParams, null, 2));

    // 6. Send transaction through Talisman
  const txHash = await (window as any).talismanEth.request({
      method: "eth_sendTransaction",
      params: [txParams]
    });
    console.log(`txhash: `, txHash);
     */
        console.log(`calling txResponse2`);
        txResponse2 = await shieldedContract.deposit(
          ethers.ZeroAddress,
          ethers.parseEther(amount), //1000000000000000000n,
          x,
          {
            value: ethers.parseEther(amount), //1000000000000000000n,
            //    maxFeePerGas: gasEstimate.
            //    gasPrice: ethers.parseUnits("1000", "wei"),
            //      type: 0,
            //      gasLimit: 16317587311833n,
          },
        );

        console.log(`deposit ok`);
      } else {
        console.log(`merp merp`);
        txResponse2 = await shieldedContract.deposit(
          SHIELD_CONTRACT_ADDRESS.fakeerc20asset,
          ethers.parseEther(amount),
          x,
        );
      }

      toast(`Transaction hash: ${txResponse2.hash}`, {
        position: "top-right",
        autoClose: 4000,
        hideProgressBar: false,
        closeOnClick: false,
        pauseOnHover: true,
        draggable: true,
        progress: undefined,
        theme: "dark",
      });
      // 8. Wait for confirmation
      const receipt2 = await txResponse2.wait();

      toast(`Transaction confirmed in block: ${receipt2.blockNumber}`, {
        position: "top-right",
        autoClose: 6000,
        hideProgressBar: false,
        closeOnClick: false,
        pauseOnHover: true,
        draggable: true,
        progress: undefined,
        theme: "dark",
      });

      if (!account) throw new Error("No accounts found");
      /*
      );
 */
      //    await fakeshield(amount, selectedToken, secret);
      setAmount("");
      setSecret("");
      toast("🐦 Tokens shielded!", {
        position: "top-right",
        autoClose: 7000,
        hideProgressBar: false,
        closeOnClick: false,
        pauseOnHover: true,
        draggable: true,
        progress: undefined,
        theme: "dark",
      });

      // Display the secret after successful shielding
      toast.info(`🔑 Save your secret for later withdrawal`, {
        position: "top-right",
        autoClose: 10000,
        hideProgressBar: false,
        closeOnClick: false,
        pauseOnHover: true,
        draggable: true,
        progress: undefined,
        theme: "dark",
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsLoading(false);
      setIsGeneratingSecret(false);
    }
  };

  const setNetwork = async (networkKey: keyof typeof NETWORKS) => {
    try {
      setIsLoading(true);
      setError(null);

      // Display loading toast
      toast.info(`Switching to ${NETWORKS[networkKey].name}...`, {
        position: "top-right",
        autoClose: 5000,
        hideProgressBar: false,
        closeOnClick: false,
        pauseOnHover: true,
        draggable: true,
        progress: undefined,
        theme: "dark",
      });

      // Check if Talisman Ethereum provider is available
      const talismanEth = (window as any).talismanEth;
      if (!talismanEth) {
        throw new Error("Talisman Ethereum provider not detected");
      }

      // Get current chain ID
      //     const currentChainId = await talismanEth.request({
      //       method: "eth_chainId",
      //    });
      // target chain id
      const targetChainId = NETWORKS[networkKey].chain_id
        ? `0x${NETWORKS[networkKey].chain_id?.toString(16)}`
        : undefined;
      if (targetChainId) {
        try {
          // Try to switch the network
          console.log(`wallet_switchEthereumChain: `, targetChainId);
          await talismanEth.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: targetChainId }],
          });
        } catch (switchError) {
          // This error code indicates that the chain has not been added to the wallet
          console.log(`switch error!`);
          if (switchError.code === 4902) {
            // Add the network to the wallet
            console.log(
              `4902 wallet_addEthereumChain:`,
              NETWORKS[networkKey].rpcEndpoint,
            );
            // send request to wallet to switch to the selected chain
            await talismanEth.request({
              method: "wallet_addEthereumChain",
              params: [
                {
                  nativeCurrency: {
                    name: NETWORKS[networkKey].asset,
                    symbol: NETWORKS[networkKey].asset,
                    decimals: 18,
                  },
                  chainId: targetChainId,
                  chainName: NETWORKS[networkKey].name,
                  rpcUrls: [NETWORKS[networkKey].rpcEndpoint],
                  blockExplorerUrls: NETWORKS[networkKey].block_explorer
                    ? [NETWORKS[networkKey].block_explorer]
                    : [],
                },
              ],
            });
          } else {
            throw switchError;
          }
        }
      }

      // Update the selected network in state
      setSelectedNetwork(networkKey);
      setSelectedToken(NETWORKS[networkKey].asset);
      // Display success toast
      toast.success(`Successfully switched to ${NETWORKS[networkKey].name}`, {
        position: "top-right",
        autoClose: 5000,
        hideProgressBar: false,
        closeOnClick: false,
        pauseOnHover: true,
        draggable: true,
        progress: undefined,
        theme: "dark",
      });
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to switch network";
      setError(errorMessage);

      // Display error toast
      toast.error(`Error switching network: ${errorMessage}`, {
        position: "top-right",
        autoClose: 5000,
        hideProgressBar: false,
        closeOnClick: false,
        pauseOnHover: true,
        draggable: true,
        progress: undefined,
        theme: "dark",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleUnshield = async () => {
    if (!isWalletConnected || !selectedToken || !secret) return;
    console.log(`handleUnshield beep boop`);
    setIsLoading(true);
    setError("");
    toast(`Unshielding tokens`, {
      position: "top-right",
      autoClose: 6000,
      hideProgressBar: false,
      closeOnClick: false,
      pauseOnHover: true,
      draggable: true,
      progress: undefined,
      theme: "dark",
    });

    try {
      const ethwall = selectedWalletEVM;
      const ETHsigner = await ethwall.getSigner();

      console.log(`fetching params`);
      toast(`🔓	 Generating proof locally...`, {
        position: "top-right",
        autoClose: 3000,
        hideProgressBar: false,
        closeOnClick: false,
        pauseOnHover: true,
        draggable: true,
        progress: undefined,
        theme: "dark",
      });
      const p = await fetchKzgParams(
        "http://localhost:5173/proofs/hermez-raw-8",
      ); //params8.bin
      console.log(`params fetched ok`);
      console.log("Params length:", p.length);

      console.log(`generating proof`);
      try {
        console.log(`generating proofo`);

        // if we manage to load the
        if (ProofWorker) {
          var proofBytes;
          if (selectedNetwork == "westend_assethub") {
            proofBytes = "not set ";
          } else {
            proofBytes = await ProofWorker.generate_proof_data(secret, p);
          }

          //    console.log('generating proof for secret:', secret);
          const proofData = "0x" + proofBytes;
          console.log("outputed ui proof length:", proofBytes.length);
          toast(`🔐 ZK proof generated!`, {
            position: "top-right",
            autoClose: 5000,
            hideProgressBar: false,
            closeOnClick: false,
            pauseOnHover: true,
            draggable: true,
            progress: undefined,
            theme: "dark",
          });

          console.log("Proof generated in worker:", proofData);

          toast(`🧙 UnShielding assets `, {
            position: "top-right",
            autoClose: 6000,
            hideProgressBar: false,
            closeOnClick: false,
            pauseOnHover: true,
            draggable: true,
            progress: undefined,
            theme: "dark",
          });

          var shieldedContract;
          if (selectedNetwork == "westend_assethub") {
            console.log(`westend unshiedl`);
            shieldedContract = new ethers.Contract(
              westend_pool,
              [
                "function deposit(address,uint256,bytes32) payable",
                "function withdraw2(uint256[2],uint256[2][2],uint256[2],uint256[3],address,uint256,bytes32)",
              ],
              ETHsigner,
            );
          } else if (selectedNetwork == "paseo_assethub") {
            console.log(`set shielded contract`);
            shieldedContract = new ethers.Contract(
              NETWORKS["paseo_assethub"].shield_address,
              [
                "function deposit(address,uint256,bytes32) payable",
                "function withdraw2(uint256[2],uint256[2][2],uint256[2],uint256[3],address,uint256,bytes32)",
              ],
              ETHsigner,
            );
          } else {
            shieldedContract = new ethers.Contract(
              SHIELD_CONTRACT_ADDRESS.SHIELD_CONTRACT_ADDRESS, // Using the fake ERC-20 address from your constants
              SHIELD_CONTRACT_ADDRESS.shielderAbi,
              ETHsigner,
            );
          }

          /*
 withdraw2(bytes calldata proof, address asset, uint256 amount, uint256[] calldata instances)
*/
          const nullifier = ProofWorker.generate_commitment(secret);

          const tx_debug = {
            proof: proofData,
            asset: SHIELD_CONTRACT_ADDRESS.fakeerc20asset,
            amount: ethers.parseEther(amount),
            nullifier: [nullifier],
          };
          console.log(`calling estimated gas`);

          console.log(`tx_debug:`, tx_debug);
          var myasset;
          if (NETWORKS[selectedNetwork].asset == selectedToken) {
            myasset = ethers.ZeroAddress;
          } else {
            myasset = SHIELD_CONTRACT_ADDRESS.fakeerc20asset;
          }
          var txResponse;
          if (
            selectedNetwork == "westend_assethub" ||
            selectedNetwork === "paseo_assethub"
          ) {
            //function withdraw2(uint[2], uint[2][2], unit[2], uint[3], uint256, bytes32)
            const datn = await generateCommitment(secret);
            console.log(`calling with datn: `, datn);

            console.log(` datn[0]: `, datn[0]);
            console.log(` datn[1]: `, datn[1]);
            console.log(` datn[2]: `, datn[2]);
            //console.log(`p4: `, p4);

            console.log(`nullifier: `, nullifier);
            txResponse = await shieldedContract.withdraw2(
              datn[0],
              datn[1],
              datn[2],
              datn[3], //proof.publicSignals,
              myasset,
              ethers.parseEther(amount),
              nullifier,
              //{
              //   gasLimit: 558414, //newo, // Standard ETH transfer gas
              //  },
            );
          } else {
            txResponse = await shieldedContract.withdraw2(
              proofData,
              myasset,
              ethers.parseEther(amount),
              [nullifier],
              {
                gasLimit: 518414, //newo, // Standard ETH transfer gas
              },
            );
          }

          toast(`Transaction hash: ${txResponse.hash}`, {
            position: "top-right",
            autoClose: 4000,
            hideProgressBar: false,
            closeOnClick: false,
            pauseOnHover: true,
            draggable: true,
            progress: undefined,
            theme: "dark",
          });
          // 8. Wait for confirmation
          const receipt2 = await txResponse.wait();

          toast(`Transaction confirmed in block: ${receipt2.blockNumber}`, {
            position: "top-right",
            autoClose: 6000,
            hideProgressBar: false,
            closeOnClick: false,
            pauseOnHover: true,
            draggable: true,
            progress: undefined,
            theme: "dark",
          });

          toast(`Assets unshielded sucessfully `, {
            position: "top-right",
            autoClose: 6000,
            hideProgressBar: false,
            closeOnClick: false,
            pauseOnHover: true,
            draggable: true,
            progress: undefined,
            theme: "dark",
          });
        } else {
          toast(`❌ ERROR: Could not load web assembly module`, {
            position: "top-right",
            autoClose: 6000,
            hideProgressBar: false,
            closeOnClick: false,
            pauseOnHover: true,
            draggable: true,
            progress: undefined,
            theme: "dark",
          });
        }

        setAmount("");
        setSecret("");
        console.log(`unshielded good`);
      } catch (err) {
        console.error("Proof generation failed:", err);
        throw err;
      }

      //const proofdata = await generate_proof_data("0x1234562", p);
      // console.log(`got proof data: `, proofdata);
      //     await unshieldTokens(selectedToken, secret);
      setSecret("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  const handleBridge = async () => {
    if (!fromNetwork || !toNetwork) {
      toast(`❌ ERROR: Set to and from Network`, {
        position: "top-right",
        autoClose: 6000,
        hideProgressBar: false,
        closeOnClick: false,
        pauseOnHover: true,
        draggable: true,
        progress: undefined,
        theme: "dark",
      });
      return;
    }
    console.log(`handle bridge called`);
    // Implementation of handleBridge function
    setIsLoading(true);
    setError(null);

    // Display loading toast
    toast.info(`Sending XCM transfer`, {
      position: "top-right",
      autoClose: 5000,
      hideProgressBar: false,
      closeOnClick: false,
      pauseOnHover: true,
      draggable: true,
      progress: undefined,
      theme: "dark",
    });
    const to_chain = toNetwork;
    const from_chain = fromNetwork;
    const wallet = selectedWallet;
    console.log(`cached account:`, evmAddress);

    const from_wsendpoint = xcm_chains.find(
      (item) => item.name === from_chain,
    )?.wsendpoint;
    const wsProvider = new WsProvider(from_wsendpoint);
    const tapi = await ApiPromise.create({ provider: wsProvider });
    console.log(
      `from_chain, to_chain, dest_address, amount`,
      from_wsendpoint,
      from_chain,
      to_chain,
      evmAddress,
      amount,
    );
    const transacto = await generate_tx2(
      tapi,
      from_chain,
      to_chain,
      evmAddress,
      amount,
    );
    console.log(`got transaction object back`);
    const signer = wallet.signer;
    const fromaddress = "5GC2UC5dvbv81beE44zzvRfZzMR5bnm8S2c3d2kaefRDeHR9";

    /*
      const unsub = await transacto.signAndSend(fromaddress, { signer }, ({ status, dispatchError }) => {
  if (status.isInBlock) {
    console.log(`Transaction included at blockHash ${status.asInBlock}`);
    unsub(); // stop listening once included
  } else if (status.isFinalized) {
    console.log(`Transaction finalized at blockHash ${status.asFinalized}`);
  }

  */
    console.log(`going for the tx`);
    const unsub = await transacto.signAndSend(
      fromaddress,
      { signer },
      ({ status, events, dispatchError }) => {
        if (status.isInBlock) {
          console.log(`Transaction included in block: ${status.asInBlock}`);
          toast.info(`Transaction included in block: ${status.asInBlock}`, {
            position: "top-right",
            autoClose: 6000,
            hideProgressBar: false,
            closeOnClick: false,
            pauseOnHover: true,
            draggable: true,
            progress: undefined,
            theme: "dark",
          });
        }

        if (status.isFinalized) {
          console.log(`Transaction finalized: ${status.asFinalized}`);
          toast.success(`Transaction finalized: ${status.asFinalized}`, {
            position: "top-right",
            autoClose: 8000,
            hideProgressBar: false,
            closeOnClick: false,
            pauseOnHover: true,
            draggable: true,
            progress: undefined,
            theme: "dark",
          });
          unsub(); // Unsubscribe from updates
          setIsLoading(false);
        }
      },
    );

    setIsLoading(false);
    setAmount("");
    // console.log(`generated transaction: `, transacto.toHex())
  };

  return (
    <div className="App">
      <ToastContainer />
      <div className="header">
        <script src="/snarkjs.min.js"></script>
        <div className="header-controls">
          <select
            className="network-select"
            value={selectedNetwork}
            onChange={(e) =>
              setNetwork(e.target.value as keyof typeof NETWORKS)
            }
          >
            <option value="moonbase">🔗 {NETWORKS.moonbase.name}</option>
            <option value="paseo_assethub">
              🔗 {NETWORKS.paseo_assethub.name}{" "}
            </option>
            <option value="westend_assethub">
              🔗 {NETWORKS.westend_assethub.name}
            </option>
          </select>
          <WalletSelect
            dappName="Talisman"
            showAccountsList
            walletList={[
              new TalismanWallet(),
              new NovaWallet(),
              new SubWallet(),
              new MantaWallet(),
              new PolkaGate(),
              new FearlessWallet(),
              new EnkryptWallet(),
              new PolkadotjsWallet(),
              new AlephZeroWallet(),
            ]}
            triggerComponent={
              <button
                className={`connect-button ${isWalletConnected ? "connected" : ""}`}
              >
                {isWalletConnected
                  ? `Connected: ${evmAddress?.slice(0, 6)}...${evmAddress?.slice(-4)}`
                  : "Connect EVM Wallet"}
              </button>
            }
            onAccountSelected={(account) => {
              // Handle the selected account
              console.log("Selected account:", account.address);
              setEvmAddress(account.address);
              const talismanEth = (window as any).talismanEth;
              if (talismanEth) {
                const provider = new ethers.BrowserProvider(talismanEth);
                setSelectedWalletEVM(provider);
              }
              setIsWalletConnected(true);
            }}
            onWalletSelected={handleWalletSelected}
          />
        </div>
      </div>

      <div className="swap-container">
        <div className="swap-box">
          <div className="tabs">
            <button
              className={`tab ${activeTab === "shield" ? "active" : ""}`}
              onClick={() => setActiveTab("shield")}
            >
              Shield Tokens
            </button>
            <button
              className={`tab ${activeTab === "unshield" ? "active" : ""}`}
              onClick={() => setActiveTab("unshield")}
            >
              Unshield Tokens
            </button>
            <button
              className={`tab ${activeTab === "bridge" ? "active" : ""}`}
              onClick={() => setActiveTab("bridge")}
            >
              Bridge
            </button>
          </div>
          <div className="input-group">
            {activeTab === "bridge" && (
              <div className="chain-selection">
                <div className="chain-input">
                  <label>From Chain:</label>
                  <select
                    value={fromNetwork}
                    onChange={(e) =>
                      setfromNetwork(e.target.value as keyof typeof NETWORKS)
                    }
                  >
                    {Object.entries(xcm_chains).map(([key, network]) => (
                      <option key={network.name} value={network.name}>
                        {network.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="chain-input">
                  <label>To Chain:</label>
                  <select
                    value={toNetwork}
                    onChange={(e) =>
                      settoNetwork(e.target.value as keyof typeof NETWORKS)
                    }
                  >
                    {Object.entries(xcm_chains).map(([key, network]) => (
                      <option key={network.name} value={network.name}>
                        {network.name}
                      </option>
                    ))}
                  </select>
                </div>
                <a
                  href="https://kusamashield.codeberg.page/xcm.html"
                  target="_blank"
                  title="XCM transfer how-to link"
                >
                  Documentation link
                </a>
              </div>
            )}

            <div className="token-input">
              <input
                type="number"
                placeholder="0.0"
                value={amount}
                min="0"
                onChange={(e) => setAmount(e.target.value)}
                required={activeTab === "shield"}
              />
              <select
                value={selectedToken}
                onChange={(e) => setSelectedToken(e.target.value)}
              >
                <option title="native Currency">
                  {NETWORKS[selectedNetwork].asset}
                </option>
                <option>KSM</option>
                <option>DOT</option>
                <option>USDT</option>
              </select>
            </div>
            {activeTab === "shield" && (
              <div className="balance">
                <a
                  title="faucet link"
                  target="_blank"
                  href={NETWORKS[selectedNetwork].faucet}
                >
                  {NETWORKS[selectedNetwork].name} faucet link
                </a>
                <br />
                <a
                  title="Documentation link"
                  target="_blank"
                  href={NETWORKS[selectedNetwork].docs}
                >
                  {NETWORKS[selectedNetwork].name} Documentation
                </a>
              </div>
            )}
            {activeTab === "shield" && (
              <div className="secret-input">
                {isGeneratingSecret ? (
                  <div className="secret-loading">
                    <div className="loading-spinner"></div>
                    <span>Generating shielded transaction...</span>
                  </div>
                ) : generatedSecret ? (
                  <div className="generated-secret">
                    <span>Generated Secret: {generatedSecret}</span>
                  </div>
                ) : null}
              </div>
            )}

            {activeTab === "unshield" && (
              <div className="secret-input">
                <input
                  type="password"
                  placeholder="Enter withdrawal secret"
                  value={secret}
                  onChange={(e) => setSecret(e.target.value)}
                />
              </div>
            )}
          </div>
          {error && <div className="error-message">{error}</div>}
          <button
            className={`swap-button ${isLoading ? "loading" : ""}`}
            onClick={
              activeTab === "shield"
                ? handleShield
                : activeTab === "unshield"
                  ? handleUnshield
                  : handleBridge
            }
            disabled={isLoading || !isWalletConnected}
          >
            {isLoading
              ? "Processing..."
              : activeTab === "shield"
                ? "Shield"
                : activeTab === "unshield"
                  ? "Unshield"
                  : "Bridge"}
          </button>
        </div>

        <button className="help-button" onClick={() => setShowHelp(true)}>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 512 512"
            width="16"
            height="16"
            style={{ marginRight: "8px" }}
          >
            <path
              d="M256 512A256 256 0 1 0 256 0a256 256 0 1 0 0 512zM216 336l24 0 0-64-24 0c-13.3 0-24-10.7-24-24s10.7-24 24-24l48 0c13.3 0 24 10.7 24 24l0 88 8 0c13.3 0 24 10.7 24 24s-10.7 24-24 24l-80 0c-13.3 0-24-10.7-24-24s10.7-24 24-24zm40-208a32 32 0 1 1 0 64 32 32 0 1 1 0-64z"
              fill="currentColor"
            />
          </svg>
          Need Help? Click Here
        </button>

        <button className="terms-button" onClick={() => setShowTerms(true)}>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 512 512"
            width="16"
            height="16"
            style={{ marginRight: "8px" }}
          >
            <path
              d="M256 512A256 256 0 1 0 256 0a256 256 0 1 0 0 512zM216 336h24V272H216c-13.3 0-24-10.7-24-24s10.7-24 24-24h48c13.3 0 24 10.7 24 24v88h8c13.3 0 24 10.7 24 24s-10.7 24-24 24h-80c-13.3 0-24-10.7-24-24s10.7-24 24-24zm40-208a32 32 0 1 1 0 64 32 32 0 1 1 0-64z"
              fill="currentColor"
            />
          </svg>
          By using this website you agree to the Terms of Service
        </button>

        {showHelp && (
          <div className="help-modal">
            <div className="help-modal-content">
              <h2>General information</h2>
              <div className="help-section">
                <h3>Need more information?</h3>
                <p>Check out the public documentation: </p>
                <p>
                  <a
                    href="https://kusamashield.codeberg.page/intro.html"
                    title="Kusama Shield Public documentation"
                    target="_blank"
                  >
                    https://kusamashield.codeberg.page/intro.html
                  </a>
                </p>
              </div>
              <div className="help-section">
                <h3>Found a bug?</h3>
                <p>1. Document the bug(take screenshots)</p>
                <p>
                  2.{" "}
                  <a
                    href="https://codeberg.org/KusamaShield/Interface/issues/new"
                    title="Kusama Shield Code Repository"
                    target="_blank"
                  >
                    File an issue on the public repo
                  </a>
                </p>
              </div>
              <h2>How to use Kusama Shield</h2>
              <div className="help-section">
                <h3>Shielding Tokens</h3>
                <p>1. Connect your wallet using the button above</p>
                <p>2. Select the network you want to use</p>
                <p>3. Enter the amount you want to shield</p>
                <p>4. Click "Shield" to start the process</p>
                <p>
                  5. Save your secret key - you'll need it to unshield later!
                </p>
              </div>
              <div className="help-section">
                <h3>Unshielding Tokens</h3>
                <p>
                  1. Make sure you have your secret key from when you shielded
                </p>
                <p>2. Enter the amount you want to unshield</p>
                <p>3. Enter your secret key</p>
                <p>4. Click "Unshield" to retrieve your tokens</p>
              </div>
              <div className="help-section">
                <h3>Important Notes</h3>
                <p>
                  • Always keep your secret key safe - if you lose it, you won't
                  be able to unshield your tokens
                </p>
                <p>
                  • Make sure you're on the correct network before
                  shielding/unshielding
                </p>
                <p>• You can get test tokens from the faucet link provided</p>
              </div>
              <button
                className="close-help-button"
                onClick={() => setShowHelp(false)}
              >
                Close
              </button>
            </div>
          </div>
        )}

        {showTerms && (
          <div className="help-modal">
            <div className="help-modal-content">
              <h2>Terms of Service</h2>
              <div className="help-section">
                <h3>1. Acceptance of Terms</h3>
                <p>
                  By accessing and using Kusama Shield, you agree to be bound by
                  these Terms of Service and all applicable laws and
                  regulations.
                </p>
              </div>
              <div className="help-section">
                <h3>2. Service Description</h3>
                <p>
                  Kusama Shield provides a privacy-focused Zero Knowledge token
                  shielding <b>User Interface</b> that allows users to shield
                  and unshield tokens on supported decentralized networks.
                </p>
              </div>
              <div className="help-section">
                <h3>3. User Responsibilities</h3>
                <p>
                  • You are responsible for maintaining the security of your
                  wallet and secret keys
                </p>
                <p>
                  • You must ensure you have sufficient funds for transactions
                </p>
                <p>
                  • Developers and Operators of this website are not liable for
                  any type of Regulatory actions or legal consequences arising
                  from the use of the Platform.
                </p>
                <p>
                  • You are responsible for verifying transaction details before
                  confirming
                </p>
              </div>
              <div className="help-section">
                <h3>4. Risk Disclosure</h3>
                <p>• Kusama Shield Comes with No warranty </p>
                <p>• Cryptocurrency transactions are irreversible</p>
                <p>
                  • Kusama Shield is early stage open source software and may
                  contain bugs
                </p>
                <p>
                  • You acknowledge the risks associated with blockchain
                  technology
                </p>
                <p>• The service is provided "as is" without warranties</p>
              </div>
              <div className="help-section">
                <h3>5. Privacy</h3>
                <p>
                  • We do not store your private keys or transaction secrets
                </p>
                <p>• This platform does not guarantee anonymity</p>
                <p>
                  • All transactions are processed by decentralized blockchain
                  networks without any middlemen
                </p>
                <p>• We do not process transactions or hold any private keys</p>
                <p>
                  • The Pool utilizes zero-knowledge proofs to verify
                  transactions and asset holdings without revealing underlying
                  data.
                </p>
                <p>
                  • As a host of this website, I do not select the material
                  transmitted through this website that I run, and I have no
                  practical means of either identifying the source of such
                  material or preventing its transmission.{" "}
                </p>
              </div>
              <div className="help-section">
                <h3>6. Prohibited Use</h3>
                <p>Users must not:</p>
                <p>
                  • Use the Platform for illegal activities (e.g., money
                  laundering, terrorism financing).
                </p>
                <p>
                  • Exploit vulnerabilities, disrupt hosting or engage in
                  attacks against the Platform.
                </p>
                <p>
                  • Misrepresent affiliation with the Platform's developers or
                  operators.
                </p>
                <p>• Violate applicable laws in their jurisdiction.</p>
              </div>
              <div className="help-section">
                <h3>7. Limitation of Liability</h3>
                <p>
                  We are not liable for any losses, including but not limited
                  to:{" "}
                </p>
                <p>• Lost or stolen secret keys</p>
                <p>• Network issues or blockchain congestion</p>
                <p>• Incorrect transaction parameters</p>
                <p>
                  {" "}
                  Developers and maintainers are <b>not</b> financial advisors
                  or custodians of user funds.
                </p>
              </div>
              <div className="help-section">
                <h3> Acceptance of Terms</h3>
                <p>By using the Platform, you confirm that you:</p>
                <p>
                  • Understand the risks of decentralized networks and privacy
                  tools.
                </p>
                <p>
                  • Assume full responsibility for your interactions with the
                  Platform.
                </p>
                <p>
                  • Release all maintainers, operators, and developers from
                  liability.
                </p>
                <b>
                  {" "}
                  This document is not legal advice. Consult a qualified
                  attorney for compliance matters.
                </b>
              </div>

              <button
                className="close-help-button"
                onClick={() => setShowTerms(false)}
              >
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
