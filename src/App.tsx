/*
 * Copyright 2025-2026 Kusama Shield Developers on behalf of the Kusama DAO, see LICENSE in main folder.
 */

import "./App.css";
import { useState, useEffect, useRef, useCallback } from "react";
import * as d3 from "d3";
import { WalletSelect } from "@talismn/connect-components";
import { shieldTokens } from "./transactions/shield";
import {
  isEvmAddress,
  ispolkadotaddress,
  get_foreign_simple,
  get_blockexplorer,
} from "./transactions/adresses";
import SHIELD_CONTRACT_ADDRESS from "./transactions/shield";
import fakeerc20asset from "./transactions/shield";
//import { make_deposit_tx, gen_tx_no_sig } from "./transactions/txgen";
import { unshieldTokens, fetchKzgParams } from "./transactions/unshield";
import {
  generate_tx2,
  xcm_chains,
  KSM2ah,
  generate_dot2ksm,
  eth2accountid32,
} from "./transactions/xcm";
import { ZKPService } from "./transactions/zklib";
import { buildMerkleTreeFromContract } from "./transactions/merkle";
import { poseidon1, poseidon2, poseidon3 } from "poseidon-lite";
import {
  westend_pool,
  generateCommitment,
  zkDeposit,
  zkWithdraw,
  preloadZkey,
  preloadWasm,
  preloadWasmsnark,
  USE_WASMSNARK,
} from "./transactions/zkg16";
import { ToastContainer, toast } from "react-toastify";
import { ApiPromise, WsProvider } from "@polkadot/api";
import { u8aToHex } from "@polkadot/util";
import { Transaction, parseEther, parseUnits } from "ethers";
import { WalletAccount } from "@talismn/connect-wallets";
import QRCode from "qrcode";
import SwapStatusTracker from "./components/SwapStatusTracker";
import NetworkSelect from "./components/NetworkSelect";
import OfframpWidget from "./components/OfframpWidget";
//import init, { generate_commitment, test_console, test_proofo, generate_proof_data } from '../pkg/generate_zk_wasm'; // adjust path as needed
import { Buffer } from "buffer";

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
import UnifiedWalletSelector from "./components/UnifiedWalletSelector";
import FlyingToasters from "./components/FlyingToasters";
import RainAnimation from "./components/RainAnimation";
import FlameAnimation from "./components/FlameAnimation";
import PonyAnimation from "./components/PonyAnimation";
import { useAccount, useSwitchChain, useWalletClient } from "wagmi";

// input token amounts
const amountOptions = [0.5, 1, 5, 10, 100, 500, 1000, 10000];

// window.ethereum type is provided by wagmi/viem

export const NETWORKS = {
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
    name: "Paseo AssetHub",
    asset: "DOT",
    logo: "/paseo-icon.png",
    chain_id: 420420417,
    rpcEndpoint: "https://paseo-assethub-rpc.laissez-faire.trade/",
    rpcEndpoints: [
      "https://paseo-assethub-rpc.laissez-faire.trade/",
      "https://eth-asset-hub-paseo.dotters.network",
    ],
    wsEndpoint: "wss://asset-hub-paseo-rpc.n.dwellir.com",
    faucet: "https://faucet.polkadot.io",
    block_explorer: "https://testnet.routescan.io",
    // v7 Pool (FixedIlopPhase2Paseo_v7.sol) - linkability fix, 8 signals, known-roots window
    shield_address: "0xbcE09D4De052b2816df1285663ac89528DF45380",
    verifier_address: "0xcA4cBc5d31eccd08d393C43aF492F729FF30b685",
    poseidonT3_address: "0x1d165f6fe5a30422e0e2140e91c8a9b800380637",
    deploymentBlock: 11273491,
    abi: [
      "function depositNative(bytes32 commitment) external payable",
      "function depositAsset(uint256 assetId, uint256 amount, bytes32 commitment) external",
      "function depositAssetDirect(uint256 assetId, uint256 amount, bytes32 commitment) external",
      "function withdraw(uint256[2] calldata pA, uint256[2][2] calldata pB, uint256[2] calldata pC, uint[8] calldata pubSignals, address recipient) external",
      "function proxy_withdraw(uint256[2] calldata pA, uint256[2][2] calldata pB, uint256[2] calldata pC, uint[8] calldata pubSignals, address recipient) external",
      "function currentRoot() external view returns (uint256)",
      "function treeSize() external view returns (uint256)",
      "function getEscrowBalance(address) external view returns (uint256)",
      "function isNullifierSpent(bytes32) external view returns (bool)",
      "function isCommitmentUsed(bytes32) external view returns (bool)",
      "function isKnownRoot(uint256) external view returns (bool)",
      "function getPrecompileAddress(uint256 assetId) external pure returns (address)",
      "function verifier() external view returns (address)",
    ],
    docs: "https://kusamashield.codeberg.page/networks/PaseoAH.html",
  },
  polkadot: {
    name: "Polkadot Assethub",
    asset: "DOT",
    logo: "/favicon-dark.svg",
    chain_id: 420420419,
    rpcEndpoint: "https://eth-rpc.polkadot.io/",
    rpcEndpoints: [
      "https://polkadot-assethub-rpc.laissez-faire.trade",
      "https://eth-rpc.polkadot.io/",
    ],
    wsEndpoint: "wss://asset-hub-polkadot-rpc.polkadot.io",
    faucet: "",
    block_explorer: "https://blockscout.polkadot.io/",
    // v7 Pool (FixedIlopPhase2Paseo_v7_Polkadot.sol) - redeployed with circomlibjs hasher
    shield_address: "0x0D694Da746e73D1e255c1894F90e38170db45809",
    verifier_address: "0x6A13781E43AEA21918120CD0E7a2ed8614c01e14",
    leanIMT_address: "0x0D694Da746e73D1e255c1894F90e38170db45809",
    poseidonT3_address: "0xB8F0C6679D6Cc56450470522Bd96573C3D615052",
    abi: [
      "function depositNative(bytes32 commitment) external payable",
      "function depositAsset(uint256 assetId, uint256 amount, bytes32 commitment) external",
      "function depositAssetDirect(uint256 assetId, uint256 amount, bytes32 commitment) external",
      "function withdraw(uint256[2] calldata pA, uint256[2][2] calldata pB, uint256[2] calldata pC, uint[8] calldata pubSignals, address recipient) external",
      "function proxy_withdraw(uint256[2] calldata pA, uint256[2][2] calldata pB, uint256[2] calldata pC, uint[8] calldata pubSignals, address recipient) external",
      "function currentRoot() external view returns (uint256)",
      "function treeSize() external view returns (uint256)",
      "function getEscrowBalance(address) external view returns (uint256)",
      "function isNullifierSpent(bytes32) external view returns (bool)",
      "function isCommitmentUsed(bytes32) external view returns (bool)",
      "function isKnownRoot(uint256) external view returns (bool)",
      "function getPrecompileAddress(uint256 assetId) external pure returns (address)",
      "function verifier() external view returns (address)",
    ],
    deploymentBlock: 18460000,
    docs: "https://kusamashield.codeberg.page/",
  },

kusama: {
    name: "Kusama Assethub",
    type: "mainnet",
    wsEndpoint: "wss://kusama-asset-hub-rpc.polkadot.io",
    rpcEndpoint: "https://kusama-rpc.laissez-faire.trade",
    rpcEndpoints: [
      "https://kusama-rpc.laissez-faire.trade",
    ],
    asset: "KSM",
    chain_id: 420420418,
    shield_address: "0x625159459EB6C50C4F4b126A955B18d5c4DCA573",
    verifier_address: "0x66988131CFfd10d2804ffaC93Ac302D0886D7829",
    leanIMT_address: "0xc16F8f88c1C2Aa4dddF765Fa5D9739E5bDC7d373",
    abi: [
      "function depositNative(bytes32 commitment, bytes32 nullifierHash) external payable",
      "function depositAsset(uint256 assetId, uint256 amount, bytes32 commitment, bytes32 nullifierHash) external",
      "function depositAssetDirect(uint256 assetId, uint256 amount, bytes32 commitment, bytes32 nullifierHash) external",
      "function withdraw(uint256[2] calldata pA, uint256[2][2] calldata pB, uint256[2] calldata pC, uint[7] calldata pubSignals, address asset, uint256 amount, address recipient) external",
      "function withdrawNative(uint256[2] calldata pA, uint256[2][2] calldata pB, uint256[2] calldata pC, uint[7] calldata pubSignals, uint256 amount) external",
      "function withdrawAsset(uint256[2] calldata pA, uint256[2][2] calldata pB, uint256[2] calldata pC, uint[7] calldata pubSignals, uint256 assetId, uint256 amount) external",
      "function proxy_withdraw(uint256[2] calldata pA, uint256[2][2] calldata pB, uint256[2] calldata pC, uint[7] calldata pubSignals, address asset, uint256 amount, address recipient) external",
      "function currentRoot() external view returns (uint256)",
      "function treeSize() external view returns (uint256)",
      "function escrow(address) external view returns (uint256)",
      "function deposits(bytes32 nullifierHash) external view returns (address asset, uint256 assetId, uint256 amount, bool isSpent)",
      "function usedCommitments(bytes32 commitment) external view returns (bool)",
      "function isDepositSpent(bytes32 nullifierHash) external view returns (bool)",
      "function getPrecompileAddress(uint256 assetId) external pure returns (address)",
    ],
    deploymentBlock: 0,
    block_explorer: "https://blockscout-kusama.polkadot.io/",
    docs: "https://kusamashield.codeberg.page/networks/kusama.html",
  },
  base: {
    name: "Base",
    rpcEndpoint: "https://mainnet.base.org",
    asset: "ETH",
    chain_id: 8453,
    block_explorer: "https://basescan.org",
  },
};

const DAPP_NAME = "KSMSHIELD";

function generateDot2KsmInput(dotAmount: any, ksmAmount: any) {
  const DOT_DECIMALS = 10; // Polkadot has 10 decimal places (10^10)
  const DOT_BASE_UNIT_FACTOR = 10n ** BigInt(DOT_DECIMALS); // 10000000000n

  // User input: 0.5 DOT
  const dotInputDecimal = "0.5";
  // A library like 'bignumber.js' or 'decimal.js' is best for this,
  // but for simple cases, you can use string manipulation or a helper function.

  // Example using a string/BigInt conversion for 0.5 DOT:
  // 0.5 * 10^10 = 5,000,000,000 plancks
  const dotInputBase: bigint =
    (BigInt(dotInputDecimal.replace(".", "")) * DOT_BASE_UNIT_FACTOR) / 10n; // Simple example

  // estimated tx fees: 0.0022 DOT
  //const feeDotDecimal = "0.0022";
  // 0.0022 * 10^10 = 22,000,000 plancks
  const feeDotBase: bigint = BigInt(22000000); // Pre-calculated or using a helper

  // Pool commission: 0.0015 DOT
  const poolCommissionBase: bigint = BigInt(15000000);

  // Total Fees/Commission
  const totalFeesBase: bigint = feeDotBase + poolCommissionBase;

  console.log(`totalFeesBase:`, totalFeesBase);
  function preciseDotToKsmConversion(dotAmount: number, ksmAmount: number) {
    // Convert to integer math to avoid floating point precision issues
    const dotRawTotal = BigInt(Math.round(dotAmount * 1e10)); // 0.5 DOT = 5000000000 | const dotDecimals = 10;
    const ksmRawExpected = BigInt(Math.round(ksmAmount * 1e12)); // 0.139683975037 KSM = 139683975037 |  const ksmDecimals = 12;

    // Calculate fees in raw units (0.3% total)
    const totalFeeRaw = (dotRawTotal * 3n) / 1000n; // 0.3% fee
    const poolFeeRaw = (dotRawTotal * 15n) / 10000n; // 0.15% fee

    // DOT amount after fees
    const dotRawAfterFee = dotRawTotal - totalFeeRaw;

    return {
      amount_in: dotRawAfterFee.toString(),
      amount_out_min: ksmRawExpected.toString(),
      fees: {
        total: Number(totalFeeRaw) / 1e10,
        pool: Number(poolFeeRaw) / 1e10,
      },
    };
  }

  // Test
  console.log(`calling preciseDotToKsmConversion`, dotAmount, ksmAmount);
  const preciseResult = preciseDotToKsmConversion(dotAmount, ksmAmount);
  console.log("Precise DOT raw:", preciseResult.amount_in); // 4985000000
  console.log("Precise KSM raw:", preciseResult.amount_out_min); // 139683975037
  console.log("Precise fees:", preciseResult.fees);

  const fee = 0.003; // 0.3% fee
  const dotAfterFee = dotAmount * (1 - fee);

  // Convert to raw values (using correct decimals)
  const dotRaw = BigInt(Math.round(dotAfterFee * 1e10)).toString();
  const ksmRaw = BigInt(Math.round(ksmAmount * 1e12)).toString();

  return {
    amount_in: dotRaw, // DOT amount after fee in raw
    amount_out_min: ksmRaw, // Minimum KSM expected in raw
  };
}

// Check if selected network is a testnet
const isTestnet = (networkKey: string): boolean => {
  const testnetKeys: (keyof typeof NETWORKS)[] = ["paseo_assethub", "westend_assethub"];
  return testnetKeys.includes(networkKey as keyof typeof NETWORKS);
};

export function App() {
  const [isWalletConnected, setIsWalletConnected] = useState(false);
  const [selectedWallet, setSelectedWallet] = useState<any>(null); // Consider using proper type instead of any
  const [selectedWalletEVM, setSelectedWalletEVM] = useState<any>(null);
  const [evmAddress, setEvmAddress] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<
    "shield" | "unshield" | "send" | "bridge" | "offramp"
  >("shield");
  const [secret, setSecret] = useState("");
  const [amount, setAmount] = useState("");
  const [sendRecipient, setSendRecipient] = useState("");
  const [sendAmount, setSendAmount] = useState("");
  const [sendFromCurrency, setSendFromCurrency] = useState("DOT");
  const [sendToCurrency, setSendToCurrency] = useState("DOT");
  const [sendDestinationNetwork, setSendDestinationNetwork] = useState("polkadot");
  const [sendGasEstimate, setSendGasEstimate] = useState<string | null>(null);
  const [sendGasLoading, setSendGasLoading] = useState(false);
  const [estimatedReceive, setEstimatedReceive] = useState<string | null>(null);
  const [estimatedReceiveLoading, setEstimatedReceiveLoading] = useState(false);
  const [swapRate, setSwapRate] = useState<string | null>(null);
  const [sendGasFee, setSendGasFee] = useState<string | null>(null);
  const [selectedToken, setSelectedToken] = useState<any>(null); //('KSM')
  const [userAssets, setUserAssets] = useState<
    {
      symbol: string;
      name: string;
      assetId: number;
      balance: string;
      decimals: number;
      precompile: string;
    }[]
  >([]);
  const [isLoadingAssets, setIsLoadingAssets] = useState(false);
  const [selectedNetwork, setSelectedNetwork] =
    useState<keyof typeof NETWORKS>("paseo_assethub");
  const [isNetworkDropdownOpen, setIsNetworkDropdownOpen] = useState(false);
  const [fromNetwork, setfromNetwork] = useState<any>(null);
  const [toNetwork, settoNetwork] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showNameGen, setShowNameGen] = useState(false);
  const [generatedFirstName, setGeneratedFirstName] = useState("");
  const [generatedLastName, setGeneratedLastName] = useState("");
  const [genLoading, setGenLoading] = useState(false);
  const [userEmail, setUserEmail] = useState("");
  const [confirmationToken, setConfirmationToken] = useState("");
  const [nameGenStep, setNameGenStep] = useState<"generate" | "confirm" | "done">("generate");
  const [nameGenResult, setNameGenResult] = useState("");
  const [firstNames, setFirstNames] = useState<string[]>([]);
  const [lastNames, setLastNames] = useState<string[]>([]);
  const [namesLoaded, setNamesLoaded] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);

  // Proxy withdraw state (for Paseo network)
  const [useProxyWithdraw, setUseProxyWithdraw] = useState<boolean>(false);

  // Privacy dashboard state
  const privacyChartRef = useRef<HTMLDivElement>(null);
  const [poolComposition, setPoolComposition] = useState<
    { symbol: string; amount: number; decimals: number; assetId: number }[]
  >([]);
  const [isLoadingPoolData, setIsLoadingPoolData] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState({
    processed: 0,
    total: 0,
    found: 0,
    currentAsset: "",
  });

  // Background color customization
  const [backgroundColor, setBackgroundColor] = useState("#09002b");
  const [gradientColor, setGradientColor] = useState("#000000");

  // Update CSS variables when colors change
  useEffect(() => {
    document.documentElement.style.setProperty("--bg-primary", backgroundColor);
    document.documentElement.style.setProperty("--bg-gradient", gradientColor);
  }, [backgroundColor, gradientColor]);

  // Add send-active class to body when on send tab
  useEffect(() => {
    if (activeTab === "send") {
      document.body.classList.add("send-active");
    } else {
      document.body.classList.remove("send-active");
    }
  }, [activeTab]);

  // Theme mode states
  const [rainMode, setRainMode] = useState(false);
  const [flameMode, setFlameMode] = useState(false);
  const [toasterMode, setToasterMode] = useState(false);
  const [ponyMode, setPonyMode] = useState(false);
  const [particleCount, setParticleCount] = useState(20);
  const [particleSize, setParticleSize] = useState(8);
  const [fallingSpeed, setFallingSpeed] = useState(5);
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);

  const [isWasmLoaded, setIsWasmLoaded] = useState(false);
  const [ProofWorker, setProofWorker] = useState<any>(null);
  const [isGeneratingSecret, setIsGeneratingSecret] = useState(false);
  const [generatedSecret, setGeneratedSecret] = useState<string>("");
  const [estimatedGasCost, setEstimatedGasCost] = useState<string>("");
  const [isGasPriceLoading, setIsGasPriceLoading] = useState<boolean>(false);
  const [recentGasUnits, setRecentGasUnits] = useState<
    Record<string, { shield: bigint; unshield: bigint }>
  >({});

  // Swap state variables
  const [fromCurrency, setFromCurrency] = useState<string>("BTC");
  const [toCurrency, setToCurrency] = useState<string>("DOT");
  const [swapAmount, setSwapAmount] = useState<string>("");
  const [exchangeRate, setExchangeRate] = useState<any>(null);
  const [availablePairs, setAvailablePairs] = useState<any[]>([]);
  const [swapStage, setSwapStage] = useState<
    "input" | "deposit" | "processing" | "completed"
  >("input");
  const [tradedata, setTradeData] = useState<any>(null);
  const [currentTrade, setCurrentTrade] = useState<any>(null);
  const [qrCodeData, setQrCodeData] = useState<string>("");
  const [userBalance, setUserBalance] = useState<string>("0");
  // Enhanced status tracking state
  const [swapStatusData, setSwapStatusData] = useState<any>(null);
  const [isPolling, setIsPolling] = useState<boolean>(false);
  const [pollInterval, setPollInterval] = useState<number>(10000); // Start with 10 seconds
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Local countdown timer state
  const [localTimeLeft, setLocalTimeLeft] = useState<number | null>(null);
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);
  // Destination address for non-KSM swaps
  const [destinationAddress, setDestinationAddress] = useState<string>("");

  // Monitor wagmi account state for external disconnects (e.g., user disconnects from MetaMask)
  const {
    isConnected: wagmiConnected,
    address: wagmiAddress,
    chain: connectedChain,
  } = useAccount();

  // Wagmi network switching for MetaMask/WalletConnect
  const { switchChain } = useSwitchChain();

  // Viem wallet client for Offramp (requires viem WalletClient)
  const { data: viemWalletClient } = useWalletClient();

  useEffect(() => {
    // If wagmi disconnects but app still thinks it's connected, sync the state
    if (!wagmiConnected && isWalletConnected && evmAddress?.startsWith("0x")) {
      console.log("Detected wallet disconnect from wagmi");
      setIsWalletConnected(false);
      setEvmAddress(null);
      setSelectedWalletEVM(null);
    }
  }, [wagmiConnected, isWalletConnected, evmAddress]);

  // Fetch native token balance from RPC
  useEffect(() => {
    const fetchNativeBalance = async () => {
      if (!evmAddress || !NETWORKS[selectedNetwork]?.rpcEndpoint) {
        setUserBalance("0");
        return;
      }

      // For networks that support asset hub (paseo, polkadot), use userAssets balance as primary source
      if (
        (selectedNetwork.includes("paseo") || selectedNetwork === "polkadot") &&
        userAssets.length > 0
      ) {
        const nativeSymbol = NETWORKS[selectedNetwork].asset;
        const nativeAsset = userAssets.find((a) => a.symbol === nativeSymbol);
        if (nativeAsset) {
          setUserBalance(formatBalance(nativeAsset));
          return;
        }
      }

      const rpcEndpoint = (() => {
        let ep = NETWORKS[selectedNetwork].rpcEndpoint;
        if (
          typeof window !== "undefined" &&
          window.location.hostname === "localhost" &&
          !ep.includes("eth-rpc.polkadot.io")
        ) {
          ep = "http://localhost:5173/api/rpc-proxy";
        }
        return ep;
      })();

      try {
        const response = await fetch(rpcEndpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            method: "eth_getBalance",
            params: [evmAddress, "latest"],
            id: 1,
            jsonrpc: "2.0",
          }),
        });

        const data = await response.json();
        if (data.result) {
          // Convert hex balance to decimal and format (18 decimals for native token)
          const balanceWei = BigInt(data.result);
          const balanceEth = Number(balanceWei) / 1e18;
          setUserBalance(balanceEth.toFixed(4));
        }
      } catch (error) {
        console.error("Failed to fetch balance:", error);
        // Fallback: use userAssets balance if available
        if (
          (selectedNetwork.includes("paseo") ||
            selectedNetwork === "polkadot") &&
          userAssets.length > 0
        ) {
          const nativeSymbol = NETWORKS[selectedNetwork].asset;
          const nativeAsset = userAssets.find((a) => a.symbol === nativeSymbol);
          if (nativeAsset) {
            setUserBalance(formatBalance(nativeAsset));
            return;
          }
        }
        setUserBalance("0");
      }
    };

    fetchNativeBalance();
    const balanceInterval = setInterval(fetchNativeBalance, 20000);
    return () => clearInterval(balanceInterval);
  }, [evmAddress, selectedNetwork]);

  // Pre-load circuit artifacts when Paseo network is selected
  useEffect(() => {
if (selectedNetwork === "paseo_assethub") {
      // Pre-load WASM into worker memory (avoids re-fetch on proof generation)
      preloadWasm("/withdraw.wasm").catch((e) =>
        console.warn("Failed to pre-load withdraw wasm:", e),
      );

      if (USE_WASMSNARK) {
        // Warm wasmsnark bn128 instance + binary proving key
        preloadWasmsnark().catch((e) =>
          console.warn("Failed to pre-load wasmsnark:", e),
        );
      } else {
        // Warm the worker's zkey cache (66MB) so proof generation is faster
        preloadZkey("/withdraw_0001.zkey").catch((e) =>
          console.warn("Failed to pre-load withdraw zkey:", e),
        );
      }
    }
  }, [selectedNetwork]);

  // Available currencies - only currencies that can be swapped TO DOT
  const availableCurrencies = [
    {
      symbol: "DOT",
      name: "Polkadot",
      logo: "/coin_logos/images/dot.svg",
    },
    { symbol: "KSM", name: "Kusama", logo: "/coin_logos/images/kusama.svg" },
    {
      symbol: "AAVEETH",
      name: "AAVE (Ethereum)",
      logo: "/coin_logos/images/aaveeth.svg",
    },
    { symbol: "ADA", name: "Cardano", logo: "/coin_logos/images/ada_dark.svg" },
    { symbol: "APT", name: "Aptos", logo: "/coin_logos/images/apt_dark.svg" },
    { symbol: "ARB", name: "Arbitrum", logo: "/coin_logos/images/arb.svg" },
    {
      symbol: "ATOM",
      name: "Cosmos",
      logo: "/coin_logos/images/atom_dark.svg",
    },
    { symbol: "AVAX", name: "Avalanche", logo: "/coin_logos/images/avax.svg" },
    {
      symbol: "BAT",
      name: "Basic Attention Token",
      logo: "/coin_logos/images/bat.svg",
    },
    { symbol: "BCH", name: "Bitcoin Cash", logo: "/coin_logos/images/bch.svg" },
    {
      symbol: "BNBOPBNB",
      name: "BNB (OpBNB)",
      logo: "/coin_logos/images/wbnbopbnb.svg",
    },
    {
      symbol: "BSC",
      name: "Binance Smart Chain",
      logo: "/coin_logos/images/bsc.svg",
    },
    { symbol: "BTC", name: "Bitcoin", logo: "/coin_logos/images/btc.svg" },
    {
      symbol: "BTCBSC",
      name: "Bitcoin (BSC)",
      logo: "/coin_logos/images/btcbsc.svg",
    },
    {
      symbol: "BTT",
      name: "BitTorrent",
      logo: "/coin_logos/images/btt_dark.svg",
    },
    {
      symbol: "CAKE",
      name: "PancakeSwap",
      logo: "/coin_logos/images/cake.svg",
    },
    {
      symbol: "DAIBSC",
      name: "DAI (BSC)",
      logo: "/coin_logos/images/daibsc.svg",
    },
    {
      symbol: "DAIETH",
      name: "DAI (Ethereum)",
      logo: "/coin_logos/images/daieth.svg",
    },
    {
      symbol: "DAIMATIC",
      name: "DAI (Polygon)",
      logo: "/coin_logos/images/daimatic.svg",
    },
    { symbol: "DASH", name: "Dash", logo: "/coin_logos/images/dash.svg" },
    { symbol: "DOGE", name: "Dogecoin", logo: "/coin_logos/images/doge.svg" },
    {
      symbol: "ETC",
      name: "Ethereum Classic",
      logo: "/coin_logos/images/etc.svg",
    },
    {
      symbol: "ETH",
      name: "Ethereum",
      logo: "/coin_logos/images/eth_dark.svg",
    },
    {
      symbol: "ETHARBITRUM",
      name: "Ethereum (Arbitrum)",
      logo: "/coin_logos/images/etharbitrum_dark.svg",
    },
    {
      symbol: "ETHBASE",
      name: "Ethereum (Base)",
      logo: "/coin_logos/images/ethbase_dark.svg",
    },
    {
      symbol: "ETHBSC",
      name: "Ethereum (BSC)",
      logo: "/coin_logos/images/ethbsc_dark.svg",
    },
    {
      symbol: "ETHOP",
      name: "Ethereum (Optimism)",
      logo: "/coin_logos/images/ethop_dark.svg",
    },
    {
      symbol: "ETHZKSYNC",
      name: "Ethereum (zkSync)",
      logo: "/coin_logos/images/ethzksync_dark.svg",
    },
    { symbol: "KCS", name: "KuCoin Token", logo: "/coin_logos/images/kcs.svg" },
    { symbol: "LINK", name: "Chainlink", logo: "/coin_logos/images/link.svg" },
    { symbol: "LTC", name: "Litecoin", logo: "/coin_logos/images/ltc.svg" },
    {
      symbol: "MANAETH",
      name: "MANA (Ethereum)",
      logo: "/coin_logos/images/manaeth.svg",
    },
    {
      symbol: "PAXGETH",
      name: "PAX Gold (Ethereum)",
      logo: "/coin_logos/images/paxgeth.svg",
    },
    {
      symbol: "PEPEETH",
      name: "PEPE (Ethereum)",
      logo: "/coin_logos/images/pepeeth.svg",
    },
    { symbol: "POL", name: "Polygon", logo: "/coin_logos/images/pol.svg" },
    {
      symbol: "POLETH",
      name: "Polygon (Ethereum)",
      logo: "/coin_logos/images/poleth.svg",
    },
    { symbol: "S", name: "S Token", logo: "/coin_logos/images/s.svg" },
    { symbol: "SHIB", name: "Shiba Inu", logo: "/coin_logos/images/shib.svg" },
    { symbol: "SOL", name: "Solana", logo: "/coin_logos/images/sol.svg" },
    { symbol: "TON", name: "Toncoin", logo: "/coin_logos/images/ton.svg" },
    { symbol: "TRX", name: "TRON", logo: "/coin_logos/images/trx.svg" },
    { symbol: "TUSD", name: "TrueUSD", logo: "/coin_logos/images/tusd.svg" },
    {
      symbol: "TWTBSC",
      name: "Trust Wallet Token (BSC)",
      logo: "/coin_logos/images/twtbsc.svg",
    },
    {
      symbol: "USDCARBITRUM",
      name: "USDC (Arbitrum)",
      logo: "/coin_logos/images/usdcarbitrum.svg",
    },
    {
      symbol: "USDCETH",
      name: "USDC (Ethereum)",
      logo: "/coin_logos/images/usdceth.svg",
    },
    {
      symbol: "USDCSOL",
      name: "USDC (Solana)",
      logo: "/coin_logos/images/usdcsol.svg",
    },
    { symbol: "USDP", name: "Pax Dollar", logo: "/coin_logos/images/usdp.svg" },
    { symbol: "USDT", name: "USDT (TRON)", logo: "/coin_logos/images/usdttrc.svg" },
    {
      symbol: "USDTARBITRUM",
      name: "USDT (Arbitrum)",
      logo: "/coin_logos/images/usdtarbitrum.svg",
    },
    {
      symbol: "USDTBSC",
      name: "USDT (BSC)",
      logo: "/coin_logos/images/usdtbsc.svg",
    },
    {
      symbol: "USDTMATIC",
      name: "USDT (Polygon)",
      logo: "/coin_logos/images/usdtmatic.svg",
    },
    {
      symbol: "USDTSOL",
      name: "USDT (Solana)",
      logo: "/coin_logos/images/usdtsol.svg",
    },
    {
      symbol: "USDTETH",
      name: "USDT (Ethereum)",
      logo: "/coin_logos/images/usdt.svg",
    },
    { symbol: "VET", name: "VeChain", logo: "/coin_logos/images/vet.svg" },
    {
      symbol: "WBNBBSC",
      name: "Wrapped BNB (BSC)",
      logo: "/coin_logos/images/wbnbbsc.svg",
    },
    {
      symbol: "WETHARBITRUM",
      name: "Wrapped ETH (Arbitrum)",
      logo: "/coin_logos/images/wetharbitrum.svg",
    },
    {
      symbol: "WETHBASE",
      name: "Wrapped ETH (Base)",
      logo: "/coin_logos/images/wethbase_dark.svg",
    },
    {
      symbol: "WETHETH",
      name: "Wrapped ETH (Ethereum)",
      logo: "/coin_logos/images/wetheth_dark.svg",
    },
    {
      symbol: "WSOL",
      name: "Wrapped SOL",
      logo: "/coin_logos/images/wsol.svg",
    },
    { symbol: "XLM", name: "Stellar", logo: "/coin_logos/images/xlm_dark.svg" },
    { symbol: "XMR", name: "Monero", logo: "/coin_logos/images/xmr.svg" },
    { symbol: "XRP", name: "Ripple", logo: "/coin_logos/images/xrp.svg" },
    { symbol: "XTZ", name: "Tezos", logo: "/coin_logos/images/xtz.svg" },
    { symbol: "ZEC", name: "Zcash", logo: "/coin_logos/images/zec.svg" },
    {
      symbol: "ZRX",
      name: "0x Protocol",
      logo: "/coin_logos/images/zrx_dark.svg",
    },
  ];

  // Network-specific configurations
  const getNetworkType = (networkKey: string) => {
    if (
      networkKey === "kusama" ||
      networkKey === "polkadot" ||
      networkKey === "base"
    )
      return "mainnet";
    return "testnet";
  };

  // Add this ref to track current evmAddress
  const evmAddressRef = useRef<string | null>(null);

  // Ref to track active Substrate API connection for cleanup
  const substrateApiRef = useRef<any>(null);
  const substrateProviderRef = useRef<any>(null);

  // Ref to track current query request to prevent stale calls
  const queryRequestIdRef = useRef<number>(0);

  useEffect(() => {
    evmAddressRef.current = evmAddress;
  }, [evmAddress]);

  const isMainnet = (networkKey: string) =>
    getNetworkType(networkKey) === "mainnet";
  const isTestnet = (networkKey: string) =>
    getNetworkType(networkKey) === "testnet";

  // Switch away from bridge/offramp/send tabs when selecting testnet
  useEffect(() => {
    if (
      isTestnet(selectedNetwork) &&
      (activeTab === "bridge" || activeTab === "offramp" || activeTab === "send")
    ) {
      setActiveTab("shield");
    }
  }, [selectedNetwork, activeTab]);

  // Cleanup Substrate API on unmount
  useEffect(() => {
    return () => {
      if (substrateApiRef.current || substrateProviderRef.current) {
        try {
          if (substrateApiRef.current) {
            substrateApiRef.current.disconnect();
          }
          if (substrateProviderRef.current) {
            substrateProviderRef.current.disconnect();
          }
        } catch (e) {
          console.warn("Failed to disconnect API on unmount:", e);
        }
        substrateApiRef.current = null;
        substrateProviderRef.current = null;
      }
    };
  }, []);

  // Network-specific currency lists
  const getAvailableCurrencies = (networkKey: string) => {
    if (isMainnet(networkKey)) {
      // Mainnet networks: all cross-chain swap currencies (DOT, KSM, and others)
      return availableCurrencies;
    } else {
      // Testnets - only PAS, WND, and DEV routes (no KSM or DOT)
      return [
        { symbol: "PAS", name: "Paseo", logo: "/coin_logos/images/pas.svg" },
        { symbol: "WND", name: "Westend", logo: "/coin_logos/images/wnd.svg" },
        {
          symbol: "DEV",
          name: "Development",
          logo: "/coin_logos/images/dev.svg",
        },
      ];
    }
  };

  // Format balance from wei to human readable
  const formatBalance = (asset: { balance: string; decimals: number }) => {
    const balanceWei = BigInt(asset.balance);
    const balance = Number(balanceWei) / Math.pow(10, asset.decimals);
    return balance.toFixed(4);
  };

  const pickRandom = (arr: string[]) => arr[Math.floor(Math.random() * arr.length)];

  const generateName = (fns?: string[], lns?: string[]) => {
    const fnList = fns ?? firstNames;
    const lnList = lns ?? lastNames;
    if (fnList.length === 0 || lnList.length === 0) return;
    const fn = pickRandom(fnList);
    const ln = pickRandom(lnList);
    setGeneratedFirstName(fn.charAt(0).toUpperCase() + fn.slice(1).toLowerCase());
    setGeneratedLastName(ln.charAt(0).toUpperCase() + ln.slice(1).toLowerCase());
    setNameGenResult("");
  };

  const loadWordlists = async () => {
    if (namesLoaded) return;
    try {
      const [fnRes, lnRes] = await Promise.all([
        fetch("/wordlists/firstnames.txt"),
        fetch("/wordlists/lastnames.txt"),
      ]);
      const fnText = await fnRes.text();
      const lnText = await lnRes.text();
      const fns = fnText.split("\n").map((s) => s.trim()).filter(Boolean);
      const lns = lnText.split("\n").map((s) => s.trim()).filter(Boolean);
      setFirstNames(fns);
      setLastNames(lns);
      setNamesLoaded(true);
      return [fns, lns] as const;
    } catch (e) {
      console.error("Failed to load wordlists", e);
    }
  };

  const subscribeForwarder = async () => {
    if (!generatedFirstName || !generatedLastName || !userEmail) return;
    const handle = `${generatedFirstName.toLowerCase()}.${generatedLastName.toLowerCase()}`;
    const params = new URLSearchParams({ name: handle, domain: "metasploit.io", to: userEmail });
    try {
      setNameGenResult("Sending confirmation email...");
      const res = await fetch(`/api/mail-proxy/api/forward/subscribe?${params}`);
      const data = await res.json();
      if (data.ok) {
        setNameGenResult("");
        setNameGenStep("done");
        toast("Press the link in your inbox", {
          position: "top-right",
          autoClose: 7000,
          hideProgressBar: false,
          closeOnClick: false,
          pauseOnHover: true,
          draggable: true,
          progress: undefined,
          theme: "dark",
        });
      } else {
        setNameGenResult(`✗ ${data.error || "request failed"}`);
      }
    } catch (e: any) {
      setNameGenResult(`✗ ${e.message}`);
    }
  };

  // Query user's token balances from Paseo Asset Hub
  const queryUserAssets = async (address: string, networkKey: string) => {
    if (!address || !address.startsWith("0x")) return;

    // Increment request ID and capture it for this call
    const requestId = ++queryRequestIdRef.current;
    console.log(`queryUserAssets: request ${requestId} for network ${networkKey}`);

    // Only query for networks that support Asset Hub EVM (paseo, polkadot)
    if (!networkKey.includes("paseo") && networkKey !== "polkadot") {
      setUserAssets([]);
      return;
    }

    setIsLoadingAssets(true);
    try {
      // Check if this request is still valid (not superseded by a newer one)
      if (requestId !== queryRequestIdRef.current) {
        console.log(`queryUserAssets: request ${requestId} cancelled (superseded by ${queryRequestIdRef.current})`);
        return;
      }

      const { ApiPromise, WsProvider } = await import("@polkadot/api");
      const { ethers: ethersLib } = await import("ethers");

      // Convert EVM address to Substrate AccountId32
      // Standard mapping: EVM address + 12 bytes of 0xee
      const substrateAddress = address + "eeeeeeeeeeeeeeeeeeeeeeee";

      const wsUrl =
        NETWORKS[networkKey]?.wsEndpoint ||
        (networkKey === "polkadot"
          ? "wss://statemint-rpc.polkadot.io"
          : "wss://asset-hub-paseo-rpc.n.dwellir.com");

      console.log(`queryUserAssets: connecting to ${wsUrl} for network ${networkKey}`);

      // Disconnect any existing API before creating a new one
      if (substrateApiRef.current || substrateProviderRef.current) {
        try {
          // Disconnect API first
          if (substrateApiRef.current) {
            await substrateApiRef.current.disconnect();
          }
          // Also disconnect the provider to stop auto-retry
          if (substrateProviderRef.current) {
            await substrateProviderRef.current.disconnect();
            // Force close the WebSocket
            const ws = (substrateProviderRef.current as any)._ws;
            if (ws && ws.close) {
              ws.close(1000, "Manual disconnect");
            }
          }
        } catch (e) {
          console.warn("Failed to disconnect old API/provider:", e);
        }
        substrateApiRef.current = null;
        substrateProviderRef.current = null;
      }

      const wsProvider = new WsProvider(wsUrl);
      
      const api = await ApiPromise.create({
        provider: wsProvider,
        noInitWarn: true,
      });

      // Store both API and provider references for cleanup
      substrateApiRef.current = api;
      substrateProviderRef.current = wsProvider;

      const assets: {
        symbol: string;
        name: string;
        assetId: number;
        balance: string;
        decimals: number;
        precompile: string;
      }[] = [];

      // Determine native asset info from network config
      const networkConfig = NETWORKS[networkKey];
      const nativeSymbol = networkConfig.asset; // e.g., 'PAS', 'DOT', 'KSM', 'WND'
      const nativeName = networkConfig.name || nativeSymbol;

      // For Asset Hub networks (Paseo, Polkadot), query EVM balance instead of Substrate native balance
      try {
        let nativeFree: string;
        let decimals: number;

        if (networkKey.includes("paseo") || networkKey === "polkadot") {
          // Query EVM balance for Asset Hub
          const rpcEndpoints = networkConfig.rpcEndpoints || [networkConfig.rpcEndpoint];
          let provider: ethers.JsonRpcProvider | null = null;
          for (const rpcUrl of rpcEndpoints) {
            try {
              provider = new ethers.JsonRpcProvider(rpcUrl);
              await provider.getBlockNumber();
              break;
            } catch {
              provider = null;
            }
          }
          if (provider) {
            const evmBalance = await provider.getBalance(address);
            nativeFree = evmBalance.toString();
            decimals = 18; // EVM uses 18 decimals
            console.log(
              `${nativeSymbol} EVM Balance for`,
              address,
              ":",
              nativeFree,
              `(${ethers.formatEther(evmBalance)} ${nativeSymbol})`,
            );
          } else {
            throw new Error("No RPC endpoint for EVM balance query");
          }
        } else {
          // For non-Asset Hub networks, query Substrate native balance
          const nativeBalance = (await api.query.system.account(
            substrateAddress,
          )) as any;
          nativeFree = nativeBalance.data.free.toString();
          decimals = api.registry.chainDecimals[0] || 10;
          console.log(
            `${nativeSymbol} Substrate Balance for`,
            substrateAddress,
            ":",
            nativeFree,
          );
        }

        assets.push({
          symbol: nativeSymbol,
          name: nativeName,
          assetId: 0,
          balance: nativeFree,
          decimals: decimals,
          precompile: "native",
        });
      } catch (e) {
        console.error("Failed to query native balance:", e);
      }

      // Query all asset.account entries and filter by user
      const allAccounts = (await api.query.assets.account.entries()) as any;
      const substrateHex = substrateAddress.toLowerCase();
      const myAccounts = allAccounts.filter(([key]: [any, any]) => {
        const accountId = key.args[1].toHex();
        return accountId.toLowerCase() === substrateHex;
      });

      // Batch query metadata
      const assetIds = myAccounts.map(([key]: [any, any]) =>
        key.args[0].toNumber(),
      );
      if (assetIds.length > 0) {
        const metadataResults = await api.query.assets.metadata.multi(assetIds);

        for (let i = 0; i < myAccounts.length; i++) {
          const [key, accountInfo] = myAccounts[i];
          const assetId = key.args[0].toNumber();
          const balance = (accountInfo as any).unwrap().balance.toString();

          if (balance === "0") continue;

          const meta = metadataResults[i].toJSON() as any;
          let decimals = 0,
            name = "Unknown",
            symbol = "???";
          if (meta && meta.name) {
            decimals = meta.decimals;
            name =
              Buffer.from(meta.name.slice(2), "hex").toString("utf8") ||
              "Unknown";
            symbol =
              Buffer.from(meta.symbol.slice(2), "hex").toString("utf8") ||
              "???";
          }

          const assetIdHex = assetId.toString(16).padStart(8, "0");
          const precompile = `0x${assetIdHex}00000000000000000000000001200000`;

          assets.push({ symbol, name, assetId, balance, decimals, precompile });
        }
      }

      await api.disconnect();
      setUserAssets(assets);
      console.log(`Found ${assets.length} tokens for ${address}`);
    } catch (e) {
      console.error("Failed to query user assets:", e);
      setUserAssets([]);
    } finally {
      setIsLoadingAssets(false);
    }
  };

  // Check if swap is cross-chain (DOT→KSM)
  const isCrossChainSwap = (fromCurrency: string, toCurrency: string) => {
    return (
      (fromCurrency === "DOT" && toCurrency === "KSM") ||
      (fromCurrency === "KSM" && toCurrency === "DOT")
    );
  };

  // Check if swap requires destination address input
  const requiresDestinationAddress = (
    fromCurrency: string,
    toCurrency: string,
  ) => {
    // Show destination address field for DOT and DOTAH swaps
    return toCurrency === "DOT" || toCurrency === "DOTAH";
  };

  // Check if wallet connection is required for the current operation
  const requiresWalletConnection = () => {
    if (activeTab === "shield" || activeTab === "unshield" || activeTab === "send") {
      return true; // Always need wallet for shield/unshield
    }
    if (activeTab === "bridge") {
      // For bridge (swap), only require wallet if no destination address provided for DOT swaps
      if (
        requiresDestinationAddress(fromCurrency, toCurrency) &&
        destinationAddress.trim()
      ) {
        return false; // Have destination address, don't need wallet
      }
      return true; // Need wallet for other swaps or when no destination address
    }
    return true;
  };

  // Get bridge functionality type
  const getBridgeType = (networkKey: string) => {
    return isMainnet(networkKey) ? "swap" : "bridge";
  };

  // Get bridge title
  const getBridgeTitle = (networkKey: string) => {
    return isMainnet(networkKey) ? "Bridge & Swap" : "Bridge";
  };

  // Function to get the network name for a currency
  const getNetworkForCurrency = (currency: string) => {
    // Map specific currencies to their networks
    const currencyNetworkMap: { [key: string]: string } = {
      // Ethereum and ERC-20 tokens
      ETH: "Ethereum",
      USDCETH: "Ethereum",
      DAIETH: "Ethereum",
      USDT: "Ethereum", // Default USDT to Ethereum
      USDTETH: "Ethereum",
      WETHETH: "Ethereum",
      AAVEETH: "Ethereum",
      MANAETH: "Ethereum",
      PAXGETH: "Ethereum",
      PEPEETH: "Ethereum",
      POLETH: "Ethereum",

      // Bitcoin
      BTC: "Bitcoin",

      // BSC tokens
      ETHBSC: "BNB Smart Chain",
      BTCBSC: "BNB Smart Chain",
      DAIBSC: "BNB Smart Chain",
      USDTBSC: "BNB Smart Chain",
      WBNBBSC: "BNB Smart Chain",
      TWTBSC: "BNB Smart Chain",
      BSC: "BNB Smart Chain",
      CAKE: "BNB Smart Chain",

      // Arbitrum
      ETHARBITRUM: "Arbitrum",
      USDCARBITRUM: "Arbitrum",
      USDTARBITRUM: "Arbitrum",
      WETHARBITRUM: "Arbitrum",
      ARB: "Arbitrum",

      // Polygon
      DAIMATIC: "Polygon",
      USDTMATIC: "Polygon",
      POL: "Polygon",

      // Solana
      SOL: "Solana",
      USDCSOL: "Solana",
      USDTSOL: "Solana",
      WSOL: "Solana",

      // Base
      ETHBASE: "Base",
      WETHBASE: "Base",

      // Optimism
      ETHOP: "Optimism",

      // zkSync
      ETHZKSYNC: "zkSync",

      // OpBNB
      BNBOPBNB: "OpBNB",

      // TRON
      TRX: "TRON",
      USDTTRC: "TRON",

      // Other networks
      ATOM: "Cosmos",
      AVAX: "Avalanche",
      ADA: "Cardano",
      DOGE: "Dogecoin",
      LTC: "Litecoin",
      XRP: "Ripple",
      XLM: "Stellar",
      XTZ: "Tezos",
      VET: "VeChain",
      ETC: "Ethereum Classic",
      DASH: "Dash",
      ZEC: "Zcash",
      XMR: "Monero",
      LINK: "Chainlink",
      BAT: "Basic Attention Token",
      BCH: "Bitcoin Cash",
      BTT: "BitTorrent",
      KCS: "KuCoin",
      TON: "TON",
      APT: "Aptos",
      SHIB: "Ethereum", // SHIB is on Ethereum
      TUSD: "Ethereum", // Assuming TUSD is on Ethereum
      USDP: "Ethereum", // Assuming USDP is on Ethereum
      ZRX: "Ethereum", // 0x Protocol is on Ethereum
      S: "Unknown Network",

      // Polkadot ecosystem
      DOT: "Polkadot Assethub",
      KSM: "Kusama",
      PAS: "Paseo Testnet",
      WND: "Westend Testnet",
      DEV: "Moonbeam Testnet",
    };

    return currencyNetworkMap[currency] || "Unknown Network";
  };

  // Swap API base URL - will be deployed to public endpoint
  const SWAP_API_BASE = "/api/swap";

  // DOT/KSM price checker function
  const getDotToKsmRate = async () => {
    console.log("Starting DOT to KSM exchange rate query...");

    try {
      const POLKADOT_RPC = "wss://polkadot-asset-hub-rpc.polkadot.io/";
      const wsProvider = new WsProvider(POLKADOT_RPC);
      const api = await ApiPromise.create({
        provider: wsProvider,
        noInitWarn: true,
      });
      await api.isReady;
      console.log("✅ Connected to Polkadot Asset Hub");

      // DOT MultiLocation (on Polkadot Asset Hub)
      const dotMultiLocation = api
        .createType("StagingXcmV4Location", {
          parents: 1, // DOT is parent chain token
          interior: {
            here: null,
          },
        })
        .toU8a();

      // KSM MultiLocation (as foreign asset from Kusama)
      const ksmMultiLocation = api
        .createType("StagingXcmV4Location", {
          parents: 2, // KSM comes from Kusama (different consensus)
          interior: {
            X1: [{ GlobalConsensus: "Kusama" }],
          },
        })
        .toU8a();

      // Try to get price for 1 DOT to KSM (1 DOT = 10^10 Planck)
      const amount = api.createType("u128", 10000000000).toU8a();
      const bool = api.createType("bool", false).toU8a();

      // Concatenate Uint8Arrays
      const encodedInput = new Uint8Array(
        dotMultiLocation.length +
          ksmMultiLocation.length +
          amount.length +
          bool.length,
      );
      encodedInput.set(dotMultiLocation, 0);
      encodedInput.set(ksmMultiLocation, dotMultiLocation.length);
      encodedInput.set(
        amount,
        dotMultiLocation.length + ksmMultiLocation.length,
      );
      encodedInput.set(
        bool,
        dotMultiLocation.length + ksmMultiLocation.length + amount.length,
      );

      const encodedInputHex = u8aToHex(encodedInput);

      console.log("💱 Querying price for 1 DOT to KSM...");

      try {
        // Try exact tokens for tokens
        const response = await api.rpc.state.call(
          "AssetConversionApi_quote_price_exact_tokens_for_tokens",
          encodedInputHex,
        );
        const decodedPrice = api.createType("Option<u128>", response);

        if (decodedPrice.isSome) {
          const price = decodedPrice.unwrap();
          const ksmAmount = Number(price) / 1000000000000; // Convert Planck to KSM
          console.log(
            `✅ Exchange Rate: 1 DOT = ${price.toString()} KSM Planck`,
          );
          console.log(`✅ Exchange Rate: 1 DOT = ${ksmAmount.toFixed(6)} KSM`);

          // Also show the reverse rate
          if (ksmAmount > 0) {
            const reverseRate = 1 / ksmAmount;
            console.log(
              `✅ Exchange Rate: 1 KSM = ${reverseRate.toFixed(6)} DOT`,
            );

            await api.disconnect();
            return {
              rate: ksmAmount.toFixed(6),
              to_amount: ksmAmount.toFixed(6),
              from_amount: "1",
              from_code: "DOT",
              to_code: "KSM",
              usd_value: "0", // Not available from this API
            };
          }
        } else {
          console.log("❌ No direct DOT→KSM pool found");
        }
      } catch (error: any) {
        console.log("❌ Error querying direct price:", error.message);
        console.log(
          "💡 This is expected - DOT and KSM are on different parachains.",
        );
      }

      await api.disconnect();
      console.log("🔌 Disconnected from Polkadot Asset Hub");
    } catch (error: any) {
      console.error("❌ Error:", error.message);
    }

    // Fallback to default rate if direct query fails
    return {
      rate: "0.1", // Fallback rate
      to_amount: "0.1",
      from_amount: "1",
      from_code: "DOT",
      to_code: "KSM",
      usd_value: "0",
    };
  };

  useEffect(() => {
    if (!isWasmLoaded) {
      const loadWasm = async () => {
        try {
          //    console.log(`loading wasmm`);
          const wasmPackage = await import("./pkg/generate_zk_wasm");
          await wasmPackage.default();
          await wasmPackage.init();
          //        console.log(`workerApi ok`);
          //     console.log(`workerApi calling init`);
          //   console.log(`set worker!`);
          // Store the worker functions in state or ref for later use
          setProofWorker(wasmPackage);
          setNetwork("polkadot");
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

      // Subscribe to account changes
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
      if (!talismanEth) {
        console.warn(
          "Talisman Ethereum provider not available, continuing with Substrate-only functionality",
        );
        setSelectedWalletEVM(null);
      } else {
        const provider3 = new ethers.BrowserProvider(talismanEth);
        console.log(`selected wallet:`, talismanEth.selectedAddress);
        setSelectedWalletEVM(provider3);
        console.log(`provider3 ok`);
      }
      console.log("got talisman eth");

      //    const currentChainId = await talismanEth.request({
      //        method: "eth_chainId",
      //});
      //      console.log(`current chain is: `, currentChainId);
      //   await wallet.enable("KSMSHIELD");

      // Get accounts but don't auto-connect - let user select account through UI
      const accounts = await wallet.getAccounts();
      console.log(
        `Found ${accounts.length} accounts, waiting for user to select one`,
      );

      // Note: Don't set wallet as connected here - wait for account selection
      // The onAccountSelected callback in the UI will handle the final connection
    } catch (err) {
      console.error("Failed to enable wallet:", err);
      setError("Failed to enable wallet");
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
    // Check for either Polkadot wallet (selectedWallet) or EVM wallet (selectedWalletEVM)
    const hasWallet = selectedWallet || selectedWalletEVM;
    if (!isWalletConnected || !amount || !selectedToken || !hasWallet) {
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

    // Check if connected to the correct chain for EVM wallets
    const expectedChainId = NETWORKS[selectedNetwork]?.chain_id;
    if (
      selectedWalletEVM &&
      connectedChain &&
      expectedChainId &&
      connectedChain.id !== expectedChainId
    ) {
      toast(
        `❌ Wrong network! Please switch to ${NETWORKS[selectedNetwork].name} (Chain ID: ${expectedChainId}). You are on chain ${connectedChain.id}.`,
        {
          position: "top-right",
          autoClose: 8000,
          hideProgressBar: false,
          closeOnClick: false,
          pauseOnHover: true,
          draggable: true,
          progress: undefined,
          theme: "dark",
        },
      );
      // Try to switch chain automatically
      try {
        await switchChain({ chainId: expectedChainId });
      } catch (e) {
        console.error("Failed to switch chain:", e);
      }
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
        selectedWallet || selectedWalletEVM,
      );
      if (!isWalletConnected || !amount || !selectedToken || !hasWallet) return;

      console.log(`sign sign`);

      // Get account address from either Polkadot wallet or EVM wallet
      let accountAddress: string;
      if (selectedWallet) {
        const accounts = await selectedWallet.getAccounts();
        const account = accounts[0];
        accountAddress = account.address;
      } else {
        accountAddress = evmAddress || "";
      }
      console.log(`account: `, accountAddress);
      const secret = generatedSecret;
      //      const txdata = await gen_tx_no_sig(Number(amount), fakeerc20asset, account.address);
      //      console.log(`got tx data: `, txdata);

      console.log(`signed tx`);
      //  console.log(`westend pool:`, westend_pool);
      var shieldedContract;
      if (selectedNetwork == "kusama") {
        shieldedContract = new ethers.Contract(
          NETWORKS[selectedNetwork].shield_address,
          NETWORKS[selectedNetwork].abi,
          ETHsigner,
        );
      } else if (selectedNetwork == "westend_assethub") {
        console.log(`westend`);
        sendamount = ethers.parseUnits(amount, 12);
        shieldedContract = new ethers.Contract(
          SHIELD_CONTRACT_ADDRESS.SHIELD_CONTRACT_ADDRESS,
          SHIELD_CONTRACT_ADDRESS.shielderAbi,
          ETHsigner,
        );
      } else if (selectedNetwork == "paseo_assethub") {
        console.log(`paseo assethub:`, NETWORKS["paseo_assethub"].shield_address);
        shieldedContract = new ethers.Contract(
          NETWORKS["paseo_assethub"].shield_address,
          NETWORKS["paseo_assethub"].abi,
          ETHsigner,
        );
      } else if (selectedNetwork == "polkadot") {
        console.log(`polkadot contract initialized`);
        shieldedContract = new ethers.Contract(
          NETWORKS["polkadot"].shield_address,
          NETWORKS["polkadot"].abi,
          ETHsigner,
        );
      } else {
        throw new Error(
          "Only Paseo, Polkadot, Westend AssetHub, and Kusama AssetHub are currently supported",
        );
      }

      // move to seperate functions
      if (NETWORKS[selectedNetwork].asset == selectedToken) {
        console.log(`native token!`);
      } else {
        // console.log(`token set to: `, )
        // console.log(`network token: ${}`);
        // Create contract instance
        console.log(`redefining tokenContract`);
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

        const approvalExplorerUrl = NETWORKS[selectedNetwork]?.block_explorer;
        toast(
          <div>
            Approval submitted:{" "}
            {approvalExplorerUrl ? (
              <a
                href={`${approvalExplorerUrl}/tx/${txResponse.hash}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "#58a6ff", textDecoration: "underline" }}
              >
                {txResponse.hash}
              </a>
            ) : (
              txResponse.hash
            )}
          </div>,
          {
            position: "top-right",
            autoClose: 8000,
            hideProgressBar: false,
            closeOnClick: false,
            pauseOnHover: true,
            draggable: true,
            progress: undefined,
            theme: "dark",
          },
        );
        // 8. Wait for confirmation
        const receipt = await txResponse.wait();
        setRecentGasUnits((prev) => ({
          ...prev,
          [selectedNetwork]: {
            ...prev[selectedNetwork],
            shield: receipt.gasUsed,
          },
        }));

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
      let nullifierVal, secretVal, nullifierHash;
      if (selectedNetwork == "westend_assethub") {
        x = ProofWorker.generate_commitment(secret); //await generateCommitment(secret);
      } else if (selectedNetwork == "paseo_assethub_v2") {
        // FixedIlopPhase2Paseo_v3: commitment = Poseidon3(secret, asset, amount)
        // nullifier = Poseidon2(secret, 1) - domain separator
        const assetNumeric = 0n; // native token = 0
        const amountWei = BigInt(ethers.parseEther(amount));
        secretVal = BigInt(secret);
        nullifierVal = poseidon2([secretVal, 1n]);
        const commitmentBigInt = poseidon3([
          secretVal,
          assetNumeric,
          amountWei,
        ]);
        x = ethers.toBeHex(commitmentBigInt);
        nullifierHash = ethers.toBeHex(nullifierVal);
        console.log(`paseo v2 commitment:`, x);
        console.log(`paseo v2 nullifierHash:`, nullifierHash);
        console.log(`Save for withdrawal - secret: ${secretVal.toString()}`);
      } else if (
        selectedNetwork == "paseo_assethub" ||
        selectedNetwork == "polkadot"
      ) {
        // FixedIlop V5/V7 deposit: uses CommitmentHasher circuit logic
        const selectedAsset = userAssets.find(
          (a) => a.symbol === selectedToken,
        );
        const assetNumeric = selectedAsset ? BigInt(selectedAsset.assetId) : 0n;
        const decimals = selectedAsset ? selectedAsset.decimals : 18;
        const depositAmount = BigInt(ethers.parseUnits(amount, decimals));
        // Derive nullifier and secret matching the v7 circuit:
        // nullifier = Poseidon2(secret, 1), secret = raw secret (not keccak-derived)
        const secretBN = BigInt(secret);
        const nullifierVal = poseidon2([secretBN, 1n]);
        const secretVal = secretBN;
        // Compute commitment: Poseidon( Poseidon(amount, asset), Poseidon(nullifier, secret) )
        const precommitment = poseidon2([nullifierVal, secretVal]);
        const valueAssetHash = poseidon2([depositAmount, assetNumeric]);
        const commitmentBigInt = poseidon2([valueAssetHash, precommitment]);
        // Compute nullifierHash = Poseidon(nullifier) — this is the key stored in deposits mapping
        const nullifierHashBN = poseidon1([nullifierVal]);
        const commitment = ethers.toBeHex(commitmentBigInt, 32);
        nullifierHash = ethers.toBeHex(nullifierHashBN, 32);
        console.log(`=== Paseo V7 Deposit Debug ===`);
        console.log(`Secret input: "${secret}"`);
        console.log(`Secret (BigInt):`, secretBN.toString());
        console.log(
          `Derived nullifierVal (poseidon2(secret, 1)):`,
          nullifierVal.toString(),
        );
        console.log(`secretVal (raw secret):`, secretVal.toString());
        console.log(`Asset numeric:`, assetNumeric.toString());
        console.log(`Deposit amount (wei):`, depositAmount.toString());
        console.log(
          `Precommitment (poseidon2(nullifier, secret)):`,
          precommitment.toString(),
        );
        console.log(
          `ValueAssetHash (poseidon2(amount, asset)):`,
          valueAssetHash.toString(),
        );
        console.log(`Commitment BigInt:`, commitmentBigInt.toString());
        console.log(`Commitment (hex):`, commitment);
        console.log(`Nullifier hash BigInt:`, nullifierHashBN.toString());
        console.log(`Nullifier hash (hex):`, nullifierHash);
        console.log(`================================`);
        x = commitment;
      } else if (selectedNetwork == "paseo_assethub") {
        // FixedIlop: commitment = Poseidon3(value, asset, Poseidon2(nullifier, secret))
        // Generate nullifier and secret from the user-provided secret
        // We derive both from the single secret input for UX simplicity
        const nullifierVal = BigInt(secret);
        const secretVal =
          BigInt(ethers.keccak256(ethers.toUtf8Bytes(secret + "_secret"))) %
          2n ** 250n;
        const assetNumeric = 0n; // native token = ZeroAddress = 0
        const amountWei = BigInt(ethers.parseEther(amount));
        const innerHash = poseidon2([nullifierVal, secretVal]);
        const commitmentBigInt = poseidon3([
          amountWei,
          assetNumeric,
          innerHash,
        ]);
        x = ethers.toBeHex(commitmentBigInt);
        console.log(`paseo FixedIlop commitment:`, x);
        console.log(
          `nullifier:`,
          nullifierVal.toString(),
          `derived secret:`,
          secretVal.toString(),
        );
        console.log(
          `Save these for withdrawal — nullifier: ${nullifierVal.toString()}, secret: ${secretVal.toString()}`,
        );
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
            */
        console.log(`calling abi66`);
        console.log(`sending paseo deposit`);
        if (selectedNetwork == "polkadot") {
          const commitmentBytes = ethers.zeroPadValue(ethers.toBeArray(BigInt(x)), 32);
          const nullifierBytes = ethers.zeroPadValue(ethers.toBeArray(BigInt(nullifierHash)), 32);
          const depositAmount = ethers.parseEther(amount);
          console.log(
            `Sending polkadot depositNative with params:`,
            {
              commitment: x,
              nullifierHash: nullifierHash,
              amount: depositAmount.toString(),
            },
          );
          var gasEstimate;
          try {
            gasEstimate = await shieldedContract.depositNative.estimateGas(
              commitmentBytes,
              nullifierBytes,
              { value: depositAmount },
            );
            console.log("Gas estimate:", gasEstimate);
          } catch (e) {
            console.error("Estimation failed:", e);
          }
          txResponse2 = await shieldedContract.depositNative(
            commitmentBytes,
            nullifierBytes,
            {
              value: depositAmount,
              gasLimit: gasEstimate || 5000000,
            },
          );
        } else if (selectedNetwork == "paseo_assethub") {
          // v7: depositNative(bytes32 commitment) — single param
          const commitmentBytes = ethers.zeroPadValue(ethers.toBeArray(BigInt(x)), 32);
          const depositAmount = ethers.parseEther(amount);
          console.log("Sending v7 depositNative with params:", {
            commitment: x,
            amount: depositAmount.toString(),
          });

          var gasEstimate;
          try {
            gasEstimate = await shieldedContract.depositNative.estimateGas(
              commitmentBytes,
              { value: depositAmount },
            );
            console.log("Gas estimate:", gasEstimate);
          } catch (e) {
            console.error("Estimation failed:", e);
          }

          txResponse2 = await shieldedContract.depositNative(
            commitmentBytes,
            {
              value: depositAmount,
              gasLimit: gasEstimate || 5000000,
            },
          );
        } else if (selectedNetwork == "paseo_assethub_v2") {
          // FixedIlopPhase2Paseo_v3: depositNative(bytes32 commitment, bytes32 nullifierHash)
          const commitmentBytes = ethers.zeroPadValue(ethers.toBeArray(BigInt(x)), 32);
          const nullifierBytes = ethers.zeroPadValue(ethers.toBeArray(BigInt(nullifierHash)), 32);
          const depositAmount = ethers.parseEther(amount);
          console.log("Sending paseo v2 depositNative with params:", {
            commitment: x,
            nullifierHash: nullifierHash,
            amount: depositAmount.toString(),
          });

          var gasEstimate;
          try {
            gasEstimate = await shieldedContract.depositNative.estimateGas(
              commitmentBytes,
              nullifierBytes,
              { value: depositAmount },
            );
            console.log("Gas estimate:", gasEstimate);
          } catch (e) {
            console.error("Estimation failed:", e);
          }

          txResponse2 = await shieldedContract.depositNative(
            commitmentBytes,
            nullifierBytes,
            {
              value: depositAmount,
              gasLimit: gasEstimate,
            },
          );
} else if (selectedNetwork == "paseo_assethub") {
          // FixedIlop: deposit(address asset, uint256 amount, uint256 commitment)
          const commitmentUint256 = BigInt(x);
          const depositAmount = ethers.parseEther(amount);
          console.log("Sending FixedIlop deposit with params:", {
            token: ethers.ZeroAddress,
            amount: depositAmount.toString(),
            commitment: commitmentUint256.toString(),
          });

          var gasEstimate;
          try {
            gasEstimate = await shieldedContract.deposit.estimateGas(
              ethers.ZeroAddress,
              depositAmount,
              commitmentUint256,
              { value: depositAmount },
            );
            console.log("Gas estimate:", gasEstimate);
          } catch (e) {
            console.error("Estimation failed:", e);
          }

          txResponse2 = await shieldedContract.deposit(
            ethers.ZeroAddress,
            depositAmount,
            commitmentUint256,
            {
              value: depositAmount,
              gasLimit: gasEstimate,
            },
          );
        } else if (
          selectedNetwork == "paseo_assethub2" ||
          selectedNetwork == "kusama"
        ) {
          console.log(`paseo v2 called`);
          const contractpase = new ethers.Contract(
            NETWORKS[selectedNetwork].shield_address,
            NETWORKS[selectedNetwork].abi, //["function deposit(address,uint256,bytes32) payable"],
            ETHsigner,
          );
          toast(`Generating ZK data`, {
            position: "top-right",
            autoClose: 4000,
            hideProgressBar: false,
            closeOnClick: false,
            pauseOnHover: true,
            draggable: true,
            progress: undefined,
            theme: "dark",
          });

          const zkpService = new ZKPService();
          const payloaden = zkpService.generateDepositPayload(
            secret,
            ethers.ZeroAddress,
            BigInt(ethers.parseEther(amount).toString()),
          );

          /*
          const { commitment, nullifier } = await zkDeposit(
            secret,
            ethers.ZeroAddress,
            ethers.parseEther(amount).toString(),
          );
*/
          const gasEstimate = await contractpase.deposit3.estimateGas(
            ethers.ZeroAddress,
            ethers.parseEther(amount),
            payloaden.commitment,
            {
              value: ethers.parseEther(amount),
            },
          );
          console.log(`gas estimate is: `, gasEstimate);

          //console.log(`raw n and c: `, nul)
          console.log(
            `full input: `,
            ethers.ZeroAddress,
            ethers.parseEther(amount),
            payloaden.commitment,
            {
              value: ethers.parseEther(amount),
              //       maxFeePerGas: gasEstimate,
              //       gasPrice: ethers.parseUnits("1000", "wei"),
              //      type: 0,
            },
          );
          console.log(`paseo v2 txresp`);
          txResponse2 = await contractpase.deposit3(
            ethers.ZeroAddress,
            ethers.parseEther(amount),
            payloaden.commitment,
            {
              value: ethers.parseEther(amount),
              //     maxFeePerGas: gasEstimate,
              //     gasPrice: ethers.parseUnits("1000", "wei"),
              //    type: 0,
            },
          );
        }

        console.log(`deposit ok`);
      } else if (
        selectedNetwork == "paseo_assethub" ||
        selectedNetwork == "paseo_assethub_v2" ||
        selectedNetwork == "polkadot"
      ) {
        // Pallet asset deposit for Paseo v3/v2 and Polkadot
        const selectedAsset = userAssets.find(
          (a) => a.symbol === selectedToken,
        );
        if (!selectedAsset) {
          throw new Error(
            `Asset ${selectedToken} not found. Please connect wallet on ${NETWORKS[selectedNetwork].name} and ensure you hold the asset.`,
          );
        }

        const assetId = selectedAsset.assetId;
        const decimals = selectedAsset.decimals;
        const depositAmount = ethers.parseUnits(amount, decimals);
        const commitmentBytes = ethers.zeroPadValue(ethers.toBeArray(BigInt(x)), 32);
        const nullifierBytes = ethers.zeroPadValue(ethers.toBeArray(BigInt(nullifierHash)), 32);

        console.log(
          `Sending paseo ${selectedNetwork.includes("v3") ? "v3" : "v2"} depositAsset:`,
          {
            assetId,
            amount: depositAmount.toString(),
            decimals,
            commitment: x,
            nullifierHash: nullifierHash,
          },
        );

        // Get precompile address
        const assetIdHex = assetId.toString(16).padStart(8, "0");
        const precompileAddress = `0x${assetIdHex}00000000000000000000000001200000`;

        // Approve pool to spend tokens
        const ERC20_ABI = ["function approve(address, uint256) returns (bool)"];
        const tokenContract = new ethers.Contract(
          precompileAddress,
          ERC20_ABI,
          ETHsigner,
        );

        toast(`Approving ${selectedToken}...`, {
          position: "top-right",
          autoClose: 3000,
          theme: "dark",
        });
        const approveTx = await tokenContract.approve(
          NETWORKS[selectedNetwork].shield_address,
          depositAmount,
          { gasLimit: 500000 },
        );
        await approveTx.wait();
        console.log(`✅ ${selectedToken} approved`);

        // Deposit
        var gasEstimate;
        try {
          gasEstimate = await shieldedContract.depositAsset.estimateGas(
            assetId,
            depositAmount,
            commitmentBytes,
            nullifierBytes,
          );
          console.log("Gas estimate:", gasEstimate);
        } catch (e) {
          console.error("Estimation failed:", e);
        }

        txResponse2 = await shieldedContract.depositAsset(
          assetId,
          depositAmount,
          commitmentBytes,
          nullifierBytes,
          { gasLimit: gasEstimate || 2000000 },
        );
        console.log(`pallet asset deposit ok`);
      } else {
        console.log(`merp merp`);
        txResponse2 = await shieldedContract.deposit(
          SHIELD_CONTRACT_ADDRESS.fakeerc20asset,
          ethers.parseEther(amount),
          x,
        );
      }

      const explorerUrl = NETWORKS[selectedNetwork]?.block_explorer;
      toast(
        <div>
          Transaction submitted:{" "}
          {explorerUrl ? (
            <a
              href={`${explorerUrl}/tx/${txResponse2.hash}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "#58a6ff", textDecoration: "underline" }}
            >
              {txResponse2.hash}
            </a>
          ) : (
            txResponse2.hash
          )}
        </div>,
        {
          position: "top-right",
          autoClose: 8000,
          hideProgressBar: false,
          closeOnClick: false,
          pauseOnHover: true,
          draggable: true,
          progress: undefined,
          theme: "dark",
        },
      );
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
    console.log(`setNetwork called, input:`, networkKey);

    // Increment request ID to cancel any in-flight queries
    const requestIdAtSwitch = ++queryRequestIdRef.current;
    console.log(`setNetwork: incrementing request ID to ${requestIdAtSwitch} to cancel stale queries`);

    // Disconnect any existing Substrate API before switching
    if (substrateApiRef.current || substrateProviderRef.current) {
      console.log("Cleaning up old Substrate connection before switch...");
      try {
        // Try multiple times to ensure cleanup
        if (substrateApiRef.current) {
          await substrateApiRef.current.disconnect();
        }
        if (substrateProviderRef.current) {
          await substrateProviderRef.current.disconnect();
          // Force close the WebSocket
          const ws = substrateProviderRef.current._ws;
          if (ws && ws.close) {
            ws.close(1000, "Manual disconnect");
          }
        }
      } catch (e) {
        console.warn("Failed to disconnect old API on network switch:", e);
      }
      substrateApiRef.current = null;
      substrateProviderRef.current = null;
      console.log("Old Substrate connection cleaned up");
    } else {
      console.log("No existing Substrate connection to clean up");
    }

    try {
      setIsLoading(true);
      setError(null);

      // Display loading toast
      toast.info(`Switching to ${NETWORKS[networkKey].name}...`, {
        position: "top-right",
        autoClose: 2000,
        hideProgressBar: false,
        closeOnClick: false,
        pauseOnHover: true,
        draggable: true,
        progress: undefined,
        theme: "dark",
      });

      // Update the selected network in app state (this always works)
      setSelectedNetwork(networkKey);
      setSelectedToken(NETWORKS[networkKey].asset);

      // Clear any previous errors
      setError(null);

      // Display success toast
      toast.success(`Successfully switched to ${NETWORKS[networkKey].name}`, {
        position: "top-right",
        autoClose: 3000,
        hideProgressBar: false,
        closeOnClick: false,
        pauseOnHover: true,
        draggable: true,
        progress: undefined,
        theme: "dark",
      });

      // If wallet is connected, try to switch wallet network as well
      const talismanEth = (window as any).talismanEth;
      if (isWalletConnected && talismanEth && NETWORKS[networkKey].chain_id) {
        console.log("Attempting to switch wallet network...");
        const targetChainId = `0x${NETWORKS[networkKey].chain_id?.toString(16)}`;

        try {
          await talismanEth.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: targetChainId }],
          });
          console.log("Wallet network switched successfully");
        } catch (switchError: any) {
          console.log("Wallet network switch error:", switchError);

          if (switchError.code === 4902) {
            // Try to add the network to the wallet
            try {
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
              console.log("Network added to wallet successfully");
            } catch (addError) {
              console.warn("Failed to add network to wallet:", addError);
              toast.warn(
                "Network switched in app, but couldn't update wallet. You may need to manually switch networks in your wallet.",
                {
                  position: "top-right",
                  autoClose: 5000,
                  hideProgressBar: false,
                  closeOnClick: true,
                  pauseOnHover: true,
                  draggable: true,
                  progress: undefined,
                  theme: "dark",
                },
              );
            }
          } else {
            console.warn("Failed to switch wallet network:", switchError);
            toast.warn(
              "Network switched in app, but couldn't update wallet. You may need to manually switch networks in your wallet.",
              {
                position: "top-right",
                autoClose: 5000,
                hideProgressBar: false,
                closeOnClick: true,
                pauseOnHover: true,
                draggable: true,
                progress: undefined,
                theme: "dark",
              },
            );
          }
        }
      } else if (
        isWalletConnected &&
        wagmiConnected &&
        NETWORKS[networkKey].chain_id
      ) {
        // Use wagmi's switchChain for MetaMask/WalletConnect connections
        console.log("Attempting to switch network via wagmi...");
        try {
          await switchChain({ chainId: NETWORKS[networkKey].chain_id });
          console.log("Network switched successfully via wagmi");
        } catch (switchError: any) {
          console.warn("Failed to switch network via wagmi:", switchError);
          // If chain not added, wagmi will prompt to add it automatically
          toast.warn(
            "Network switched in app, but couldn't update wallet. You may need to manually switch networks in your wallet.",
            {
              position: "top-right",
              autoClose: 5000,
              hideProgressBar: false,
              closeOnClick: true,
              pauseOnHover: true,
              draggable: true,
              progress: undefined,
              theme: "dark",
            },
          );
        }
      } else if (!talismanEth && isWalletConnected && !wagmiConnected) {
        console.log(
          "Wallet connected but no Ethereum provider available for network switching",
        );
      }
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

      try {
        console.log(`generating proofo`);

        // if we manage to load the
        if (ProofWorker) {
          var proofBytes;
          if (
            selectedNetwork == "westend_assethub" ||
            selectedNetwork == "paseo_assethub2" ||
            selectedNetwork == "kusama" ||
            selectedNetwork == "paseo_assethub" ||
            selectedNetwork == "paseo_assethub_v2" ||
            selectedNetwork == "paseo_assethub" ||
            selectedNetwork == "polkadot"
          ) {
            proofBytes = "not set ";
          } else {
            const p = await fetchKzgParams(
              "http://kusamashield.laissez-faire.trade/proofs/hermez-raw-8",
            ); //params8.bin
            console.log(`params fetched ok`);
            console.log("Params length:", p.length);

            console.log(`generating proof`);

            toast(`🔐 Generating ZK proof...`, {
              position: "top-right",
              autoClose: false,
              hideProgressBar: false,
              closeOnClick: false,
              pauseOnHover: true,
              draggable: true,
              progress: undefined,
              theme: "dark",
            });

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
          } else if (
            selectedNetwork == "polkadot"  // OLD v3/polkadot path only
          ) {
            console.log(
              `paseo assethub v3/polkadot (Phase 2 ZK - 6 signals): `,
              NETWORKS[selectedNetwork].shield_address,
            );
            shieldedContract = new ethers.Contract(
              NETWORKS[selectedNetwork].shield_address,
              NETWORKS[selectedNetwork].abi,
              ETHsigner,
            );
            console.log(`paseo v3/polkadot contract initialized`);
          } else if (selectedNetwork == "paseo_assethub_v2") {
            console.log(`paseo v2 (Phase 2 ZK) withdraw`);
            shieldedContract = new ethers.Contract(
              NETWORKS["paseo_assethub_v2"].shield_address,
              NETWORKS["paseo_assethub_v2"].abi,
              ETHsigner,
            );
          } else if (selectedNetwork == "paseo_assethub") {
            // v7 FixedIlop withdraw — uses NETWORKS["paseo_assethub"] ABI (8-signal withdraw)
            console.log(`paseo_assethub: using NEW v7 FixedIlop withdraw path`);
            shieldedContract = new ethers.Contract(
              NETWORKS["paseo_assethub"].shield_address,
              NETWORKS["paseo_assethub"].abi,
              ETHsigner,
            );
          } else if (
            //    selectedNetwork == "paseo_assethub" ||
            selectedNetwork == "kusama"
          ) {
            console.log(`doubel shield`);
            shieldedContract = new ethers.Contract(
              NETWORKS[selectedNetwork].shield_address,
              NETWORKS[selectedNetwork].abi,
              ETHsigner,
            );
          } else {
            console.log(`else contract init`);
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
          if (selectedNetwork == "westend_assethub") {
            //function withdraw2(uint[2], uint[2][2], unit[2], uint[3], uint256, bytes32)
            const datn = await generateCommitment(secret);
            console.log(`calling with datn: `, datn);

            console.log(` datn[0]: `, datn[0]);
            console.log(` datn[1]: `, datn[1]);
            console.log(` datn[2]: `, datn[2]);
            //console.log(`p4: `, p4);
            var gasestimate;
            try {
              gasestimate = await shieldedContract.withdraw.estimateGas(
                datn[0],
                datn[1],
                datn[2],
                datn[3], //proof.publicSignals,
                myasset,
                ethers.parseEther(amount),
                nullifier,
              );
              console.log(`got gasestimate: `, gasestimate);
            } catch (e) {
              console.error(`got estimate error:`, e);
            }

            console.log(`nullifier: `, nullifier);
            txResponse = await shieldedContract.withdraw(
              datn[0],
              datn[1],
              datn[2],
              datn[3], //proof.publicSignals,
              myasset,
              ethers.parseEther(amount),
              nullifier,
              {
                maxFeePerGas: gasestimate,
                gasPrice: ethers.parseUnits("1000", "wei"),
                type: 0,
              },
            );
          } else if (selectedNetwork === "paseo_assethub") {
            // FixedIlop v7 withdraw: UTXO model with nullifier+secret pairs
            // Match the SDK's derivation: nullifier = Poseidon2(secret, 1)
            const recipient = evmAddress;
            if (!recipient) throw new Error("No wallet address connected");
            const withdrawAmount = ethers.parseEther(amount);

            // Derive nullifier and secret from user input (v7 circuit expects Poseidon2)
            const secretBN = BigInt(secret);
            const existingNullifier = poseidon2([secretBN, 1n]).toString();
            const existingSecret = secret; // Pass secret directly to circuit

            // Connect to contract for pre-checks and tree data
            const checkContract = new ethers.Contract(
              NETWORKS["paseo_assethub"].shield_address,
              NETWORKS["paseo_assethub"].abi,
              ETHsigner,
            );

            // Pre-check: check nullifier hasn't been spent
            // Circuit uses Poseidon1(nullifier) for nullifierHash
            const nullifierHash = poseidon1([BigInt(existingNullifier)]);
            const nullifierHashBytes32 = ethers.zeroPadValue(
              ethers.toBeArray(nullifierHash),
              32,
            );
            const nullifierSpent =
              await checkContract.isNullifierSpent(nullifierHashBytes32);
            if (nullifierSpent) {
              toast(`Already withdrawn! This nullifier has been spent.`, {
                position: "top-right",
                autoClose: 5000,
                theme: "dark",
              });
              throw new Error("Nullifier already spent");
            }

            // Check escrow has funds (v7 uses getEscrowBalance instead of escrow)
            const escrowBalance = await checkContract.getEscrowBalance(
              ethers.ZeroAddress,
            );
            console.log(`Escrow balance:`, ethers.formatEther(escrowBalance));
            if (escrowBalance < withdrawAmount) {
              toast(`Insufficient pool balance for withdrawal`, {
                position: "top-right",
                autoClose: 5000,
                theme: "dark",
              });
              throw new Error("Insufficient escrow balance");
            }

            // Build Merkle tree from contract events
            toast(`Rebuilding Merkle tree from on-chain data...`, {
              position: "top-right",
              autoClose: 4000,
              theme: "dark",
            });
            const provider = ETHsigner.provider;
            if (!provider) throw new Error("No provider available");

            const merkleTree = await buildMerkleTreeFromContract(
              provider,
              NETWORKS["paseo_assethub"].shield_address,
              NETWORKS["paseo_assethub"].abi,
              true,
              NETWORKS["paseo_assethub"].rpcEndpoint,
              NETWORKS["paseo_assethub"].deploymentBlock || 0,
            );

            // Find our commitment in the tree
            // We need to reconstruct the commitment to find the leaf
            // For a full withdrawal, existingValue = withdrawAmount (withdraw everything)
            const assetNumeric = 0n; // native token

            // Recalculate commitment the same way as deposit:
            // precommitment = Poseidon2(nullifier, secret)
            // valueAssetHash = Poseidon2(amount, asset)
            // commitment = Poseidon2(valueAssetHash, precommitment)

            console.log(`=== Paseo V5 Withdrawal Debug ===`);
            console.log(`Secret input: "${secret}"`);
            console.log(`Existing nullifier:`, existingNullifier);
            console.log(`Existing secret:`, existingSecret);
            console.log(`Withdraw amount (wei):`, withdrawAmount.toString());

            const precommitment = poseidon2([
              BigInt(existingNullifier),
              BigInt(existingSecret),
            ]);
            const existingValue = withdrawAmount; // assume full withdrawal for now
            const valueAssetHash = poseidon2([existingValue, assetNumeric]);
            const commitment = poseidon2([valueAssetHash, precommitment]);

            console.log(
              `Precommitment (poseidon2(nullifier, secret)):`,
              precommitment.toString(),
            );
            console.log(
              `ValueAssetHash (poseidon2(amount, asset)):`,
              valueAssetHash.toString(),
            );
            console.log(`Commitment BigInt:`, commitment.toString());
            console.log(`================================`);

            const leafIdx = merkleTree.findLeafIndex(commitment);
            if (leafIdx === -1) {
              console.log(`=== Commitment Not Found Debug ===`);
              console.log(`Looking for commitment:`, commitment.toString());
              console.log(`Tree size:`, merkleTree.size);
              console.log(`Tree root:`, merkleTree.root);

              // Log first few leaves to see what's in the tree
              const maxLeavesToShow = Math.min(10, merkleTree.size);
              console.log(
                `First ${maxLeavesToShow} leaves in tree (from leaves array):`,
              );
              // Access the leaves array if available
              if ((merkleTree as any).leaves) {
                const leaves = (merkleTree as any).leaves;
                for (let i = 0; i < maxLeavesToShow; i++) {
                  const leaf = leaves[i];
                  console.log(`  Leaf ${i}:`, leaf ? leaf.toString() : "null");
                }
              } else {
                console.log(`  Cannot access leaves array`);
              }

              // Also check if commitment exists with different formatting
              console.log(
                `Checking if commitment exists as hex:`,
                ethers.toBeHex(commitment, 32),
              );
              console.log(`================================`);

              toast(
                `Commitment not found in Merkle tree. Verify your secret and amount.`,
                { position: "top-right", autoClose: 8000, theme: "dark" },
              );
              throw new Error("Commitment not found in tree");
            }

            const merkleProof = await merkleTree.getProof(leafIdx);
            console.log(
              `Merkle proof obtained. Leaf index: ${leafIdx}, Tree depth: ${merkleProof.depth}`,
            );

            // Get tree state from contract
            const currentRoot = await checkContract.currentRoot();
            const contractTreeSize = await checkContract.treeSize();
            console.log(
              `Contract root: ${currentRoot}, size: ${contractTreeSize}, local root: ${merkleTree.root}, local size: ${merkleTree.size}`,
            );

            // Validate local tree size matches contract
            // FOR V5 PASEO: Skip size validation because events are missing/incomplete
            if (selectedNetwork === "paseo_assethub") {
              console.warn(
                `⚠️ Paseo V5: Local tree size (${merkleTree.size}) doesn't match contract (${contractTreeSize}). Events may be missing. Proceeding anyway...`,
              );
              // Don't throw error, just warn
            } else if (merkleTree.size !== Number(contractTreeSize)) {
              console.error(
                `Tree size mismatch! Local: ${merkleTree.size}, Contract: ${contractTreeSize}. Events may be missing or incorrectly parsed.`,
              );
              toast(
                `Tree reconstruction error: expected ${contractTreeSize} leaves but found ${merkleTree.size}. Please try again.`,
                { position: "top-right", autoClose: 8000, theme: "dark" },
              );
              throw new Error(
                `Tree size mismatch: local ${merkleTree.size} vs contract ${contractTreeSize}`,
              );
            }

            // For V5 Paseo: Use contract root since our tree reconstruction is incomplete
            // For v7 Paseo: Use contract root (local tree may have more leaves due to better event parsing)
            const rootToUse =
              selectedNetwork === "paseo_assethub"
                ? currentRoot.toString()
                : merkleTree.root.toString();

            console.log(
              `Using root: ${rootToUse} (${selectedNetwork === "paseo_assethub" ? "contract root" : "local root"})`,
            );

            // Only validate root match for v5/v6 (not v7 where we use contract root directly)
            if (selectedNetwork !== "paseo_assethub") {
              const isValidRoot = rootToUse === currentRoot.toString();
              if (!isValidRoot) {
                console.error(
                  `Root mismatch: using ${rootToUse} but contract has ${currentRoot}.`,
                );
                toast(
                  `Merkle tree reconstruction failed — root does not match contract.`,
                  { position: "top-right", autoClose: 8000, theme: "dark" },
                );
                throw new Error(
                  "Local Merkle root does not match contract current root",
                );
              }
              console.log(
                `Root ${rootToUse} matches contract current root. Depth: ${Math.ceil(Math.log2(merkleTree.size))}`,
              );
            } else {
              console.log(
                `Using contract root ${rootToUse} for ${selectedNetwork}`,
              );
            }

            // Store root and depth for proof generation
            // For v7, use contract root (merkleTree.root may differ due to pruning)
            const isPaseoV7 = selectedNetwork === "paseo_assethub";
            const rootToUseForProof = isPaseoV7 ? currentRoot.toString() : merkleTree.root.toString();
            const localRoot = isPaseoV7 ? BigInt(rootToUseForProof) : merkleTree.root;
            const localDepth = Math.ceil(Math.log2(merkleTree.size));

            // Compute context = keccak256(abi.encodePacked(recipient, asset)) % SNARK_SCALAR_FIELD
            const SNARK_SCALAR_FIELD =
              21888242871839275222246405745257275088548364400416034343698204186575808495617n;
            const contextHash = ethers.keccak256(
              ethers.solidityPacked(
                ["address", "address"],
                [recipient, ethers.ZeroAddress],
              ),
            );
            const context = (
              BigInt(contextHash) % SNARK_SCALAR_FIELD
            ).toString();

            // Generate fresh nullifier+secret for change UTXO (v7 uses Poseidon2 derivation)
            // nullifier = Poseidon2(secret, 1), secret = random 32 bytes
            const newSecretRaw = ethers.randomBytes(32);
            const newSecret = ethers.hexlify(newSecretRaw);
            const newNullifier = poseidon2([BigInt(newSecret), 1n]).toString();

            const proofToastId = toast.loading(
              `🔐 Generating ZK proof — this may take up to a minute...`,
              { position: "top-right", theme: "dark" },
            );

            // Generate the Groth16 proof — use LOCAL root & depth (consistent with local siblings)
            // For paseo_assethub (v7), use v7 circuit with 8 public signals
            let proofResult;
            try {
              proofResult = await zkWithdraw(
                {
                  withdrawnValue: existingValue.toString(), // withdraw full amount
                  root: localRoot.toString(),
                  treeDepth: localDepth.toString(),
                  context,
                  asset: "0", // native token
                  existingValue: existingValue.toString(),
                  existingNullifier,
                  existingSecret,
                  newNullifier,
                  newSecret,
                  siblings: merkleProof.siblings,
                  leafIndex: leafIdx.toString(),
                },
                {
                  padTo7Signals: false, // v7 has 8 signals, v5/v6 have 7
                  useV7Circuit: isPaseoV7,
                },
              );
              toast.update(proofToastId, {
                render: `✅ ZK proof generated!`,
                type: "success",
                isLoading: false,
                autoClose: 5000,
              });
            } catch (proofErr) {
              toast.update(proofToastId, {
                render: `❌ Proof generation failed`,
                type: "error",
                isLoading: false,
                autoClose: 8000,
              });
              throw proofErr;
            }

            console.log(
              `ZK proof generated. Public signals:`,
              proofResult.publicSignals,
            );

            // calldata format: [a, b, c, pubSignals]
            const [a, b, c, pubSignals] = proofResult.calldata;

            // staticCall pre-check - v7 has different ABI (no asset/amount params)
            try {
              const staticCallFunction = useProxyWithdraw
                ? shieldedContract.proxy_withdraw.staticCall
                : shieldedContract.withdraw.staticCall;
              
              if (isPaseoV7) {
                // v7: 8 public signals, no asset/amount params
                await staticCallFunction(
                  a,
                  b,
                  c,
                  pubSignals.slice(0, 8), // ensure 8 signals
                  recipient,
                );
              } else {
                // v5/v6: 7 public signals with asset/amount params
                await staticCallFunction(
                  a,
                  b,
                  c,
                  pubSignals,
                  ethers.ZeroAddress,
                  withdrawAmount,
                  recipient,
                );
              }
              console.log(`staticCall succeeded`);
            } catch (staticError: any) {
              console.error(
                `staticCall failed:`,
                staticError.reason || staticError.message,
              );
            }

            // Show notification if using proxy withdraw
            if (useProxyWithdraw) {
              console.log(`=== Proxy Withdraw Debug ===`);
              console.log(`Using proxy_withdraw function`);
              console.log(`Asset address:`, ethers.ZeroAddress);
              console.log(`Amount:`, withdrawAmount.toString());
              console.log(`Recipient:`, recipient);
              console.log(`pubSignals length:`, pubSignals.length);
              console.log(`pubSignals:`, pubSignals);
              console.log(`============================`);

              toast(
                `🔀 Using Proxy Withdraw (routes through forwarder contract)`,
                {
                  position: "top-right",
                  autoClose: 5000,
                  theme: "dark",
                },
              );
            }

            // Use proxy_withdraw if checkbox is checked, otherwise use regular withdraw
            const withdrawFunction = useProxyWithdraw
              ? shieldedContract.proxy_withdraw
              : shieldedContract.withdraw;

            console.log(`=== Transaction Call Debug ===`);
            console.log(
              `Function:`,
              useProxyWithdraw ? "proxy_withdraw" : "withdraw",
            );
            console.log(`Parameters:`);
            console.log(`  a:`, a);
            console.log(`  b:`, b);
            console.log(`  c:`, c);
            console.log(`  pubSignals:`, pubSignals);
            
            if (isPaseoV7) {
              // v7: 8 public signals, no asset/amount params
              console.log(`  pubSignals[3] (withdrawnValue):`, pubSignals[3]);
              console.log(`  pubSignals[7] (asset):`, pubSignals[7]);
              console.log(`  recipient:`, recipient);
              console.log(`=============================`);
              
              txResponse = await withdrawFunction(
                a,
                b,
                c,
                pubSignals.slice(0, 8), // ensure 8 signals
                recipient,
              );
            } else {
              // v5/v6: 7 public signals with asset/amount params
              console.log(`  asset:`, ethers.ZeroAddress);
              console.log(`  amount:`, withdrawAmount.toString());
              console.log(`  recipient:`, recipient);
              console.log(`=============================`);
              
              txResponse = await withdrawFunction(
                a,
                b,
                c,
                pubSignals,
                ethers.ZeroAddress,
                withdrawAmount,
                recipient,
              );
            }
          } else if (selectedNetwork === "paseo_assethub_v2") {
            // FixedIlopPhase2Paseo_v3 withdraw: UTXO model with 7 public signals
            const recipient = evmAddress;
            if (!recipient) throw new Error("No wallet address connected");
            const withdrawAmount = ethers.parseEther(amount);

            // Derive nullifier and secret from user input (same derivation as deposit)
            // v2 uses: commitment = Poseidon3(secret, asset, amount), nullifierHash = Poseidon2(secret, 1)
            const secretVal = BigInt(secret);
            const assetNumeric = 0n; // native token = 0

            // Calculate nullifier hash the same way as deposit
            const nullifierHash = poseidon2([secretVal, 1n]);

            // Connect to contract for pre-checks
            const checkContract = new ethers.Contract(
              NETWORKS["paseo_assethub_v2"].shield_address,
              NETWORKS["paseo_assethub_v2"].abi,
              ETHsigner,
            );

            // Pre-check: check deposit hasn't been spent (using nullifierHash)
            const depositInfo = await checkContract.deposits(
              ethers.zeroPadValue(ethers.toBeArray(nullifierHash), 32),
            );
            if (depositInfo.isSpent) {
              toast(`Already withdrawn! This deposit has been spent.`, {
                position: "top-right",
                autoClose: 5000,
                theme: "dark",
              });
              throw new Error("Deposit already spent");
            }

            // Check escrow has funds
            const escrowBalance = await checkContract.escrow(
              ethers.ZeroAddress,
            );
            console.log(`Escrow balance:`, ethers.formatEther(escrowBalance));
            if (escrowBalance < withdrawAmount) {
              toast(`Insufficient pool balance for withdrawal`, {
                position: "top-right",
                autoClose: 5000,
                theme: "dark",
              });
              throw new Error("Insufficient escrow balance");
            }

            // Build Merkle tree from contract events
            toast(`Rebuilding Merkle tree from on-chain data...`, {
              position: "top-right",
              autoClose: 4000,
              theme: "dark",
            });
            const provider = ETHsigner.provider;
            if (!provider) throw new Error("No provider available");

            // For v2, we need to use the v3 contract's events - they use different event signature
            // The v3 contract emits: event Deposit(address indexed asset, bytes32 commitment, uint256 nullifierHash);
            // So commitment is Poseidon3(secret, asset, amount) and nullifierHash is Poseidon2(secret, 1)

            const merkleTree = await buildMerkleTreeFromContract(
              provider,
              NETWORKS["paseo_assethub_v2"].shield_address,
              NETWORKS["paseo_assethub_v2"].abi,
              false,
              NETWORKS["paseo_assethub_v2"].rpcEndpoint,
            );

            // Find our commitment in the tree
            // v2 commitment structure: Poseidon3(secret, asset, amount)
            const existingValue = withdrawAmount;
            const commitmentBigInt = poseidon3([
              secretVal,
              assetNumeric,
              existingValue,
            ]);

            const leafIdx = merkleTree.findLeafIndex(commitmentBigInt);
            if (leafIdx === -1) {
              toast(
                `Commitment not found in Merkle tree. Verify your secret and amount.`,
                { position: "top-right", autoClose: 8000, theme: "dark" },
              );
              throw new Error("Commitment not found in tree");
            }

            const merkleProof = await merkleTree.getProof(leafIdx);
            console.log(
              `Merkle proof obtained. Leaf index: ${leafIdx}, Tree depth: ${merkleProof.depth}`,
            );

            // Get tree state from contract
            const currentRoot = await checkContract.currentRoot();
            const contractTreeSize = await checkContract.treeSize();
            console.log(
              `Contract root: ${currentRoot}, size: ${contractTreeSize}, local root: ${merkleTree.root}, local size: ${merkleTree.size}`,
            );

            // Validate local tree size matches contract
            if (merkleTree.size !== Number(contractTreeSize)) {
              console.error(
                `Tree size mismatch! Local: ${merkleTree.size}, Contract: ${contractTreeSize}`,
              );
              throw new Error(
                `Tree size mismatch: local ${merkleTree.size} vs contract ${contractTreeSize}`,
              );
            }

            const localRoot = merkleTree.root;
            const localDepth =
              merkleProof.depth ||
              (merkleTree.size <= 1
                ? 0
                : Math.ceil(Math.log2(merkleTree.size)));

            // For v3 contract, use getPrecompileAddress for asset
            const assetAddress = ethers.ZeroAddress; // native token

            // Compute context = keccak256(recipient) % SNARK_SCALAR_FIELD
            const SNARK_SCALAR_FIELD =
              21888242871839275222246405745257275088548364400416034343698204186575808495617n;
            const contextHash = ethers.keccak256(
              ethers.solidityPacked(["address"], [recipient]),
            );
            const context = (
              BigInt(contextHash) % SNARK_SCALAR_FIELD
            ).toString();

            // Generate fresh nullifier+secret for change UTXO
            const newNullifier = BigInt(
              ethers.toBigInt(ethers.randomBytes(16)),
            ).toString();
            const newSecret = BigInt(
              ethers.toBigInt(ethers.randomBytes(16)),
            ).toString();

            // Generate ZK proof using v3 circuit (7 public signals: newCommitmentHash, existingNullifierHash, contextHash, withdrawnValue, treeDepth, context, assetId)
            const proofToastId = toast.loading(
              `🔐 Generating ZK proof — this may take up to a minute...`,
              { position: "top-right", theme: "dark" },
            );

            let proofResult;
            try {
              proofResult = await zkWithdraw(
                {
                  withdrawnValue: existingValue.toString(),
                  root: localRoot.toString(),
                  treeDepth: localDepth.toString(),
                  context,
                  asset: "0", // native token asset ID = 0
                  existingValue: existingValue.toString(),
                  existingNullifier: nullifierHash.toString(),
                  existingSecret: secretVal.toString(),
                  newNullifier,
                  newSecret,
                  siblings: merkleProof.siblings,
                  leafIndex: leafIdx.toString(),
                },
                {
                  padTo7Signals:
                    (selectedNetwork as string) === "paseo_assethub",
                },
              );
              toast.update(proofToastId, {
                render: `✅ ZK proof generated!`,
                type: "success",
                isLoading: false,
                autoClose: 5000,
              });
            } catch (proofErr) {
              toast.update(proofToastId, {
                render: `❌ Proof generation failed`,
                type: "error",
                isLoading: false,
                autoClose: 8000,
              });
              throw proofErr;
            }

            console.log(
              `ZK proof generated. Public signals:`,
              proofResult.publicSignals,
            );

            // calldata format: [a, b, c, pubSignals]
            const [a, b, c, pubSignalsRaw] = proofResult.calldata;

            // Ensure pubSignals are properly formatted as decimal strings
            const pubSignals = pubSignalsRaw.map((sig: any) => {
              if (typeof sig === "string" && sig.startsWith("0x")) {
                // Convert hex string to decimal string
                return BigInt(sig).toString();
              }
              // Already a number or decimal string
              return sig.toString();
            });

            console.log("Formatted pubSignals:", pubSignals);

            // Use withdrawNative since we're withdrawing native tokens
            txResponse = await shieldedContract.withdrawNative(
              a,
              b,
              c,
              pubSignals,
              withdrawAmount,
            );
          } else if (
            selectedNetwork === "paseo_assethub" ||
            selectedNetwork === "polkadot"
          ) {
            // FixedIlopPhase2Paseo_v4 withdraw: UTXO model with 6 public signals
            const recipient = evmAddress;
            if (!recipient) throw new Error("No wallet address connected");

            // Find selected asset info
            const selectedAsset = userAssets.find(
              (a) => a.symbol === selectedToken,
            );
            const isNative =
              !selectedAsset ||
              selectedToken === NETWORKS[selectedNetwork].asset;
            const assetNumeric = isNative ? 0n : BigInt(selectedAsset.assetId);
            const decimals = isNative ? 18 : selectedAsset.decimals;
            const withdrawAmount = ethers.parseUnits(amount, decimals);

            // Derive nullifier and secret from user input (same derivation as deposit)
            const nullifierVal = BigInt(
              ethers.keccak256(ethers.toUtf8Bytes(secret + "_nullifier")),
            );
            const secretVal = BigInt(
              ethers.keccak256(ethers.toUtf8Bytes(secret + "_secret")),
            );

            // Connect to contract for pre-checks
            const checkContract = new ethers.Contract(
              NETWORKS[selectedNetwork].shield_address,
              NETWORKS[selectedNetwork].abi,
              ETHsigner,
            );

            // Pre-check: check deposit hasn't been spent
            // The deposit is indexed by Poseidon(nullifier), not raw nullifier
            const BN254_R =
              21888242871839275222246405745257275088548364400416034343698204186575808495617n;
            const nullifierHashBN = poseidon1([nullifierVal]);
            const nullifierHashBytes32 = ethers.zeroPadValue(
              ethers.toBeArray(nullifierHashBN),
              32,
            );
            const depositInfo =
              await checkContract.deposits(nullifierHashBytes32);
            if (depositInfo.isSpent) {
              toast(`Already withdrawn! This deposit has been spent.`, {
                position: "top-right",
                autoClose: 5000,
                theme: "dark",
              });
              throw new Error("Deposit already spent");
            }

            // Check escrow has funds
            const escrowAsset = isNative
              ? ethers.ZeroAddress
              : `0x${assetNumeric.toString(16).padStart(8, "0")}00000000000000000000000001200000`;
            const escrowBalance = await checkContract.escrow(escrowAsset);
            console.log(
              `Escrow balance (${selectedToken}):`,
              ethers.formatUnits(escrowBalance, decimals),
            );
            if (escrowBalance < withdrawAmount) {
              toast(`Insufficient pool balance for withdrawal`, {
                position: "top-right",
                autoClose: 5000,
                theme: "dark",
              });
              throw new Error("Insufficient escrow balance");
            }

            // Build Merkle tree from contract events
            toast(`Rebuilding Merkle tree from on-chain data...`, {
              position: "top-right",
              autoClose: 4000,
              theme: "dark",
            });
            const provider = ETHsigner.provider;
            if (!provider) throw new Error("No provider available");

            const merkleTree = await buildMerkleTreeFromContract(
              provider,
              NETWORKS[selectedNetwork].shield_address,
              NETWORKS[selectedNetwork].abi,
              true, // Force refresh to get latest deposits
              NETWORKS[selectedNetwork].rpcEndpoint,
              NETWORKS[selectedNetwork].deploymentBlock || 0,
            );

            // IMPORTANT: If we just made a deposit, our leaf is at index = treeSize - 1
            // But the local tree might not have it yet due to RPC issues
            // Try both: search for commitment AND use expected index

            console.log("Searching for commitment with:");
            console.log(
              "  withdrawAmount:",
              withdrawAmount.toString(),
              "decimals:",
              decimals,
            );
            console.log("  assetNumeric:", assetNumeric.toString());
            console.log("  nullifierVal:", nullifierVal.toString());
            console.log("  secretVal:", secretVal.toString());

            const precommitment = poseidon2([nullifierVal, secretVal]);
            console.log("  precommitment:", precommitment.toString());

            // Reuse existingValue from deposit lookup above
            const existingValue = depositInfo.amount;
            console.log(
              "  existingValue (from contract):",
              existingValue.toString(),
            );

            // Try multiple amount possibilities due to decimal issues
            const possibleAmounts = [];

            // 1. Use contract amount (might be 0 if deposit failed)
            if (existingValue > 0n) {
              possibleAmounts.push({
                amount: existingValue,
                desc: "contract amount",
              });
            }

            // 2. Try with withdrawAmount (user input)
            possibleAmounts.push({
              amount: withdrawAmount,
              desc: "withdraw amount",
            });

            // 3. Try with 18 decimals (PAS uses 18 decimals on ETH RPC)
            const amount18Decimals = ethers.parseUnits(amount, 18);
            possibleAmounts.push({
              amount: amount18Decimals,
              desc: "18 decimals",
            });

            // 4. Try with 10 decimals (old wrong setting)
            const amount10Decimals = ethers.parseUnits(amount, 10);
            possibleAmounts.push({
              amount: amount10Decimals,
              desc: "10 decimals",
            });

            let leafIdx = -1;
            let foundAmount = 0n;

            for (const { amount: testAmount, desc } of possibleAmounts) {
              const valueAssetHash = poseidon2([testAmount, assetNumeric]);
              const commitmentBigInt = poseidon2([
                valueAssetHash,
                precommitment,
              ]);

              console.log(
                `  Testing ${desc}: amount=${testAmount}, commitment=${commitmentBigInt}`,
              );

              leafIdx = merkleTree.findLeafIndex(commitmentBigInt);
              if (leafIdx !== -1) {
                foundAmount = testAmount;
                console.log(
                  `  ✅ Found commitment with ${desc}! Leaf index: ${leafIdx}`,
                );
                break;
              }
            }

            if (leafIdx === -1) {
              console.log("  Merkle tree root:", merkleTree.root.toString());
              console.log("  Merkle tree leaves count:", merkleTree.size);
              console.log("  All tested commitments not found.");

              // FALLBACK: If Merkle tree is empty due to CORS/RPC issues, use contract tree size
              if (merkleTree.size === 0) {
                console.log(
                  "  ⚠️ Merkle tree empty (likely due to CORS blocking RPC). Trying fallback...",
                );

                // Get contract tree size
                const contractTreeSize = await checkContract.treeSize();
                console.log(`  Contract tree size: ${contractTreeSize}`);

                if (contractTreeSize > 0n) {
                  // For new deposit, leaf index should be treeSize - 1
                  leafIdx = Number(contractTreeSize) - 1;
                  foundAmount = withdrawAmount; // Use withdraw amount

                  console.log(
                    `  ✅ Using fallback: leafIdx=${leafIdx} (last leaf in contract tree)`,
                  );
                  console.log(
                    `  ⚠️ Warning: Using mock siblings (all zeros) due to CORS`,
                  );
                } else {
                  toast(
                    `Commitment not found in Merkle tree (tree empty). Deposit may have failed.`,
                    { position: "top-right", autoClose: 8000, theme: "dark" },
                  );
                  throw new Error("Commitment not found in tree (empty)");
                }
              } else {
                toast(
                  `Commitment not found in Merkle tree. Deposit may have failed or wrong secret.`,
                  { position: "top-right", autoClose: 8000, theme: "dark" },
                );
                throw new Error("Commitment not found in tree");
              }
            }

            const currentRoot = await checkContract.currentRoot();
            const contractTreeSize = await checkContract.treeSize();
            console.log(
              `Contract root: ${currentRoot}, size: ${contractTreeSize}, local root: ${merkleTree.root}, local size: ${merkleTree.size}`,
            );

            // IMPORTANT: If local tree doesn't match contract (due to RPC/CORS issues),
            // we need to handle it gracefully
            let merkleProof;
            if (merkleTree.size !== Number(contractTreeSize)) {
              console.warn(
                `Tree size mismatch! Local: ${merkleTree.size}, Contract: ${contractTreeSize}`,
              );
              console.warn(
                "This is likely due to RPC/CORS issues preventing event fetching.",
              );
              console.warn("Trying to continue with local tree...");
            }

            // Check if leafIdx is valid for local tree
            if (leafIdx < 0 || leafIdx >= merkleTree.size) {
              console.warn(
                `Leaf index ${leafIdx} out of bounds for local tree size ${merkleTree.size}`,
              );

              // If local tree is empty due to CORS, generate mock proof with all-zero siblings
              if (merkleTree.size === 0) {
                console.warn(
                  "Local tree empty due to CORS. Generating mock proof with zero siblings.",
                );

                // Generate VALID mock siblings for circuit
                // Siblings should be hash(0,0) for empty positions, not just 0
                // Calculate: sibling at each level depends on leaf index
                console.log(
                  "Generating valid mock siblings for leaf index",
                  leafIdx,
                  "depth 128",
                );

                const validSiblings = [];
                for (let level = 0; level < 128; level++) {
                  // For empty tree positions, sibling should be hash(0,0)
                  // In LeanIMT, empty positions hash to 0, but circuit might expect hash(0,0)
                  // Try both: start with 0 (hash of empty)
                  validSiblings.push("0");
                }

                merkleProof = {
                  siblings: validSiblings,
                  root: currentRoot.toString(), // Use contract root
                  depth: 128, // Fixed depth for v4 circuit
                  leafIndex: leafIdx,
                };
                console.log(
                  `Using mock proof with ${validSiblings.length} siblings (trying 0 for empty)`,
                );
              } else {
                console.error(
                  "Local tree might be stale. Try waiting for block confirmation or check RPC.",
                );
                throw new Error(
                  `Invalid leaf index ${leafIdx} for tree size ${merkleTree.size}`,
                );
              }
            } else {
              merkleProof = await merkleTree.getProof(leafIdx);
            }
            console.log(
              `Merkle proof obtained. Leaf index: ${leafIdx}, Tree depth: ${merkleProof.depth}`,
            );

            const localRoot = merkleTree.root;
            // FixedIlopPhase2Paseo_v4 uses depth 128
            const localDepth = 128;

            // Compute context
            const SNARK_SCALAR_FIELD =
              21888242871839275222246405745257275088548364400416034343698204186575808495617n;
            const contextHash = ethers.keccak256(
              ethers.solidityPacked(["address"], [recipient]),
            );
            const context = (
              BigInt(contextHash) % SNARK_SCALAR_FIELD
            ).toString();

            // Generate fresh nullifier+secret for change UTXO
            const newNullifier = BigInt(
              ethers.toBigInt(ethers.randomBytes(16)),
            ).toString();
            const newSecret = BigInt(
              ethers.toBigInt(ethers.randomBytes(16)),
            ).toString();

            // Generate ZK proof using v4 circuit (6 public signals)
            const proofToastId = toast.loading(
              `🔐 Generating ZK proof — this may take up to a minute...`,
              { position: "top-right", theme: "dark" },
            );

            let proofResult;
            try {
              proofResult = await zkWithdraw(
                {
                  withdrawnValue: withdrawAmount.toString(),
                  root: localRoot.toString(),
                  treeDepth: localDepth.toString(),
                  context,
                  asset: assetNumeric.toString(),
                  existingValue: foundAmount.toString(), // Use found amount not contract amount
                  existingNullifier: nullifierVal.toString(),
                  existingSecret: secretVal.toString(),
                  newNullifier,
                  newSecret,
                  siblings: merkleProof.siblings,
                  leafIndex: leafIdx.toString(),
                },
                {
                  padTo7Signals:
                    (selectedNetwork as string) === "paseo_assethub",
                },
              );
              toast.update(proofToastId, {
                render: `✅ ZK proof generated!`,
                type: "success",
                isLoading: false,
                autoClose: 5000,
              });
            } catch (proofErr) {
              toast.update(proofToastId, {
                render: `❌ Proof generation failed`,
                type: "error",
                isLoading: false,
                autoClose: 8000,
              });
              throw proofErr;
            }

            console.log(
              `ZK proof generated. Public signals:`,
              proofResult.publicSignals,
            );

            // calldata format: [a, b, c, pubSignals]
            const [a, b, c, pubSignalsRaw] = proofResult.calldata;

            // Ensure pubSignals are properly formatted as decimal strings
            const pubSignals = pubSignalsRaw.map((sig: any) => {
              if (typeof sig === "string" && sig.startsWith("0x")) {
                // Convert hex string to decimal string
                return BigInt(sig).toString();
              }
              // Already a number or decimal string
              return sig.toString();
            });

            console.log("Formatted pubSignals:", pubSignals);

            console.log(`=== WITHDRAW TX DATA ===`);
            console.log(
              `pA:`,
              a.map((x) => x.toString()),
            );
            console.log(
              `pB:`,
              b.map((x) => x.map((y) => y.toString())),
            );
            console.log(
              `pC:`,
              c.map((x) => x.toString()),
            );
            console.log(
              `pubSignals:`,
              pubSignals.map((s) => s.toString()),
            );
            console.log(`withdrawAmount:`, withdrawAmount.toString());
            console.log(`========================`);

            // Use the correct function based on asset type
            if (isNative) {
              // For native token (PAS), use withdrawNative
              console.log("Calling withdrawNative with:");
              console.log("  pA:", a);
              console.log("  pB:", b);
              console.log("  pC:", c);
              console.log("  pubSignals:", pubSignals);
              console.log("  amount:", withdrawAmount.toString());

              txResponse = await shieldedContract.withdrawNative(
                [a[0], a[1]],
                [
                  [b[0][0], b[0][1]],
                  [b[1][0], b[1][1]],
                ],
                [c[0], c[1]],
                pubSignals,
                withdrawAmount,
              );
            } else {
              // For pallet assets, use withdrawAsset
              console.log("Calling withdrawAsset with:");
              console.log("  pA:", a);
              console.log("  pB:", b);
              console.log("  pC:", c);
              console.log("  pubSignals:", pubSignals);
              console.log("  assetId:", assetNumeric.toString());
              console.log("  amount:", withdrawAmount.toString());

              txResponse = await shieldedContract.withdrawAsset(
                [a[0], a[1]],
                [
                  [b[0][0], b[0][1]],
                  [b[1][0], b[1][1]],
                ],
                [c[0], c[1]],
                pubSignals,
                assetNumeric,
                withdrawAmount,
              );
            }
          } else if (
            selectedNetwork == "paseo_assethub2" ||
            selectedNetwork == "kusama"
          ) {
            const zkpService = new ZKPService();
            //   const payloaden = zkpService.generateDepositPayload(secret, ethers.ZeroAddress, BigInt(ethers.parseEther(amount).toString()));
            console.log(`amount is:`, ethers.parseEther(amount));
            const mockCommitment = zkpService.generateCommitment(
              secret,
              ethers.ZeroAddress,
              BigInt(ethers.parseEther(amount).toString()),
            );

            // Store the deposit info first (in real app this would be done during deposit)
            const depositPayload = zkpService.generateDepositPayload(
              secret,
              ethers.ZeroAddress,
              BigInt(ethers.parseEther(amount).toString()),
            );
            toast("builind zk payload");
            console.log(`evm address:`, evmAddress);
            const withdrawalPayload =
              await zkpService.generateWithdrawalPayload(
                mockCommitment,
                evmAddress || "", // selected browser wallet address
                "asset.wasm", // circuit WASM path
                "asset_0001.zkey", // circuit zkey path
                ethers.ZeroAddress, // asset
              );
            console.log(`got throw`);

            /*
                    const gasEstimate = await shieldedContract.withdrawETH.estimateGas(
                    withdrawalPayload.a,
                    withdrawalPayload.b,
                    withdrawalPayload.c,
                    withdrawalPayload.publicSignals
                  );
                  console.log('Gas estimate for withdrawal:', gasEstimate);
          */

            txResponse = await shieldedContract.withdrawETH(
              withdrawalPayload.a,
              withdrawalPayload.b,
              withdrawalPayload.c,
              withdrawalPayload.publicSignals,
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

          const withdrawExplorerUrl = NETWORKS[selectedNetwork]?.block_explorer;
          toast(
            <div>
              Withdrawal submitted:{" "}
              {withdrawExplorerUrl ? (
                <a
                  href={`${withdrawExplorerUrl}/tx/${txResponse.hash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: "#58a6ff", textDecoration: "underline" }}
                >
                  {txResponse.hash}
                </a>
              ) : (
                txResponse.hash
              )}
            </div>,
            {
              position: "top-right",
              autoClose: 8000,
              hideProgressBar: false,
              closeOnClick: false,
              pauseOnHover: true,
              draggable: true,
              progress: undefined,
              theme: "dark",
            },
          );
          // 8. Wait for confirmation
          const receipt2 = await txResponse.wait();
          setRecentGasUnits((prev) => ({
            ...prev,
            [selectedNetwork]: {
              ...prev[selectedNetwork],
              unshield: receipt2.gasUsed,
            },
          }));

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

  const handleSendTransaction = async () => {
    console.log("[SEND] handleSendTransaction triggered");
    console.log("[SEND] wallet connected:", isWalletConnected, "recipient:", sendRecipient, "amount:", sendAmount);
    
    if (!isWalletConnected || !sendRecipient || !sendAmount) {
      console.log("[SEND] Aborted - missing:", { wallet: isWalletConnected, recipient: sendRecipient, amount: sendAmount });
      return;
    }

    const isSameToken = sendFromCurrency === sendToCurrency;
    console.log("[SEND] isSameToken:", isSameToken, "from:", sendFromCurrency, "to:", sendToCurrency);

    // Resolve destination: accept EVM (0x..), EVM-derived SS58, and native SS58 addresses
    let recipientPayload: string;
    if (!isSameToken) {
      // Cross-currency: pass address through to swap partner without validation
      recipientPayload = sendRecipient;
    } else if (isEvmAddress(sendRecipient)) {
      recipientPayload = sendRecipient;
    } else {
      // Try SS58: check if EVM-derived (H160 + 12×0xEE) or native
      try {
        const { decodeAddress, encodeAddress } = await import("@polkadot/util-crypto");
        const decoded = decodeAddress(sendRecipient);
        const last12 = Buffer.from(decoded.slice(-12));
        const isEvmDerived = last12.every(b => b === 0xEE);
        if (isEvmDerived && decoded.length >= 32) {
          // EVM-derived SS58 → convert to H160
          recipientPayload = "0x" + Buffer.from(decoded.slice(0, 20)).toString("hex");
          if (!isEvmAddress(recipientPayload)) {
            throw new Error("Invalid H160 derived from SS58");
          }
        } else if (ispolkadotaddress(sendRecipient)) {
          // Native SS58 → pass through (backend handles forwarding via Account 1)
          recipientPayload = sendRecipient;
        } else {
          throw new Error("Not a valid address");
        }
      } catch {
        setError("Invalid address. Enter an Ethereum address (0x...) or a Polkadot native address (e.g. 16Ziip...).");
        toast.error("Invalid destination address", { position: "top-right", autoClose: 5000, theme: "dark" });
        return;
      }
    }

    try {
      setIsLoading(true);
      setError("");
      setSendGasEstimate(null);
      
      const sourceNetwork = selectedNetwork === "kusama" ? "kusama" : "polkadot";
      console.log("[SEND] sourceNetwork:", sourceNetwork);
      
      // For DOT -> DOT: first do deposit, then withdraw via Flask API
      if (isSameToken) {
        console.log("[SEND] Same token detected, doing deposit + withdraw");
        
        toast(`Step 1/3: Depositing ${sendAmount} DOT to shielded pool...`, {
          position: "top-right",
          autoClose: 6000,
          hideProgressBar: false,
          closeOnClick: false,
          pauseOnHover: true,
          draggable: true,
          progress: undefined,
          theme: "dark",
        });

        const networkConfig = NETWORKS[selectedNetwork];
        const provider = new ethers.BrowserProvider(
          (window as any).ethereum || (window as any).talismanEth,
        );
        const signer = await provider.getSigner();
        
        const poolContract = new ethers.Contract(
          networkConfig.shield_address,
          networkConfig.abi,
          signer
        );

        // Generate 31-byte secret (must be < BN254_R = 0x30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001)
        const secretBytes = ethers.randomBytes(31);
        const secretHex = "0x" + Array.from(secretBytes).map(b => b.toString(16).padStart(2, '0')).join('');
        const amountWei = ethers.parseEther(sendAmount);
        
        // Compute commitment using poseidon-lite (matches Python SDK's generate_commitment)
        const secretBN = BigInt(secretHex);
        const { poseidon1, poseidon2 } = await import("poseidon-lite");
        
        const nullifier = poseidon2([secretBN, 1n]);
        const nullifierHash = poseidon1([nullifier]);
        const precommitment = poseidon2([nullifier, secretBN]);
        const valueAssetHash = poseidon2([amountWei.toString(), 0n]);
        const commitment = poseidon2([valueAssetHash, precommitment]);
        
        // Convert commitment to bytes32 hex for the contract
        const commitmentHex = "0x" + commitment.toString(16).padStart(64, '0');
        
        console.log("[SEND] Generated commitment:", commitmentHex);
        
        // Estimate gas before sending
        let gasLimit = 150000n;
        let gasPrice = 1000000000n;
        try {
          const feeData = await provider.getFeeData();
          gasPrice = feeData.gasPrice || gasPrice;
          try {
            gasLimit = await poolContract.depositNative.estimateGas(commitmentHex, { value: amountWei });
          } catch (e) {
            console.log("Gas est failed, using fallback:", e);
          }
        } catch (e) {}
        console.log("[SEND] Using gasLimit:", gasLimit.toString(), "gasPrice:", gasPrice.toString());
        
        // Send deposit transaction with estimated gas
        let tx;
        tx = await poolContract.depositNative(commitmentHex, { value: amountWei, gasLimit, gasPrice });

        toast(`Deposit sent! Tx: ${tx.hash.slice(0, 10)}... Waiting for confirmation...`, {
          position: "top-right",
          autoClose: 10000,
          hideProgressBar: false,
          closeOnClick: false,
          pauseOnHover: true,
          draggable: true,
          progress: undefined,
          theme: "dark",
        });

const receipt = await tx.wait();
        console.log("Deposit confirmed:", receipt.hash);

        // Single persistent loading toast for the entire withdrawal process
        const loadingToastId = toast.loading(`Deposit confirmed. Processing shielded transfer...`, {
          position: "top-right",
          hideProgressBar: false,
          closeOnClick: false,
          pauseOnHover: true,
          draggable: true,
          theme: "dark",
        });

        // Wait for deposit finality
        await new Promise(r => setTimeout(r, 5000));
        
// Rebuild Merkle tree
        toast.update(loadingToastId, { render: "Doing cryptography stuff, hold.." });
        
        console.log("[SEND] Tree rebuild URL:", `${SWAP_API_BASE}/tree-rebuild/${sourceNetwork}`);
        const treeResult = await fetch(`${SWAP_API_BASE}/tree-rebuild/${sourceNetwork}`, {
          method: "POST",
        });
        const treeData = await treeResult.json();
        console.log("[SEND] Tree rebuild response:", JSON.stringify(treeData));

        // Call Flask /pool-withdraw
        toast.update(loadingToastId, { render: `Submitting withdrawal to ${recipientPayload.slice(0, 6)}...` });

        const withdrawPayload = {
          secret: secretHex,
          network: sourceNetwork,
          amount_wei: amountWei.toString(),
          asset_id: 0,
          recipient: recipientPayload,
        };

        console.log("[SEND] Pool-withdraw URL:", `${SWAP_API_BASE}/pool-withdraw`);
        console.log("[SEND] Pool-withdraw payload:", JSON.stringify(withdrawPayload));
        
        const response = await fetch(`${SWAP_API_BASE}/pool-withdraw`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(withdrawPayload),
        });

        console.log("[SEND] Pool-withdraw status:", response.status);
        const result = await response.json();
        console.log("[SEND] Pool-withdraw result:", JSON.stringify(result));

        if (result.error) {
          toast.dismiss(loadingToastId);
          throw new Error(result.error);
        }

        if (result.withdraw_id) {
          console.log("[SEND] Starting status poll for withdraw_id:", result.withdraw_id);
          let withdrawStatus = "pending";
          let pollCount = 0;
          const maxPolls = 120;
          
          while ((withdrawStatus === "pending" || withdrawStatus === "building_proof" || 
                  withdrawStatus === "building_tree" || withdrawStatus === "generating_proof" ||
                  withdrawStatus === "sending_tx" || withdrawStatus === "retrying" ||
                  withdrawStatus === "forwarding") && pollCount < maxPolls) {
            await new Promise(r => setTimeout(r, 3000));
            const statusUrl = `${SWAP_API_BASE}/pool-withdraw-status/${result.withdraw_id}`;
            console.log(`[SEND] Poll #${pollCount+1}:`, statusUrl);
            const statusRes = await fetch(statusUrl);
            console.log(`[SEND] Poll #${pollCount+1} status:`, statusRes.status);
            const statusData = await statusRes.json();
            console.log(`[SEND] Poll #${pollCount+1} data:`, JSON.stringify(statusData));
            console.log(`[SEND] Poll #${pollCount+1} withdrawStatus from API:`, statusData.status);
            
            withdrawStatus = statusData.status;
            pollCount++;
            
            toast.update(loadingToastId, { 
              render: `${statusData.message || "Processing..."} (${pollCount * 3}s)` 
            });
            
            if (withdrawStatus === "completed") {
              toast.dismiss(loadingToastId);
              const shortTx = (statusData.forward_tx_hash || statusData.tx_hash || "").slice(0, 10);
              toast.success(`Shielded transfer complete! Sent ${sendAmount} DOT to ${recipientPayload.slice(0, 6)}...${shortTx ? ` (tx: ${shortTx}...)` : ""}`, {
                position: "top-right",
                autoClose: 10000,
                hideProgressBar: false,
                closeOnClick: false,
                pauseOnHover: true,
                draggable: true,
                progress: undefined,
                theme: "dark",
              });
            } else if (withdrawStatus === "failed") {
              toast.dismiss(loadingToastId);
              throw new Error(statusData.message || "Withdrawal failed");
            }
          }
          
          if (withdrawStatus !== "completed" && pollCount >= maxPolls) {
            toast.dismiss(loadingToastId);
            toast.info(`Withdrawal ${result.withdraw_id} still processing. Check status later.`, {
              position: "top-right",
              autoClose: 10000,
              hideProgressBar: false,
              closeOnClick: false,
              pauseOnHover: true,
              draggable: true,
              progress: undefined,
              theme: "dark",
            });
          }
        }

        setSendRecipient("");
        setSendAmount("");
        setIsLoading(false);
        return;
      }

      // For cross-token: create swap order, user deposits, proxy withdraws to swap address
      toast(`Step 1/4: Creating ${sendFromCurrency} → ${sendToCurrency} swap order...`, {
        position: "top-right",
        autoClose: 6000,
        hideProgressBar: false,
        closeOnClick: false,
        pauseOnHover: true,
        draggable: true,
        progress: undefined,
        theme: "dark",
      });

      const toFixedFloat = (ccy: string) => ccy === "DOT" ? "DOTAH" : ccy;
      const ffOrderResult = await fetch(`${SWAP_API_BASE}/ff-create-order`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          from_ccy: toFixedFloat(sendFromCurrency),
          to_ccy: toFixedFloat(sendToCurrency),
          amount: parseFloat(sendAmount),
          destination_address: sendRecipient,
        }),
      });

      const ffOrder = await ffOrderResult.json();
      if (ffOrder.error) {
        throw new Error(ffOrder.error);
      }

      console.log("[SEND] Swap order created:", ffOrder);
      const ffDepositAddress = ffOrder.deposit_address;
      const ffOrderId = ffOrder.order_id;

      toast(`Step 2/4: Depositing ${sendAmount} DOT to shielded pool...`, {
        position: "top-right",
        autoClose: 6000,
        hideProgressBar: false,
        closeOnClick: false,
        pauseOnHover: true,
        draggable: true,
        progress: undefined,
        theme: "dark",
      });

      const networkConfig = NETWORKS[selectedNetwork];
      const provider = new ethers.BrowserProvider(
        (window as any).ethereum || (window as any).talismanEth,
      );
      const signer = await provider.getSigner();

      const poolContract = new ethers.Contract(
        networkConfig.shield_address,
        networkConfig.abi,
        signer
      );

      const secretBytes = ethers.randomBytes(31);
      const secretHex = "0x" + Array.from(secretBytes).map(b => b.toString(16).padStart(2, '0')).join('');
      const amountWei = ethers.parseEther(sendAmount);

      const secretBN = BigInt(secretHex);
      const { poseidon1, poseidon2 } = await import("poseidon-lite");

      const nullifier = poseidon2([secretBN, 1n]);
      const nullifierHash = poseidon1([nullifier]);
      const precommitment = poseidon2([nullifier, secretBN]);
      const valueAssetHash = poseidon2([amountWei.toString(), 0n]);
      const commitment = poseidon2([valueAssetHash, precommitment]);

      const commitmentHex = "0x" + commitment.toString(16).padStart(64, '0');
      console.log("[SEND] Generated commitment:", commitmentHex);

      let gasLimit = 150000n;
      let gasPrice = 1000000000n;
      try {
        const feeData = await provider.getFeeData();
        gasPrice = feeData.gasPrice || gasPrice;
        try {
          gasLimit = await poolContract.depositNative.estimateGas(commitmentHex, { value: amountWei });
        } catch (e) {
          console.log("Gas est failed, using fallback:", e);
        }
      } catch (e) {}

      const tx = await poolContract.depositNative(commitmentHex, { value: amountWei, gasLimit, gasPrice });
      toast(`Deposit sent! Tx: ${tx.hash.slice(0, 10)}... Waiting for confirmation...`, {
        position: "top-right",
        autoClose: 10000,
        hideProgressBar: false,
        closeOnClick: false,
        pauseOnHover: true,
        draggable: true,
        progress: undefined,
        theme: "dark",
      });

      const receipt = await tx.wait();
      console.log("Deposit confirmed:", receipt.hash);

      const loadingToastId = toast.loading(`Deposit confirmed. Processing shielded swap to ${ffDepositAddress.slice(0, 6)}...`, {
        position: "top-right",
        hideProgressBar: false,
        closeOnClick: false,
        pauseOnHover: true,
        draggable: true,
        theme: "dark",
      });

      await new Promise(r => setTimeout(r, 5000));

      toast.update(loadingToastId, { render: "Doing cryptography stuff, hold.." });
      console.log("[SEND] Tree rebuild URL:", `${SWAP_API_BASE}/tree-rebuild/${sourceNetwork}`);
      const treeResult = await fetch(`${SWAP_API_BASE}/tree-rebuild/${sourceNetwork}`, {
        method: "POST",
      });
      const treeData = await treeResult.json();
      console.log("[SEND] Tree rebuild response:", JSON.stringify(treeData));

      toast.update(loadingToastId, { render: `Withdrawing to swap address...` });
      const withdrawPayload = {
        secret: secretHex,
        network: sourceNetwork,
        amount_wei: amountWei.toString(),
        asset_id: 0,
        recipient: ffDepositAddress,
      };
      console.log("[SEND] Pool-withdraw payload:", JSON.stringify(withdrawPayload));
      const response = await fetch(`${SWAP_API_BASE}/pool-withdraw`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(withdrawPayload),
      });
      const result = await response.json();
      console.log("[SEND] Pool-withdraw result:", JSON.stringify(result));

      if (result.error) {
        toast.dismiss(loadingToastId);
        throw new Error(result.error);
      }

      if (result.withdraw_id) {
        let withdrawStatus = "pending";
        let pollCount = 0;
        const maxPolls = 120;

        while ((withdrawStatus === "pending" || withdrawStatus === "building_proof" ||
                withdrawStatus === "building_tree" || withdrawStatus === "generating_proof" ||
                withdrawStatus === "sending_tx" || withdrawStatus === "retrying" ||
                withdrawStatus === "forwarding") && pollCount < maxPolls) {
          await new Promise(r => setTimeout(r, 3000));
          const statusUrl = `${SWAP_API_BASE}/pool-withdraw-status/${result.withdraw_id}`;
          const statusRes = await fetch(statusUrl);
          const statusData = await statusRes.json();

          withdrawStatus = statusData.status;
          pollCount++;

          toast.update(loadingToastId, {
            render: `${statusData.message || "Processing..."} (${pollCount * 3}s)`
          });

          if (withdrawStatus === "completed") {
            toast.dismiss(loadingToastId);
            toast.success(`Shielded swap initiated! ${sendAmount} DOT → ${sendToCurrency} to ${sendRecipient.slice(0, 6)}... (swap order: ${ffOrderId})`, {
              position: "top-right",
              autoClose: 10000,
              hideProgressBar: false,
              closeOnClick: false,
              pauseOnHover: true,
              draggable: true,
              progress: undefined,
              theme: "dark",
            });
          } else if (withdrawStatus === "failed") {
            toast.dismiss(loadingToastId);
            throw new Error(statusData.message || "Withdrawal failed");
          }
        }

        if (withdrawStatus !== "completed" && pollCount >= maxPolls) {
          toast.dismiss(loadingToastId);
          toast.info(`Withdrawal ${result.withdraw_id} still processing. Swap order ${ffOrderId}. Check status later.`, {
            position: "top-right",
            autoClose: 10000,
            hideProgressBar: false,
            closeOnClick: false,
            pauseOnHover: true,
            draggable: true,
            progress: undefined,
            theme: "dark",
          });
        }
      }

      setSendRecipient("");
      setSendAmount("");
      setSendGasEstimate(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Send failed");
      toast(`Send failed: ${err instanceof Error ? err.message : "Unknown error"}`, {
        position: "top-right",
        autoClose: 7000,
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

  const estimateSendGas = useCallback(async () => {
    if (!sendAmount || parseFloat(sendAmount) <= 0 || isTestnet(selectedNetwork)) {
      setSendGasEstimate(null);
      return;
    }

    setSendGasLoading(true);
    try {
      const sourceNetwork = selectedNetwork === "kusama" ? "kusama" : "polkadot";
      const networkConfig = NETWORKS[selectedNetwork];
      if (!networkConfig?.shield_address) {
        setSendGasEstimate(null);
        return;
      }

      const provider = new ethers.BrowserProvider(
        (window as any).ethereum || (window as any).talismanEth,
      );
      
      const poolContract = new ethers.Contract(
        networkConfig.shield_address,
        networkConfig.abi,
        provider
      );

      // Use static gas estimates - deposit ~50k, withdraw ~150k
      const depositGas = 50000n;
      const withdrawGas = 150000n;
      
      const totalGas = depositGas + withdrawGas;
      const gasEstimateEth = Number(totalGas) / 1e18;
      
      if (gasEstimateEth > 0) {
        setSendGasEstimate(`~${gasEstimateEth.toFixed(4)} ${networkConfig.asset || "DOT"}`);
      } else {
        setSendGasEstimate(null);
      }
    } catch (err) {
      console.error("Gas estimation error:", err);
      setSendGasEstimate(null);
    } finally {
      setSendGasLoading(false);
    }
  }, [sendAmount, sendFromCurrency, sendToCurrency, sendRecipient, selectedNetwork]);

  useEffect(() => {
    const timer = setTimeout(() => {
      estimateSendGas();
    }, 500);
    return () => clearTimeout(timer);
  }, [estimateSendGas]);

  // Fetch exchange rate for estimated receive amount
  useEffect(() => {
    if (!sendAmount || parseFloat(sendAmount) <= 0) {
      setEstimatedReceive(null);
      setSwapRate(null);
      return;
    }

    const fetchRate = async () => {
      const estimateGasFee = async () => {
        try {
          const networkConfig = NETWORKS[selectedNetwork];
          if (!networkConfig?.shield_address) return "0.01";
          const provider = new ethers.BrowserProvider(
            (window as any).ethereum || (window as any).talismanEth,
          );
          const poolContract = new ethers.Contract(networkConfig.shield_address, networkConfig.abi, provider);
          const amountWei = ethers.parseEther(sendAmount || "1");
          let gasPrice = 2000000000n;
          try {
            const feeData = await provider.getFeeData();
            gasPrice = feeData.maxFeePerGas || feeData.gasPrice || gasPrice;
          } catch (e) {}
          let depositGas = 50000n;
          try {
            const secretBytes = ethers.randomBytes(31);
            const secretHex = "0x" + Array.from(secretBytes).map(b => b.toString(16).padStart(2, '0')).join('');
            const secretBN = BigInt(secretHex);
            const { poseidon1, poseidon2 } = await import("poseidon-lite");
            const nullifier = poseidon2([secretBN, 1n]);
            const precommitment = poseidon2([nullifier, secretBN]);
            const valueAssetHash = poseidon2([amountWei.toString(), 0n]);
            const commitment = poseidon2([valueAssetHash, precommitment]);
            const commitmentHex = "0x" + commitment.toString(16).padStart(64, '0');
            depositGas = await poolContract.depositNative.estimateGas(commitmentHex, { value: amountWei });
          } catch (e) {
            console.log("Gas estimation failed, using default:", e);
          }
          const feeEth = Number(depositGas * gasPrice) / 1e18;
          return feeEth > 0 ? feeEth.toFixed(6) : "0.01";
        } catch (e) {
          return "0.01";
        }
      };

      // Always estimate gas fee
      const gasFee = await estimateGasFee();
      setSendGasFee(gasFee);
      
      if (sendFromCurrency === sendToCurrency) {
        setEstimatedReceive(gasFee);
        setEstimatedReceiveLoading(false);
        return;
      }

      // Different currencies - fetch exchange rate too
      const toFixedFloat = (ccy: string) => ccy === "DOT" ? "DOTAH" : ccy;
      
      setEstimatedReceiveLoading(true);
      try {
        const response = await fetch(`${SWAP_API_BASE}/exchange_rate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fromCcy: toFixedFloat(sendFromCurrency),
            toCcy: toFixedFloat(sendToCurrency),
            amount: parseFloat(sendAmount) || 0,
          }),
        });
        const data = await response.json();
        console.log("[DEBUG fetchRate] Response data:", data);
        
        if (data.error) {
          if (data.errors && data.errors.length > 0) {
            const errorMsg = data.errors[0];
            if (errorMsg === 'OFFLINE_FROM' || errorMsg === 'OFFLINE_TO')
              setSwapRate('Currency temporarily unavailable, try later');
            else if (errorMsg === 'MAINTENANCE_FROM' || errorMsg === 'MAINTENANCE_TO')
              setSwapRate('Currency under maintenance, try later');
            else
              setSwapRate('Pair temporarily unavailable');
          } else {
            setSwapRate(data.error);
          }
          setEstimatedReceive(null);
        } else if (data.response?.data?.to?.amount) {
          const receivedAmount = parseFloat(data.response.data.to.amount);
          setEstimatedReceive(receivedAmount.toFixed(4));
          if (data.response.data.from?.rate && data.response.data.to?.rate) {
            const rate = data.response.data.to.rate / data.response.data.from.rate;
            setSwapRate(`1 ${sendFromCurrency} ≈ ${rate.toFixed(6)} ${sendToCurrency}`);
          } else if (receivedAmount > 0) {
            setSwapRate(`1 ${sendFromCurrency} ≈ ${(receivedAmount / parseFloat(sendAmount)).toFixed(6)} ${sendToCurrency}`);
          }
        } else {
          setEstimatedReceive(null);
          setSwapRate(null);
        }
      } catch (err) {
        console.error("[DEBUG fetchRate] Error:", err);
        setEstimatedReceive(null);
        setSwapRate(null);
      }
      setEstimatedReceiveLoading(false);
    };

    const timer = setTimeout(() => {
      fetchRate();
    }, 500);
    return () => clearTimeout(timer);
  }, [sendAmount, sendFromCurrency, sendToCurrency]);

  const handleBridge = async () => {
    if (evmAddress && isEvmAddress(evmAddress)) {
      toast(`ERROR: select a polkadot address not ethereum address`, {
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
    var transacto;
    try {
      transacto = await generate_tx2(
        tapi,
        from_chain,
        to_chain,
        evmAddress || "",
        amount,
      );

      // Proceed with transaction signing...
    } catch (error) {
      toast(` ${error}`, {
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
      ({
        status,
        events,
        dispatchError,
      }: {
        status: any;
        events: any;
        dispatchError: any;
      }) => {
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

  // Helper function to format time left
  const formatTimeLeft = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
      return `${hours}h ${minutes}m ${secs}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${secs}s`;
    } else {
      return `${secs}s`;
    }
  };

  // Countdown timer functions
  const startCountdown = (initialSeconds: number) => {
    setLocalTimeLeft(initialSeconds);

    // Clear any existing countdown
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
    }

    // Start new countdown
    countdownIntervalRef.current = setInterval(() => {
      setLocalTimeLeft((prev) => {
        if (prev === null || prev <= 0) {
          if (countdownIntervalRef.current) {
            clearInterval(countdownIntervalRef.current);
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const stopCountdown = () => {
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
    setLocalTimeLeft(null);
  };

  const syncCountdown = (serverTimeLeft: number) => {
    // Sync local countdown with server time
    if (serverTimeLeft > 0) {
      setLocalTimeLeft(serverTimeLeft);
      if (!countdownIntervalRef.current) {
        startCountdown(serverTimeLeft);
      }
    } else {
      stopCountdown();
    }
  };

  // Swap-related functions
  const fetchExchangeRate = async () => {
    if (!swapAmount || !fromCurrency || !toCurrency) return;

    // Prevent DOT to DOT swaps
    if (fromCurrency === "DOT" && toCurrency === "DOT") {
      setError("Cannot swap DOT to DOT");
      return;
    }

    // Use local DOT/KSM price checker for DOT→KSM swaps
    if (fromCurrency === "DOT" && toCurrency === "KSM") {
      try {
        console.log("Using local DOT→KSM price checker...");
        const localRate = await getDotToKsmRate();

        // Calculate the actual amount based on user input
        const calculatedToAmount = (
          parseFloat(swapAmount) * parseFloat(localRate.rate)
        ).toFixed(6);
        const transformedRate = {
          rate: localRate.rate,
          to_amount: calculatedToAmount,
          from_amount: swapAmount,
          from_code: fromCurrency,
          to_code: toCurrency,
          usd_value: "0", // Not available from local checker
        };

        setExchangeRate(transformedRate);
        console.log("✅ Local DOT→KSM rate applied:", transformedRate);
        return;
      } catch (err) {
        console.error("Local DOT→KSM rate checker failed:", err);
        // Fall through to API call
      }
    }

    try {
      var fromc;
      var toC;
      fromc = fromCurrency;
      toC = toCurrency;
      if (fromCurrency == "DOT") {
        fromc = "DOTAH";
      }
      if (toC == "DOT") {
        toC = "DOTAH";
      }
      const response = await fetch(`${SWAP_API_BASE}/exchange_rate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fromCcy: fromc,
          toCcy: toC,
          amount: parseFloat(swapAmount),
        }),
      });

      const data = await response.json();
      console.log(`my trade response was:`, data);
      if (data.status === "good" && data.response) {
        const apiResponse = data.response;
        if (apiResponse.code === 0 && apiResponse.msg === "OK") {
          // Transform the API response to match our UI expectations
          const transformedRate = {
            rate: apiResponse.data.to.rate,
            to_amount: apiResponse.data.to.amount,
            from_amount: apiResponse.data.from.amount,
            from_code: apiResponse.data.from.code,
            to_code: apiResponse.data.to.code,
            usd_value: apiResponse.data.to.usd,
          };
          setExchangeRate(transformedRate);
        } else {
          setError("Invalid exchange rate response");
        }
      } else {
        setError(data.error || "Failed to fetch exchange rate");
      }
    } catch (err) {
      setError("Failed to fetch exchange rate");
      console.error("Exchange rate error:", err);
    }
  };

  const createSwap = async () => {
    console.log(`create swap called`);
    // Check required fields - evmAddress only required if no destination address is provided for DOT swaps
    const needsWallet =
      !requiresDestinationAddress(fromCurrency, toCurrency) ||
      !destinationAddress.trim();
    if (
      !swapAmount ||
      !fromCurrency ||
      !toCurrency ||
      (needsWallet && !evmAddress)
    ) {
      if (needsWallet && !evmAddress) {
        toast.error("Please connect wallet or enter destination address");
      } else {
        toast.error("Please fill in all required fields");
      }
      console.error("Please fill in all required fields");
      return;
    }

    // Check if destination address is required and provided
    if (
      requiresDestinationAddress(fromCurrency, toCurrency) &&
      !destinationAddress.trim()
    ) {
      toast.error(`Please enter a ${toCurrency} destination address`);
      console.error(
        `Destination address required for ${fromCurrency} to ${toCurrency} swap`,
      );
      return;
    }

    // Validate DOT destination address format (accepts both Polkadot and EVM)
    if (
      toCurrency === "DOT" &&
      destinationAddress.trim() &&
      !ispolkadotaddress(destinationAddress.trim()) &&
      !isEvmAddress(destinationAddress.trim())
    ) {
      toast.error("Invalid address format for DOT destination");
      toast.error("Enter a Polkadot address or Ethereum address (0x...)");
      console.error("Invalid address format provided for DOT swap");
      return;
    }
    console.log(
      `[create swap input]: swap amount: ${swapAmount} fromCurrency: ${fromCurrency} toCurrency" ${toCurrency}`,
    );
    // Prevent DOT to DOT swaps
    if (fromCurrency === "DOT" && toCurrency === "DOT") {
      toast.error(
        "Cannot swap DOT to DOT - please select different currencies",
      );
      console.error(
        "Cannot swap DOT to DOT - please select different currencies",
      );
      return;
    }

    // Support both EVM and Polkadot addresses for DOT destinations
    let finalDestination = requiresDestinationAddress(
      fromCurrency,
      toCurrency,
    )
      ? destinationAddress.trim()
      : evmAddress;

    // EVM address for DOT destination: convert to AccountId32 (append 24×0xEE)
    if (
      toCurrency === "DOT" &&
      finalDestination &&
      isEvmAddress(finalDestination)
    ) {
      const { eth2account32 } = await import("./transactions/adresses");
      finalDestination = eth2account32(finalDestination);
    }

    // Handle DOT→KSM cross-chain swap with local price checker
    if (fromCurrency === "DOT" && toCurrency === "KSM") {
      console.log("Handling DOT→KSM cross-chain swap...");
      setIsLoading(true);
      try {
        // Use local price checker for DOT→KSM
        toast.info(`Step 1/2 | Swapping DOT to KSM `, {
          position: "top-right",
          autoClose: 10000,
          hideProgressBar: false,
          closeOnClick: false,
          pauseOnHover: true,
          draggable: true,
          progress: undefined,
          theme: "dark",
        });
        const localRate = await getDotToKsmRate();
        const calculatedToAmount = (
          parseFloat(swapAmount) * parseFloat(localRate.rate)
        ).toFixed(6);
        console.log(
          `calling generate_dot2ksm, input:`,
          swapAmount,
          evmAddress,
          calculatedToAmount,
        );
        if (evmAddress && isEvmAddress(evmAddress)) {
          toast.error("Select a non-evm address");
          return;
        }
        console.log(`got the payload`);
        toast.info(`Grabbing the best rate from the on-chain DEX`, {
          position: "top-right",
          autoClose: 6000,
          hideProgressBar: false,
          closeOnClick: false,
          pauseOnHover: true,
          draggable: true,
          progress: undefined,
          theme: "dark",
        });

        const tmpapi = await ApiPromise.create({
          provider: new WsProvider("wss://statemint-rpc-tn.dwellir.com"),
          noInitWarn: true,
        });
        console.log(
          `sending tx with input: `,
          //    tmpapi,
          swapAmount,
          calculatedToAmount,
          evmAddress,
        );
        console.log(`calling tx`);
        const signer = selectedWallet.signer;
        /* */
        const tx = await generate_dot2ksm(
          tmpapi,
          swapAmount,
          calculatedToAmount,
          evmAddress || "",
        );
        console.log(`tx called!`);

        const unsub = await tx.signAndSend(
          evmAddress,
          { signer },
          ({
            status,
            events,
            dispatchError,
          }: {
            status: any;
            events: any;
            dispatchError: any;
          }) => {
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
              //       setIsLoading(false);
              console.log(`tx finished, moving on`);
              // return true;
            }
          },
        );

        console.log(`returno!`);

        // here the user has selected a polkadot address but now we need the ethereum one to fiddle with
        //setIsLoading(true);

        const waitForEvmAddressSwitch = async () => {
          console.log(`waitForEvmAddressSwitch called`);

          toast.info(
            `Step 1 completed! Please switch to an Ethereum wallet for Step 2.`,
            {
              position: "top-right",
              autoClose: false,
              hideProgressBar: false,
              closeOnClick: false,
              pauseOnHover: true,
              draggable: true,
              progress: undefined,
              theme: "dark",
            },
          );

          // ⏱️ Helper sleep function
          const sleep = (ms: number) =>
            new Promise((resolve) => setTimeout(resolve, ms));

          let maxAttempts = 60; // e.g. wait up to 5 minutes (60 attempts * 5s = 300s)
          for (let attempt = 0; attempt < maxAttempts; attempt++) {
            console.log(`Polling for EVM address... attempt ${attempt + 1}`);
            const currentAddress = evmAddressRef.current;
            console.log(
              `checking address: ${currentAddress}, isEvm: ${currentAddress ? isEvmAddress(currentAddress) : false}`,
            );

            console.log(`checking evm address:`, evmAddress);
            if (currentAddress && isEvmAddress(currentAddress)) {
              console.log(`✅ EVM address detected: ${evmAddress}`);
              toast.dismiss();
              return true;
            }

            // Optional: Update user every N attempts
            if ((attempt + 1) % 6 === 0) {
              toast.info(
                `Still waiting for Ethereum wallet... (${((attempt + 1) * 5) / 60} min)`,
                {
                  position: "top-right",
                  autoClose: 5000,
                  hideProgressBar: false,
                  closeOnClick: false,
                  pauseOnHover: true,
                  draggable: true,
                  progress: undefined,
                  theme: "dark",
                },
              );
            }

            await sleep(5000); // wait 5 seconds before checking again
          }

          console.error("⛔ Timeout: No EVM address detected after waiting.");
          toast.error(
            "Timeout: No Ethereum wallet detected. Please try again.",
            {
              position: "top-right",
              autoClose: 8000,
              theme: "dark",
            },
          );

          setIsLoading(false);
          return false;
        };

        console.log(`waiting for address switch `);
        const m = await waitForEvmAddressSwitch();

        toast.info(`Step 2/2 | 🌉 Sending DOT to Kusama Assethub 🌉 `, {
          position: "top-right",
          autoClose: 10000,
          hideProgressBar: false,
          closeOnClick: false,
          pauseOnHover: true,
          draggable: true,
          progress: undefined,
          theme: "dark",
        });

        const destaddress = evmAddressRef.current;
        console.log(
          `making tx2 with input:`,
          calculatedToAmount,
          //    eth2accountid32(destaddress),
        );
        console.log(`returning trueee`);
        //  return true;
        const newapi = await ApiPromise.create({
          provider: new WsProvider("wss://sys.ibp.network/asset-hub-polkadot"),
          noInitWarn: true,
        });
        const tx2 = await KSM2ah(
          newapi,
          swapAmount,
          calculatedToAmount,
          destaddress || "",
        ); //eth2accountid32(destaddress)

        const unsub2 = await tx2.signAndSend(
          evmAddress,
          { signer },
          ({
            status,
            events,
            dispatchError,
          }: {
            status: any;
            events: any;
            dispatchError: any;
          }) => {
            if (status.isInBlock) {
              console.log(
                `🌉Bridge Transaction included in block: ${status.asInBlock}`,
              );
              toast.info(
                `🌉Bridge Transaction included in block: ${status.asInBlock}`,
                {
                  position: "top-right",
                  autoClose: 6000,
                  hideProgressBar: false,
                  closeOnClick: false,
                  pauseOnHover: true,
                  draggable: true,
                  progress: undefined,
                  theme: "dark",
                },
              );
            }

            if (status.isFinalized) {
              console.log(
                `🌉Bridge Transaction finalized: ${status.asFinalized}`,
              );
              toast.success(
                `🌉Bridge Transaction finalized: ${status.asFinalized}`,
                {
                  position: "top-right",
                  autoClose: 8000,
                  hideProgressBar: false,
                  closeOnClick: false,
                  pauseOnHover: true,
                  draggable: true,
                  progress: undefined,
                  theme: "dark",
                },
              );
              unsub2(); // Unsubscribe from updates
              setIsLoading(false);
              console.log(`unsubscribing...`);
            }
          },
        );
        console.log(`all good, everything good`);
        toast.success("DOT→KSM sent");
        setIsLoading(false);
        await tmpapi.disconnect();
        return;
      } catch (error) {
        console.error("DOT→KSM swap creation failed:", error);
        toast.error("Failed to create DOT→KSM swap");
        setIsLoading(false);
        return;
      }
    }

    // Regular swap for other currency pairs
    setIsLoading(true);
    const finalDestinationAddress = requiresDestinationAddress(
      fromCurrency,
      toCurrency,
    )
      ? destinationAddress.trim()
      : evmAddress;

    try {
      console.log(
        `sending request:`,
        "fromCcy:",
        fromCurrency,
        "toCcy:",
        toCurrency,
        "amount:",
        parseFloat(swapAmount),
        "destination_addres:",
        finalDestinationAddress,
      );
      var itoc;
      itoc = toCurrency;
      if (toCurrency == "DOT") {
        itoc = "DOTAH";
      }
      var itof;
      itof = fromCurrency;
      if (itof == "DOT") {
        itof = "DOTAH";
      }
      const response = await fetch(`${SWAP_API_BASE}/trade`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fromCcy: itof,
          toCcy: itoc,
          amount: parseFloat(swapAmount),
          destination_addres: finalDestinationAddress,
        }),
      });
      console.log(`trade called`);
      const data = await response.json();
      if (data.status === "trade created :)") {
        setCurrentTrade(data.trade);
        setSwapStage("deposit");
        console.log(`trade data: `, data);

        // Generate QR code for deposit address
        console.log(`qr encoding address: `, data.trade.from.address);
        const qrData = await QRCode.toDataURL(data.trade.from.address);
        setQrCodeData(qrData);

        toast.success("Swap created successfully!");

        // Start immediate status check to get initial status data
        setTimeout(checkSwapStatus, 1000);
      } else {
        toast.error(`Failed to create swap`, {
          position: "top-right",
          autoClose: 5000,
          hideProgressBar: false,
          closeOnClick: false,
          pauseOnHover: true,
          draggable: true,
          progress: undefined,
          theme: "dark",
        });
        setError(data.error || "Failed to create swap");
      }
    } catch (err) {
      setError("Failed to create swap");
      toast.error(`Failed to create swap`, {
        position: "top-right",
        autoClose: 5000,
        hideProgressBar: false,
        closeOnClick: false,
        pauseOnHover: true,
        draggable: true,
        progress: undefined,
        theme: "dark",
      });
      console.error("Swap creation error:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const checkSwapStatus = async () => {
    if (!currentTrade?.trade_id) return;

    setIsPolling(true);
    try {
      const response = await fetch(`${SWAP_API_BASE}/order-status`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          orderid: currentTrade.trade_id,
        }),
      });

      const data = await response.json();

      if (data.msg === "found trade" && data.data?.data) {
        console.log(`Status update:`, data.data.data.status);
        console.log(`Full status data:`, data.data.data);
        console.log(`trade id:`, currentTrade.trade_id);
        const statusData = data.data.data;
        setSwapStatusData(statusData);
        setTradeData(data);

        // Sync countdown timer with server time
        if (statusData.time && typeof statusData.time.left === "number") {
          syncCountdown(statusData.time.left);
        }

        // Update swap stage based on status
        switch (statusData.status) {
          case "NEW":
            setSwapStage("deposit");
            break;
          case "PENDING":
          case "EXCHANGE":
          case "WITHDRAW":
            setSwapStage("processing");
            break;
          case "DONE":
            setSwapStage("completed");
            toast.success("Swap completed successfully!");
            stopPolling();
            stopCountdown();
            break;
          case "EXPIRED":
            toast.error("Swap expired");
            stopPolling();
            stopCountdown();
            break;
          case "EMERGENCY":
            toast.error(
              `🚨 Order requires manual review!\n\nPlease email kusamashield@smokes.thc.org with your order number: ${statusData.id}\n\nWe will sort it out straight away.`,
              {
                position: "top-center",
                autoClose: false,
                hideProgressBar: false,
                closeOnClick: true,
                pauseOnHover: true,
                draggable: true,
                progress: undefined,
                theme: "dark",
                style: {
                  whiteSpace: "pre-line",
                  textAlign: "center",
                  fontSize: "14px",
                  maxWidth: "500px",
                },
              },
            );
            stopPolling();
            break;
        }

        // Adjust polling frequency based on status
        updatePollingFrequency(statusData.status);
      }
    } catch (err) {
      console.error("Status check error:", err);
      toast.error("Failed to check swap status");
    } finally {
      setIsPolling(false);
    }
  };

  // Enhanced polling management
  const updatePollingFrequency = (status: string) => {
    let newInterval = 10000; // Default 10 seconds

    switch (status) {
      case "NEW":
        newInterval = 15000; // 15 seconds for new orders
        break;
      case "PENDING":
        newInterval = 5000; // 5 seconds for pending confirmation
        break;
      case "EXCHANGE":
      case "WITHDRAW":
        newInterval = 3000; // 3 seconds for active processing
        break;
      case "DONE":
      case "EXPIRED":
      case "EMERGENCY":
        return; // Stop polling for terminal states
    }

    if (newInterval !== pollInterval) {
      setPollInterval(newInterval);
      restartPolling(newInterval);
    }
  };

  const startPolling = (interval = 10000) => {
    stopPolling();
    pollIntervalRef.current = setInterval(checkSwapStatus, interval);
  };

  const stopPolling = () => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    setIsPolling(false);
  };

  const restartPolling = (newInterval: number) => {
    stopPolling();
    pollIntervalRef.current = setInterval(checkSwapStatus, newInterval);
  };

  const resetSwap = () => {
    setSwapStage("input");
    setCurrentTrade(null);
    setExchangeRate(null);
    setQrCodeData("");
    setSwapAmount("");
    setSwapStatusData(null);
    setTradeData(null);
    setDestinationAddress("");
    stopPolling();
    stopCountdown();
  };

  // Reset currencies when network changes
  useEffect(() => {
    // Don't reset currencies if there's an active swap in progress
    if (currentTrade || swapStage !== "input") {
      return;
    }

    const networkCurrencies = getAvailableCurrencies(selectedNetwork);
    const networkSymbols = networkCurrencies.map((c) => c.symbol);

    // Set specific defaults for Kusama AssetHub mainnet
    if (selectedNetwork === "kusama") {
      // For Kusama mainnet, set DOT as default from currency and KSM as default to currency
      setFromCurrency("DOT");
      setToCurrency("KSM");
    } else {
      // For other networks, reset to valid currencies if current selection is not available
      if (!networkSymbols.includes(fromCurrency)) {
        setFromCurrency(networkSymbols[0] || "PAS");
      }
      if (!networkSymbols.includes(toCurrency)) {
        setToCurrency(networkSymbols[1] || networkSymbols[0] || "PAS");
      }
    }

    // Reset exchange rate when network changes
    setExchangeRate(null);
  }, [selectedNetwork, currentTrade, swapStage]);

  // Cleanup countdown timer on unmount
  useEffect(() => {
    return () => {
      stopCountdown();
    };
  }, []);

  // Query user's token balances when wallet connects or network changes
  useEffect(() => {
    if (
      evmAddress &&
      (selectedNetwork.includes("paseo") || selectedNetwork === "polkadot")
    ) {
      queryUserAssets(evmAddress, selectedNetwork);

      // Refresh all balances (native + pallet assets) every 20 seconds
      const balanceInterval = setInterval(() => {
        queryUserAssets(evmAddress, selectedNetwork);
      }, 20000);

      return () => clearInterval(balanceInterval);
    } else {
      setUserAssets([]);
    }
  }, [evmAddress, selectedNetwork]);

  // Auto-refresh exchange rate when inputs change (only for mainnet)
  useEffect(() => {
    if (
      activeTab === "bridge" &&
      swapAmount &&
      fromCurrency &&
      toCurrency &&
      isMainnet(selectedNetwork)
    ) {
      const timer = setTimeout(fetchExchangeRate, 500);
      return () => clearTimeout(timer);
    }
  }, [swapAmount, fromCurrency, toCurrency, activeTab, selectedNetwork]);

  // Clear destination address when currencies change
  useEffect(() => {
    setDestinationAddress("");
  }, [fromCurrency, toCurrency]);

  // Auto-populate destination address with connected wallet for DOT/DOTAH swaps
  useEffect(() => {
    if (
      requiresDestinationAddress(fromCurrency, toCurrency) &&
      evmAddress &&
      !destinationAddress
    ) {
      // Only auto-populate if field is empty and we have a connected wallet
      setDestinationAddress(evmAddress);
    }
  }, [evmAddress, fromCurrency, toCurrency, destinationAddress]);

  // Validate destination address for DOT swaps (accepts both Polkadot and EVM addresses)
  useEffect(() => {
    if (toCurrency === "DOT" && destinationAddress.trim()) {
      const isValid = ispolkadotaddress(destinationAddress.trim()) || isEvmAddress(destinationAddress.trim());
      if (!isValid) {
        toast.error("Invalid Polkadot address format for DOT destination", {
          position: "top-right",
          autoClose: 5000,
          hideProgressBar: false,
          closeOnClick: true,
          pauseOnHover: true,
          draggable: true,
          progress: undefined,
          theme: "dark",
        });
        setError("Invalid Polkadot address format for DOT destination");
      } else {
        // Clear any previous address validation errors
        if (error === "Invalid Polkadot address format for DOT destination") {
          setError(null);
        }
      }
    }
  }, [destinationAddress, toCurrency]);

  // Auto-refresh swap status during processing
  useEffect(() => {
    if (
      (swapStage === "processing" || swapStage === "deposit") &&
      currentTrade?.trade_id
    ) {
      startPolling(pollInterval);
      return () => stopPolling();
    } else {
      stopPolling();
    }
  }, [swapStage, currentTrade]);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => stopPolling();
  }, []);

  const fetchPoolComposition = async () => {
    setIsLoadingPoolData(true);
    setLoadingProgress({ processed: 0, total: 0, found: 0, currentAsset: "" });
    try {
      const networkConfig = NETWORKS[selectedNetwork] as any;
      const rpcEndpoints = networkConfig?.rpcEndpoints || [networkConfig?.rpcEndpoint];
      const shieldAddr = networkConfig?.shield_address;
      const wsEndpoint = networkConfig?.wsEndpoint;
      if (!shieldAddr || !rpcEndpoints?.length) {
        setPoolComposition([]);
        return [];
      }

      // Try each RPC endpoint until one works
      let provider: ethers.JsonRpcProvider | null = null;
      let rpcEndpoint = "";
      for (const endpoint of rpcEndpoints) {
        try {
          provider = new ethers.JsonRpcProvider(endpoint);
          await provider.getBlockNumber(); // Test if endpoint works
          rpcEndpoint = endpoint;
          console.log(`Using RPC: ${endpoint}`);
          break;
        } catch (e) {
          console.warn(`RPC ${endpoint} failed, trying next...`);
          provider = null;
        }
      }
      if (!provider) {
        throw new Error("All RPC endpoints failed");
      }

      const abi = networkConfig?.abi || [
        "function escrow(address) external view returns (uint256)",
      ];
      const contract = new ethers.Contract(shieldAddr, abi, provider);
      const assets: {
        symbol: string;
        amount: number;
        decimals: number;
        assetId: number;
      }[] = [];

      // Native token
      setLoadingProgress((p) => ({ ...p, currentAsset: networkConfig.asset }));
      try {
        const nativeBalance = await contract.escrow(ethers.ZeroAddress);
        if (nativeBalance > 0) {
          assets.push({
            symbol: networkConfig.asset,
            amount: Number(ethers.formatUnits(nativeBalance, 18)),
            decimals: 18,
            assetId: 0,
          });
        }
      } catch (_) {}

      // Dynamic Substrate asset discovery
      if (wsEndpoint) {
        try {
          const { ApiPromise, WsProvider } = await import("@polkadot/api");
          const wsProvider = new WsProvider(wsEndpoint);
          const api = await ApiPromise.create({
            provider: wsProvider,
            noInitWarn: true,
          });
          if (!api.query.assets || !api.query.assets.metadata) {
            console.warn("Assets metadata pallet not available");
            await api.disconnect();
            throw new Error("No assets metadata pallet");
          }
          const assetsMetadata = await api.query.assets.metadata.entries();
          const assetIds: number[] = [];
          const assetSymbols: Record<number, string> = {};
          const assetDecimals: Record<number, number> = {};
          const precompileAddrs: Record<number, string> = {};

          const decodeHexBrowser = (hex: string): string => {
            if (!hex || hex === "0x") return "";
            const h = hex.startsWith("0x") ? hex.slice(2) : hex;
            if (!h) return "";
            let out = "";
            for (let i = 0; i < h.length; i += 2) {
              const code = parseInt(h[i], 16) * 16 + parseInt(h[i + 1], 16);
              out += String.fromCharCode(code);
            }
            return out.replace(/\0/g, "").trim();
          };

          for (const [key, value] of assetsMetadata) {
            const assetId = (key.args[0] as any).toNumber();
            if (assetId === 0) continue;
            assetIds.push(assetId);
            const metadata = value.toJSON() as any;
            if (!metadata) continue;
            const symbol =
              decodeHexBrowser(metadata.symbol) || `Asset-${assetId}`;
            const name = decodeHexBrowser(metadata.name);
            const displayName =
              symbol !== `Asset-${assetId}`
                ? symbol
                : name || `Asset-${assetId}`;
            assetSymbols[assetId] = displayName;
            assetDecimals[assetId] = metadata.decimals || 18;
            precompileAddrs[assetId] =
              `0x${assetId.toString(16).padStart(8, "0")}00000000000000000000000001200000`;
          }

          setLoadingProgress((p) => ({
            ...p,
            total: assetIds.length + 1,
            found: assets.length,
          }));

          const batchSize = 25;
          let processed = 1;
          let found = assets.length;

          for (let i = 0; i < assetIds.length; i += batchSize) {
            const batch = assetIds.slice(i, i + batchSize);
            const batchPromises = batch.map(async (assetId) => {
              try {
                const bal = await contract.escrow(precompileAddrs[assetId]);
                if (bal > 0) {
                  const amount = Number(
                    ethers.formatUnits(bal, assetDecimals[assetId]),
                  );
                  return {
                    symbol: assetSymbols[assetId],
                    amount,
                    decimals: assetDecimals[assetId],
                    assetId,
                  };
                }
              } catch (_) {}
              return null;
            });
            const batchResults = await Promise.all(batchPromises);
            for (let j = 0; j < batchResults.length; j++) {
              processed++;
              const result = batchResults[j];
              if (result) {
                assets.push(result);
                found++;
              }
              if (processed % 5 === 0 || processed === assetIds.length + 1) {
                setLoadingProgress({
                  processed,
                  total: assetIds.length + 1,
                  found,
                  currentAsset: result
                    ? `${result.symbol} (${result.assetId})`
                    : `Asset ${batch[j]}`,
                });
              }
            }
          }
          await api.disconnect();
        } catch (e) {
          console.warn("Substrate discovery failed:", e);
        }
      }

      assets.sort((a, b) => b.amount - a.amount);
      setPoolComposition(assets);
      return assets;
    } catch (error) {
      console.error("Failed to fetch pool composition:", error);
      setPoolComposition([]);
      return [];
    } finally {
      setIsLoadingPoolData(false);
    }
  };

  const renderPrivacyChart = useCallback(() => {
    if (!privacyChartRef.current || poolComposition.length === 0) return;
    try {
      const container = d3.select(privacyChartRef.current);
      container.selectAll("*").remove();

      const hierarchicalData = {
        name: "Pool",
        children: poolComposition.map((asset) => ({
          name: asset.symbol,
          value: asset.amount,
          assetId: asset.assetId,
          symbol: asset.symbol,
          amount: asset.amount,
          decimals: asset.decimals,
        })),
      };

      const wrapper = container.append("div").attr("class", "chart-wrapper");
      const containerWidth = privacyChartRef.current.clientWidth - 40;
      const chartSize = Math.min(containerWidth, 400);
      const width = chartSize;
      const height = chartSize;
      const radius = Math.min(width, height) / 6;

      const color = d3
        .scaleOrdinal()
        .domain(hierarchicalData.children.map((d) => d.name))
        .range(
          d3.quantize(
            d3.interpolateRainbow,
            hierarchicalData.children.length + 1,
          ),
        );

      const hierarchy = d3
        .hierarchy(hierarchicalData)
        .sum((d) => d.value)
        .sort((a, b) => (b.value || 0) - (a.value || 0));
      const root = d3.partition().size([2 * Math.PI, hierarchy.height + 1])(
        hierarchy,
      );
      root.each((d) => (d.current = d));

      const arc = d3
        .arc()
        .startAngle((d) => d.x0)
        .endAngle((d) => d.x1)
        .padAngle((d) => Math.min((d.x1 - d.x0) / 2, 0.005))
        .padRadius(radius * 1.5)
        .innerRadius((d) => d.y0 * radius)
        .outerRadius((d) => Math.max(d.y0 * radius, d.y1 * radius - 1));

      const arcVisible = (d) => d.y1 <= 3 && d.y0 >= 1 && d.x1 > d.x0;
      const labelVisible = (d) =>
        d.y1 <= 3 && d.y0 >= 1 && (d.y1 - d.y0) * (d.x1 - d.x0) > 0.03;
      const labelTransform = (d) => {
        const x = (((d.x0 + d.x1) / 2) * 180) / Math.PI;
        const y = ((d.y0 + d.y1) / 2) * radius;
        return `rotate(${x - 90}) translate(${y},0) rotate(${x < 180 ? 0 : 180})`;
      };

      const svg = wrapper
        .append("svg")
        .attr("viewBox", [-width / 2, -height / 2, width, width])
        .attr("width", width)
        .attr("height", height)
        .style("font", "10px 'Exo 2', sans-serif");

      const path = svg
        .append("g")
        .selectAll("path")
        .data(root.descendants().slice(1))
        .join("path")
        .attr("fill", (d) => {
          while (d.depth > 1) d = d.parent;
          return color(d.data.name);
        })
        .attr("fill-opacity", (d) =>
          arcVisible(d.current) ? (d.children ? 0.6 : 0.4) : 0,
        )
        .attr("pointer-events", (d) =>
          arcVisible(d.current) ? "auto" : "none",
        )
        .attr("d", (d) => arc(d.current))
        .on("mouseenter", function (event, d) {
          const total = root.value || 1;
          const pct = (((d.value || 0) / total) * 100).toFixed(1);
          container
            .append("div")
            .attr("class", "sunburst-tooltip")
            .style("position", "absolute")
            .style("background", "rgba(0,0,0,0.9)")
            .style("color", "white")
            .style("padding", "10px")
            .style("border-radius", "6px")
            .style("font-size", "12px")
            .style("pointer-events", "none")
            .style("z-index", "1000")
            .style("backdrop-filter", "blur(4px)")
            .style("border", "1px solid rgba(147, 51, 234, 0.3)")
            .html(
              `<strong style="color:#e91e63">${d.data.name || d.data.symbol}</strong><br/><span style="color:#9333ea">${d.value.toFixed(4)} (${pct}%)</span>`,
            )
            .style("left", event.pageX + 10 + "px")
            .style("top", event.pageY - 10 + "px");
        })
        .on("mouseleave", function () {
          container.selectAll(".sunburst-tooltip").remove();
        });

      svg
        .append("g")
        .attr("pointer-events", "none")
        .attr("text-anchor", "middle")
        .style("user-select", "none")
        .selectAll("text")
        .data(root.descendants().slice(1))
        .join("text")
        .attr("dy", "0.35em")
        .attr("fill-opacity", (d) => +labelVisible(d.current))
        .attr("transform", (d) => labelTransform(d.current))
        .attr("fill", "rgba(255, 255, 255, 0.9)")
        .text((d) => d.data.symbol || d.data.name);

      const defs = svg
        .append("defs")
        .append("linearGradient")
        .attr("id", "center-gradient")
        .attr("x1", "0%")
        .attr("x2", "100%");
      defs.append("stop").attr("offset", "0%").attr("stop-color", "#09002b");
      defs.append("stop").attr("offset", "100%").attr("stop-color", "#000000");
      svg
        .append("circle")
        .datum(root)
        .attr("r", radius / 4)
        .attr("fill", "url(#center-gradient)")
        .attr("stroke", "#9333ea")
        .attr("stroke-width", 2);
    } catch (error) {
      console.error("Error rendering sunburst chart:", error);
    }
  }, [poolComposition]);

  useEffect(() => {
    if (showPrivacy) {
      setIsLoadingPoolData(true);
      setLoadingProgress({
        processed: 0,
        total: 0,
        found: 0,
        currentAsset: "",
      });
      fetchPoolComposition()
        .then((assets) => {
          setPoolComposition(assets);
          setIsLoadingPoolData(false);
        })
        .catch((err) => {
          console.error("Failed to fetch pool composition:", err);
          setIsLoadingPoolData(false);
        });
    } else {
      setLoadingProgress({
        processed: 0,
        total: 0,
        found: 0,
        currentAsset: "",
      });
    }
  }, [showPrivacy, selectedNetwork]);

  useEffect(() => {
    if (showPrivacy && poolComposition.length > 0) {
      setTimeout(renderPrivacyChart, 50);
    }
  }, [poolComposition, showPrivacy]);

  // Estimate gas cost for shield/unshield
  useEffect(() => {
    if (activeTab === "bridge") {
      setEstimatedGasCost("");
      setIsGasPriceLoading(false);
      return;
    }

    setIsGasPriceLoading(true);
    const asset = (NETWORKS[selectedNetwork] as any)?.asset || "";

    const getGasCost = async (): Promise<string> => {
      let gasPriceWei: bigint;
      try {
        if (selectedWalletEVM && isWalletConnected) {
          const signer = await selectedWalletEVM.getSigner();
          const prov = signer.provider;
          if (prov) {
            const fd = await prov.getFeeData();
            if (fd.gasPrice && fd.gasPrice > 0n) {
              gasPriceWei = fd.gasPrice;
            } else {
              throw new Error("no gas price");
            }
          } else {
            throw new Error("no provider");
          }
        } else {
          const rpcUrl = (NETWORKS[selectedNetwork] as any)?.rpcEndpoint;
          if (!rpcUrl) throw new Error("no rpc");
          const resp = await fetch(rpcUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              jsonrpc: "2.0",
              id: 1,
              method: "eth_gasPrice",
              params: [],
            }),
            signal: AbortSignal.timeout(5000),
          });
          const json = await resp.json();
          if (json.error) throw new Error(json.error.message);
          gasPriceWei = BigInt(json.result);
        }
      } catch {
        gasPriceWei = ethers.parseUnits("1", "gwei");
      }

      let gasUnits: bigint;

      // Try to get a real gas estimate from the contract's deposit method
      try {
        const networkConfig = NETWORKS[selectedNetwork] as any;
        if (
          networkConfig?.shield_address &&
          networkConfig?.abi &&
          amount &&
          Number(amount) > 0
        ) {
          let provider: ethers.Provider;
          if (selectedWalletEVM && isWalletConnected) {
            provider = selectedWalletEVM;
          } else if (networkConfig.rpcEndpoint) {
            const rpcs = networkConfig.rpcEndpoints || [networkConfig.rpcEndpoint];
            let rpcProvider: ethers.JsonRpcProvider | null = null;
            for (const rpc of rpcs) {
              try {
                rpcProvider = new ethers.JsonRpcProvider(rpc);
                await rpcProvider.getBlockNumber();
                provider = rpcProvider;
                break;
              } catch {
                rpcProvider = null;
              }
            }
            if (!provider) throw new Error("All RPC endpoints failed");
          } else {
            throw new Error("no provider for estimate");
          }

          const contract = new ethers.Contract(
            networkConfig.shield_address,
            networkConfig.abi,
            provider,
          );

          const depositAmount = ethers.parseEther(amount);

          if (activeTab === "shield") {
            if (selectedNetwork === "kusama") {
              gasUnits = await contract.deposit3.estimateGas(
                ethers.ZeroAddress,
                depositAmount,
                ethers.ZeroHash,
                { value: depositAmount },
              );
            } else {
              // paseo_assethub, paseo_assethub_v2, polkadot all use depositNative
              const dummyCommitment = ethers.toBeArray(1n);
              const dummyNullifier = ethers.toBeArray(1n);
              gasUnits = await contract.depositNative.estimateGas(
                dummyCommitment,
                dummyNullifier,
                { value: depositAmount },
              );
            }
          } else if (activeTab === "unshield") {
            throw new Error("unshield estimate not implemented via contract");
          } else if (activeTab === "send") {
            // Simple transfer — use fixed estimate
            gasUnits = 21000n; // standard ETH transfer
          } else {
            throw new Error("unknown tab");
          }
        } else {
          throw new Error("no contract config or amount");
        }
      } catch (e) {
        console.warn("Gas estimate via contract failed, using defaults:", e);
        const recent = recentGasUnits[selectedNetwork];
        if (recent) {
          let recentGas =
            activeTab === "unshield" ? recent.unshield : recent.shield;
          // Apply proxy withdraw multiplier (17x) for Paseo unshield when enabled
          if (
            activeTab === "unshield" &&
            selectedNetwork === "paseo_assethub" &&
            useProxyWithdraw
          ) {
            recentGas = recentGas * 17n;
          }
          gasUnits = recentGas;
        } else {
          const defaults: Record<string, { shield: bigint; unshield: bigint }> =
            {
              paseo_assethub: { shield: 20000n, unshield: 40000n },
              paseo_assethub_v2: { shield: 25000n, unshield: 50000n },
              polkadot: { shield: 50000n, unshield: 100000n },
              westend_assethub: { shield: 150000n, unshield: 300000n },
              kusama: { shield: 200000n, unshield: 400000n },
            };
          let baseGasUnits = defaults[selectedNetwork]
            ? activeTab === "unshield"
              ? defaults[selectedNetwork].unshield
              : defaults[selectedNetwork].shield
            : 200000n;

          // Apply proxy withdraw multiplier (17x) for Paseo unshield when enabled
          if (
            activeTab === "unshield" &&
            selectedNetwork === "paseo_assethub" &&
            useProxyWithdraw
          ) {
            baseGasUnits = baseGasUnits * 17n;
          }

          gasUnits = baseGasUnits;
        }
      }

      const totalCost = gasUnits * gasPriceWei;
      return Number(ethers.formatEther(totalCost)).toString();
    };

    let cancelled = false;
    getGasCost()
      .then((costStr) => {
        if (!cancelled) {
          setEstimatedGasCost(costStr);
          setIsGasPriceLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setEstimatedGasCost("Error");
          setIsGasPriceLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [
    activeTab,
    selectedNetwork,
    isWalletConnected,
    selectedWalletEVM,
    amount,
    useProxyWithdraw,
  ]);

  return (
    <div className="App">
      <ToastContainer />
      <div className="header">
        <script src="/snarkjs.min.js"></script>
        <div className="header-controls">
          <NetworkSelect
            selectedNetwork={selectedNetwork}
            onNetworkChange={(network) =>
              setNetwork(network as keyof typeof NETWORKS)
            }
          />

          <UnifiedWalletSelector
            isWalletConnected={isWalletConnected}
            evmAddress={evmAddress}
            onAccountSelected={(account) => {
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
            setEvmAddress={setEvmAddress}
            setSelectedWalletEVM={setSelectedWalletEVM}
            setIsWalletConnected={setIsWalletConnected}
          />
        </div>
      </div>

      <div className="swap-container">
        <div
          className={`swap-box ${activeTab === "bridge" || activeTab === "offramp" || activeTab === "send" ? "no-shield-shape" : ""}`}
        >
          <div className="tabs">
            {selectedNetwork !== "base" && (
              <>
                <button
                  className={`tab ${activeTab === "shield" ? "active" : ""}`}
                  onClick={() => setActiveTab("shield")}
                >
                  Shield
                </button>
                <button
                  className={`tab ${activeTab === "unshield" ? "active" : ""}`}
                  onClick={() => setActiveTab("unshield")}
                >
                  Unshield
                </button>
                <button
                  className={`tab ${activeTab === "send" ? "active" : ""}`}
                  onClick={() => setActiveTab("send")}
                  disabled={isTestnet(selectedNetwork)}
                  title={
                    isTestnet(selectedNetwork)
                      ? "Send not available on testnet"
                      : undefined
                  }
                  style={
                    isTestnet(selectedNetwork)
                      ? { opacity: 0.6, cursor: "not-allowed" }
                      : undefined
                  }
                >
                  Send
                </button>
                <button
                  className={`tab ${activeTab === "bridge" ? "active" : ""}`}
                  onClick={() => setActiveTab("bridge")}
                  disabled={isTestnet(selectedNetwork)}
                  title={
                    isTestnet(selectedNetwork)
                      ? "Bridge not available on testnet"
                      : undefined
                  }
                  style={
                    isTestnet(selectedNetwork)
                      ? { opacity: 0.6, cursor: "not-allowed" }
                      : undefined
                  }
                >
                  {getBridgeTitle(selectedNetwork)}
                </button>
              </>
            )}
            <button
              className={`tab ${activeTab === "offramp" ? "active" : ""}`}
              onClick={() => setActiveTab("offramp")}
              disabled={isTestnet(selectedNetwork)}
              title={
                isTestnet(selectedNetwork)
                  ? "Offramp not available on testnet"
                  : undefined
              }
              style={
                isTestnet(selectedNetwork)
                  ? { opacity: 0.6, cursor: "not-allowed" }
                  : undefined
              }
            >
              Offramp
            </button>
          </div>
          {/* Tab content */}
          {activeTab === "offramp" ? (
            viemWalletClient ? (
              <OfframpWidget
                walletClient={viemWalletClient}
                selectedNetwork={selectedNetwork}
              />
            ) : (
              <div
                style={{ textAlign: "center", padding: "2rem", color: "#888" }}
              >
                Please connect an EVM wallet (MetaMask, WalletConnect, etc.) to
                use Offramp
              </div>
            )
          ) : (
            <>
              <div className="input-group">
                {activeTab === "bridge" && (
                  <div className="swap-interface">
                    {swapStage === "input" && (
                      <>
                        <div className="currency-selection">
                          <div className="currency-input">
                            <label>From:</label>
                            <select
                              value={fromCurrency}
                              onChange={(e) => {
                                const newFromCurrency = e.target.value;
                                setFromCurrency(newFromCurrency);
                                // Prevent same currency to same currency swaps
                                if (newFromCurrency === toCurrency) {
                                  const availableCurrencies =
                                    getAvailableCurrencies(selectedNetwork);
                                  const filteredCurrencies =
                                    availableCurrencies.filter(
                                      (c) => c.symbol !== newFromCurrency,
                                    );
                                  if (filteredCurrencies.length > 0) {
                                    setToCurrency(filteredCurrencies[0].symbol);
                                  }
                                }
                              }}
                              className="currency-select"
                            >
                              {/* Standard currencies */}
                              {getAvailableCurrencies(selectedNetwork)
                                .filter(
                                  (c) =>
                                    !userAssets.some(
                                      (a) => a.symbol === c.symbol,
                                    ),
                                )
                                .map((currency) => (
                                  <option
                                    key={currency.symbol}
                                    value={currency.symbol}
                                  >
                                    {currency.symbol} - {currency.name}
                                  </option>
                                ))}
                            </select>
                            <img
                              src={
                                getAvailableCurrencies(selectedNetwork).find(
                                  (c) => c.symbol === fromCurrency,
                                )?.logo
                              }
                              alt={fromCurrency}
                              className="currency-logo"
                              style={{
                                width: "24px",
                                height: "24px",
                                marginLeft: "8px",
                              }}
                            />
                          </div>

                          <div
                            className="swap-arrow"
                            onClick={() => {
                              const temp = fromCurrency;
                              const newFromCurrency = toCurrency;
                              const newToCurrency = temp;

                              // Prevent DOT to DOT swaps
                              if (
                                newFromCurrency === "DOT" &&
                                newToCurrency === "DOT"
                              ) {
                                // Don't swap if both would be DOT
                                return;
                              }

                              setFromCurrency(newFromCurrency);
                              setToCurrency(newToCurrency);
                            }}
                          >
                            ⇄
                          </div>

                          <div className="currency-input">
                            <label>To:</label>
                            <select
                              value={toCurrency}
                              onChange={(e) => {
                                const newToCurrency = e.target.value;
                                setToCurrency(newToCurrency);
                              }}
                              className="currency-select"
                            >
                              {/* Standard currencies */}
                              {getAvailableCurrencies(selectedNetwork)
                                .filter(
                                  (currency) =>
                                    currency.symbol !== fromCurrency,
                                )
                                .map((currency) => (
                                  <option
                                    key={currency.symbol}
                                    value={currency.symbol}
                                  >
                                    {currency.symbol} - {currency.name}
                                  </option>
                                ))}
                            </select>
                            <img
                              src={
                                getAvailableCurrencies(selectedNetwork).find(
                                  (c) => c.symbol === toCurrency,
                                )?.logo
                              }
                              alt={toCurrency}
                              className="currency-logo"
                              style={{
                                width: "24px",
                                height: "24px",
                                marginLeft: "8px",
                              }}
                            />
                          </div>
                        </div>

                        <div className="amount-input">
                          <label>Amount:</label>
                          <input
                            type="number"
                            value={swapAmount}
                            onChange={(e) => setSwapAmount(e.target.value)}
                            placeholder={`Enter ${fromCurrency} amount`}
                            step="0.00000001"
                            min="0.1"
                          />
                          <div className="balance-display">
                            Destination Balance: Coming soon to {toCurrency}
                          </div>
                        </div>

                        {requiresDestinationAddress(
                          fromCurrency,
                          toCurrency,
                        ) && (
                          <div className="amount-input">
                            <label>{toCurrency} Destination Address:</label>
                            <input
                              type="text"
                              value={destinationAddress}
                              onChange={(e) =>
                                setDestinationAddress(e.target.value)
                              }
                              placeholder={
                                evmAddress && !destinationAddress
                                  ? `Will use connected wallet: ${evmAddress.slice(0, 10)}...`
                                  : `Enter ${toCurrency} address to receive funds`
                              }
                              className="destination-address-input"
                            />
                            <div className="address-help">
                              {evmAddress
                                ? `Auto-filled with connected wallet address. You can change it if needed.`
                                : `Enter a valid ${toCurrency} address where you want to receive your ${toCurrency} tokens. No wallet connection required.`}
                            </div>
                          </div>
                        )}

                        {isMainnet(selectedNetwork) && exchangeRate && (
                          <div className="exchange-rate-display">
                            <div className="rate-info">
                              <div>
                                Rate: 1 {toCurrency} = {exchangeRate.rate}{" "}
                                {fromCurrency}
                              </div>
                              <div>
                                Source Chain:{" "}
                                {getNetworkForCurrency(fromCurrency)}
                              </div>
                              <div>
                                Destination Chain:{" "}
                                {getNetworkForCurrency(toCurrency)}
                              </div>
                              <div>
                                You will send: ~{exchangeRate.from_amount}{" "}
                                {fromCurrency}
                              </div>
                              <div>
                                You will receive: ~{exchangeRate.to_amount}{" "}
                                {toCurrency}
                              </div>
                              <div className="fee-info">
                                Fee: 0.6% (included in the floating rate)
                              </div>
                            </div>
                          </div>
                        )}

                        {isTestnet(selectedNetwork) && (
                          <div className="bridge-info">
                            <div className="network-info">
                              <div>
                                From: {getNetworkForCurrency(fromCurrency)} (
                                {fromCurrency})
                              </div>
                              <div>
                                To: {getNetworkForCurrency(toCurrency)} (
                                {toCurrency})
                              </div>
                            </div>
                            <div className="info-box">
                              <h4>XCM Bridge</h4>
                              <p>
                                Cross-chain transfers between{" "}
                                {NETWORKS[selectedNetwork].asset} and other
                                parachains
                              </p>
                              <p className="note">
                                Exchange rates are determined by the destination
                                network
                              </p>
                            </div>
                          </div>
                        )}
                      </>
                    )}

                    {swapStage === "deposit" && currentTrade && (
                      <div className="deposit-stage">
                        <h3>Send {fromCurrency} to complete swap</h3>
                        <div className="deposit-info">
                          <div className="deposit-address">
                            <label>
                              Send {fromCurrency} to this Deposit Address:
                            </label>
                            <div className="address-container">
                              {qrCodeData && (
                                <div className="qr-code">
                                  <img
                                    src={qrCodeData}
                                    alt="Deposit Address QR Code"
                                  />
                                </div>
                              )}
                              <code>{currentTrade.from.address}</code>
                              <button
                                onClick={() => {
                                  navigator.clipboard.writeText(
                                    currentTrade.from.address,
                                  );
                                  toast("📋 Address copied to clipboard!", {
                                    position: "top-right",
                                    autoClose: 3000,
                                    hideProgressBar: false,
                                    closeOnClick: true,
                                    pauseOnHover: true,
                                    draggable: true,
                                    progress: undefined,
                                    theme: "dark",
                                  });
                                }}
                                title="Copy to clipboard"
                              >
                                📋
                              </button>
                            </div>
                          </div>

                          <div className="deposit-network">
                            <label>Send {fromCurrency} on the network:</label>
                            <div className="amount-display">
                              {getNetworkForCurrency(fromCurrency)}
                            </div>
                          </div>

                          <div className="deposit-network">
                            <label>Required block confirmations:</label>
                            <div className="amount-display">
                              {currentTrade.from.reqConfirmations}
                            </div>
                          </div>

                          <div className="deposit-amount">
                            <label>Send exactly:</label>
                            <div className="address-container">
                              <div className="amount-display">
                                {currentTrade.from.amount} {fromCurrency}
                              </div>
                              <button
                                onClick={() => {
                                  navigator.clipboard.writeText(
                                    currentTrade.from.amount,
                                  );
                                  toast("📋 Amount copied to clipboard!", {
                                    position: "top-right",
                                    autoClose: 3000,
                                    hideProgressBar: false,
                                    closeOnClick: true,
                                    pauseOnHover: true,
                                    draggable: true,
                                    progress: undefined,
                                    theme: "dark",
                                  });
                                }}
                                title="Copy amount to clipboard"
                              >
                                📋
                              </button>
                            </div>
                          </div>

                          {localTimeLeft !== null && localTimeLeft > 0 && (
                            <div className="deposit-amount">
                              <label>Time remaining:</label>
                              <div
                                className={`amount-display time-remaining ${
                                  localTimeLeft < 300 ? "warning" : ""
                                }`}
                              >
                                ⏰ {formatTimeLeft(localTimeLeft)}
                              </div>
                            </div>
                          )}

                          <div className="deposit-amount">
                            <label>Receiving:</label>
                            <div className="amount-display">
                              {currentTrade.to.amount} {toCurrency}
                            </div>
                          </div>

                          <div className="deposit-amount">
                            <label>Receiving address:</label>
                            <div className="address-container">
                              <div className="amount-display">
                                {currentTrade.to.address}
                              </div>
                              <button
                                onClick={() => {
                                  navigator.clipboard.writeText(
                                    currentTrade.to.address,
                                  );
                                  toast(
                                    "📋 Receiving address copied to clipboard!",
                                    {
                                      position: "top-right",
                                      autoClose: 3000,
                                      hideProgressBar: false,
                                      closeOnClick: true,
                                      pauseOnHover: true,
                                      draggable: true,
                                      progress: undefined,
                                      theme: "dark",
                                    },
                                  );
                                }}
                                title="Copy receiving address to clipboard"
                              >
                                📋
                              </button>
                            </div>
                          </div>

                          <div className="swap-progress">
                            <button
                              onClick={() => setSwapStage("processing")}
                              className="confirm-deposit-button"
                            >
                              I've sent the {fromCurrency}
                            </button>
                            <button
                              onClick={resetSwap}
                              className="cancel-swap-button"
                            >
                              Cancel Swap
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    {swapStage === "processing" && (
                      <div className="processing-stage">
                        <h3>Processing Swap...</h3>
                        {swapStatusData ? (
                          <SwapStatusTracker
                            statusData={swapStatusData}
                            fromCurrency={fromCurrency}
                            toCurrency={toCurrency}
                            isPolling={isPolling}
                          />
                        ) : (
                          <>
                            <div className="loading-spinner"></div>
                            <p>
                              Waiting for confirmation and processing your swap
                            </p>
                            <div className="trade-id">
                              Trade ID: {currentTrade?.trade_id}
                            </div>
                          </>
                        )}
                      </div>
                    )}

                    {swapStage === "completed" && (
                      <div className="completed-stage">
                        <h3>✅ Swap Completed!</h3>
                        <p>
                          Your {swapStatusData?.to?.code || toCurrency} has been
                          sent to your address
                        </p>
                        {swapStatusData && (
                          <SwapStatusTracker
                            statusData={swapStatusData}
                            fromCurrency={fromCurrency}
                            toCurrency={toCurrency}
                            isPolling={false}
                          />
                        )}
                        <button
                          onClick={resetSwap}
                          className="new-swap-button"
                          style={{
                            background:
                              "linear-gradient(135deg, #8b5cf6 0%, #3b82f6 50%, #06b6d4 100%)",
                            border: "none",
                            borderRadius: "12px",
                            padding: "16px 32px",
                            color: "white",
                            fontSize: "16px",
                            fontWeight: "600",
                            cursor: "pointer",
                            transition: "all 0.3s ease",
                            boxShadow: "0 4px 15px rgba(139, 92, 246, 0.3)",
                            textTransform: "none",
                            letterSpacing: "0.5px",
                            minWidth: "200px",
                            margin: "20px auto 0",
                            display: "block",
                            position: "relative",
                            overflow: "hidden",
                          }}
                          onMouseEnter={(e) => {
                            (e.target as HTMLElement).style.transform =
                              "translateY(-2px)";
                            (e.target as HTMLElement).style.boxShadow =
                              "0 8px 25px rgba(139, 92, 246, 0.4)";
                          }}
                          onMouseLeave={(e) => {
                            (e.target as HTMLElement).style.transform =
                              "translateY(0)";
                            (e.target as HTMLElement).style.boxShadow =
                              "0 4px 15px rgba(139, 92, 246, 0.3)";
                          }}
                          onMouseDown={(e) => {
                            (e.target as HTMLElement).style.transform =
                              "translateY(0) scale(0.98)";
                          }}
                          onMouseUp={(e) => {
                            (e.target as HTMLElement).style.transform =
                              "translateY(-2px) scale(1)";
                          }}
                        >
                          <span style={{ position: "relative", zIndex: 2 }}>
                            ✨ Start New Swap
                          </span>
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {activeTab === "send" && (
                  <div className="input-group">
                    <div
                      style={{
                        textAlign: "center",
                        padding: "1rem 0 0.5rem 0",
                        fontSize: "1.1rem",
                        fontWeight: 500,
                        color: "#a78bfa",
                      }}
                    >
                      Pay any invoice privatly
                    </div>

                    <div
                      className="send-info-box"
                      style={{
                        margin: "0.5rem 1rem 1rem 1rem",
                        padding: "0.75rem 1rem",
                        background: "rgba(124, 58, 237, 0.08)",
                        border: "1px solid rgba(124, 58, 237, 0.2)",
                        borderRadius: "10px",
                        fontSize: "0.8rem",
                        color: "#b0a0d0",
                        lineHeight: "1.5",
                        textAlign: "left",
                      }}
                    >
                      <strong style={{ color: "#a78bfa" }}>How it works</strong><br />
                      Your coins are sent into the shielded<br />
                      pool on Polkadot, withdrawn<br />
                      anonymously, and swapped into {sendToCurrency} —<br />
                      with no on-chain link between sender<br />
                      and receiver.
                    </div>

                    <div className="swap-interface">
                      <div className="currency-selection">
                        <div className="currency-input">
                          <label>Send Coin:</label>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, overflow: "hidden" }}>
                            {getAvailableCurrencies(selectedNetwork).find(c => c.symbol === sendFromCurrency)?.logo && (
                              <img 
                                src={getAvailableCurrencies(selectedNetwork).find(c => c.symbol === sendFromCurrency)?.logo} 
                                alt={sendFromCurrency}
                                style={{ width: 24, height: 24, flexShrink: 0 }} 
                              />
                            )}
                            <select
                              value={sendFromCurrency}
                              onChange={(e) => setSendFromCurrency(e.target.value)}
                              className="currency-select"
                              style={{ flex: 1, minWidth: 0 }}
                            >
                              {getAvailableCurrencies(selectedNetwork).map((c) => (
                                <option key={c.symbol} value={c.symbol}>
                                  {c.symbol} - {c.name}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>

                        <div
                          className="swap-arrow"
                          onClick={() => {
                            const temp = sendFromCurrency;
                            setSendFromCurrency(sendToCurrency);
                            setSendToCurrency(temp);
                          }}
                        >
                          ⇄
                        </div>

                        <div className="currency-input">
                          <label>Receiver Coin:</label>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, overflow: "hidden" }}>
                            {getAvailableCurrencies(selectedNetwork).find(c => c.symbol === sendToCurrency)?.logo && (
                              <img 
                                src={getAvailableCurrencies(selectedNetwork).find(c => c.symbol === sendToCurrency)?.logo} 
                                alt={sendToCurrency}
                                style={{ width: 24, height: 24, flexShrink: 0 }} 
                              />
                            )}
                            <select
                              value={sendToCurrency}
                              onChange={(e) => setSendToCurrency(e.target.value)}
                              className="currency-select"
                              style={{ flex: 1, minWidth: 0 }}
                            >
                              {getAvailableCurrencies(selectedNetwork)
                                .map((c) => (
                                  <option key={c.symbol} value={c.symbol}>
                                    {c.symbol} - {c.name}
                                  </option>
                                ))}
                            </select>
                          </div>
                        </div>
                      </div>

                      <div className="token-input">
                        <label>Recipient Address:</label>
                        <input
                          type="text"
                          placeholder={sendFromCurrency === sendToCurrency 
                            ? "Enter recipient address (0x... or SS58 address)"
                            : `Enter your ${sendToCurrency} wallet address`}
                          value={sendRecipient}
                          onChange={(e) => setSendRecipient(e.target.value)}
                          className="amount-input"
                          style={{
                            boxSizing: "border-box",
                          }}
                        />
                      </div>

                      <div className="token-input">
                        <label>
                          Amount: {sendAmount || "0"} {sendFromCurrency}
                        </label>
                        <input
                          type="number"
                          placeholder="0.0"
                          value={sendAmount}
                          onChange={(e) => setSendAmount(e.target.value)}
                          min="1"
                          step="0.1"
                          className="amount-input"
                          style={{
                            boxSizing: "border-box",
                          }}
                        />
                      </div>

                      {estimatedReceiveLoading && (
                        <div style={{ textAlign: "center", marginTop: "0.5rem", color: "#a855f7" }}>
                          Getting rate...
                        </div>
                      )}

                      {estimatedReceive && !estimatedReceiveLoading && (
                        <div style={{ textAlign: "center", marginTop: "0.5rem", color: "#10b981" }}>
                          {sendFromCurrency === sendToCurrency 
                            ? `Estimated tx fee: ~${estimatedReceive} ${sendToCurrency}`
                            : `Estimated Receiver amount: ${estimatedReceive} ${sendToCurrency}`}
                        </div>
                      )}
                      
                      {swapRate && sendFromCurrency !== sendToCurrency && (
                        <div style={{ textAlign: "center", marginTop: "0.25rem", color: "#a78bfa", fontSize: "0.85rem" }}>
                          {swapRate}
                        </div>
                      )}
                      
                      {sendGasFee && !estimatedReceiveLoading && (
                        <div style={{ textAlign: "center", marginTop: "0.25rem", color: "#f59e0b", fontSize: "0.8rem" }}>
                          Est. network fee: ~{sendGasFee} {sendFromCurrency}
                        </div>
                      )}

                      {sendGasLoading && (
                        <div style={{ textAlign: "center", marginTop: "0.5rem", color: "#a855f7" }}>
                          Estimating gas...
                        </div>
                      )}

                      <button
                        className={`action-button swap-button ${isLoading ? "loading" : ""}`}
                        onClick={handleSendTransaction}
                        disabled={!sendRecipient || !sendAmount || isTestnet(selectedNetwork) || isLoading}
                        style={{
                          width: "100%",
                          marginTop: "1rem",
                          padding: "1rem",
                          background:
                            !sendRecipient || !sendAmount || isTestnet(selectedNetwork) || isLoading
                              ? "#333"
                              : "linear-gradient(135deg, #7c3aed, #a78bfa)",
                          border: "none",
                          borderRadius: "12px",
                          color: "#fff",
                          fontSize: "1rem",
                          fontWeight: 600,
                          cursor:
                            !sendRecipient || !sendAmount || isTestnet(selectedNetwork) || isLoading
                              ? "not-allowed"
                              : "pointer",
                        }}
                      >
                        {isLoading
                          ? "Processing shielded transfer..."
                          : isTestnet(selectedNetwork)
                            ? "Send disabled for testnet"
                            : `Send ${sendFromCurrency} → ${sendToCurrency}`}
                      </button>

                      <div
                        style={{
                          textAlign: "center",
                          marginTop: "0.75rem",
                          fontSize: "0.8rem",
                          color: "#666",
                        }}
                      >
                        Shielded swap & send — receiver gets {sendToCurrency}
                      </div>
                    </div>
                  </div>
                )}

                {activeTab !== "bridge" && activeTab !== "send" && (
                  <div className="token-input">
                    <div className="amount-slider-container">
                      <label>
                        Amount: {amount} {NETWORKS[selectedNetwork].asset}
                      </label>
                      <div className="amount-slider">
                        <input
                          type="range"
                          min="0"
                          max="6"
                          value={amountOptions.indexOf(parseInt(amount))}
                          onChange={(e) =>
                            setAmount(
                              amountOptions[
                                parseInt(e.target.value)
                              ].toString(),
                            )
                          }
                          className="amount-range-slider"
                        />
                        <div className="amount-labels">
                          {amountOptions.map((option) => (
                            <span
                              key={option}
                              className={`amount-label ${amount === option.toString() ? "active" : ""}`}
                              onClick={() => setAmount(option.toString())}
                            >
                              {option}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                    <select
                      value={selectedToken}
                      onChange={(e) => setSelectedToken(e.target.value)}
                    >
                      <option
                        title="native Currency"
                        value={NETWORKS[selectedNetwork].asset}
                      >
                        {NETWORKS[selectedNetwork].asset} (Native)
                      </option>

                      {/* User's detected assets */}
                      {isLoadingAssets && (
                        <option disabled>Loading your assets...</option>
                      )}
                      {userAssets
                        .filter(
                          (a) => a.symbol !== NETWORKS[selectedNetwork].asset,
                        )
                        .map((asset) => (
                          <option
                            key={asset.assetId}
                            title={`${asset.name} (Asset ${asset.assetId})`}
                            value={asset.symbol}
                          >
                            {asset.symbol} - {asset.name} ({asset.assetId})
                          </option>
                        ))}

                      {/* Fallback: Alternative assets from config */}
                      {(
                        NETWORKS[selectedNetwork] as any
                      ).alternative_assets?.map((token: any) => (
                        <option
                          key={token.name}
                          title={`${token.name} (${token.address})`}
                          value={token.name}
                        >
                          {token.name}
                        </option>
                      ))}
                    </select>

                    {/* Proxy withdraw checkbox for Paseo network (unshield tab only) */}
                    {activeTab === "unshield" &&
                      selectedNetwork === "paseo_assethub" && (
                        <div
                          className="proxy-withdraw-option"
                          style={{
                            marginTop: "15px",
                            marginBottom: "10px",
                            padding: "10px 12px",
                            background: "rgba(0, 0, 0, 0.05)",
                            borderRadius: "8px",
                            border: "1px solid rgba(0, 0, 0, 0.1)",
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                            }}
                          >
                            <div style={{ flex: 1 }}>
                              <div
                                style={{
                                  fontSize: "0.95rem",
                                  fontWeight: 500,
                                  color: "#333",
                                  marginBottom: "2px",
                                }}
                              >
                                Proxy Withdraw
                              </div>
                              <div
                                style={{
                                  fontSize: "0.85rem",
                                  color: "#666",
                                  lineHeight: "1.3",
                                }}
                              >
                                Create a unique address that your funds are sent
                                via for unique sender addresses every time
                              </div>
                            </div>
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "10px",
                              }}
                            >
                              <span
                                style={{
                                  fontSize: "0.85rem",
                                  color: "#666",
                                  fontStyle: "italic",
                                }}
                              >
                                {useProxyWithdraw ? "Enabled" : "Disabled"}
                              </span>
                              <div
                                style={{
                                  position: "relative",
                                  width: "40px",
                                  height: "20px",
                                }}
                              >
                                <input
                                  type="checkbox"
                                  checked={useProxyWithdraw}
                                  onChange={(e) =>
                                    setUseProxyWithdraw(e.target.checked)
                                  }
                                  style={{
                                    position: "absolute",
                                    top: 0,
                                    left: 0,
                                    width: "100%",
                                    height: "100%",
                                    opacity: 0,
                                    cursor: "pointer",
                                    zIndex: 2,
                                  }}
                                />
                                <div
                                  style={{
                                    position: "absolute",
                                    top: 0,
                                    left: 0,
                                    width: "100%",
                                    height: "100%",
                                    background: useProxyWithdraw
                                      ? "#007bff"
                                      : "#ccc",
                                    borderRadius: "10px",
                                    transition: "all 0.3s ease",
                                    pointerEvents: "none",
                                  }}
                                >
                                  <div
                                    style={{
                                      position: "absolute",
                                      top: "2px",
                                      left: useProxyWithdraw ? "22px" : "2px",
                                      width: "16px",
                                      height: "16px",
                                      background: "#fff",
                                      borderRadius: "50%",
                                      transition: "all 0.3s ease",
                                      boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                                      pointerEvents: "none",
                                    }}
                                  />
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                    <div
                      className="balance"
                      style={{ marginLeft: "auto", textAlign: "right" }}
                    >
                      {(selectedNetwork.includes("paseo") ||
                        selectedNetwork === "polkadot") &&
                      userAssets.length > 0 ? (
                        selectedToken &&
                        userAssets.find((a) => a.symbol === selectedToken) ? (
                          <span>
                            Balance:{" "}
                            {formatBalance(
                              userAssets.find(
                                (a) => a.symbol === selectedToken,
                              ),
                            )}{" "}
                            {selectedToken}
                          </span>
                        ) : (
                          <span>
                            Balance: 0.0000{" "}
                            {selectedToken || NETWORKS[selectedNetwork].asset}
                          </span>
                        )
                      ) : (
                        <span>
                          Balance: {userBalance}{" "}
                          {NETWORKS[selectedNetwork].asset}
                        </span>
                      )}
                    </div>
                    {(activeTab === "shield" || activeTab === "unshield") && (
                      <div
                        className="balance"
                        style={{
                          marginLeft: "auto",
                          textAlign: "right",
                          opacity: 0.75,
                        }}
                      >
                        Gas Price:{" "}
                        {isGasPriceLoading ? (
                          <span style={{ opacity: 0.7 }}>Calculating...</span>
                        ) : estimatedGasCost ? (
                          <>
                            {estimatedGasCost} {NETWORKS[selectedNetwork].asset}
                          </>
                        ) : (
                          <span style={{ opacity: 0.7 }}>Not available</span>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {activeTab === "shield" &&
                  (NETWORKS[selectedNetwork] as any).faucet && (
                    <center>
                      <div className="balance">
                        <a
                          title="faucet link"
                          target="_blank"
                          href={(NETWORKS[selectedNetwork] as any).faucet}
                        >
                          {NETWORKS[selectedNetwork].name} faucet link
                        </a>
                      </div>
                    </center>
                  )}

                {activeTab === "shield" && (
                  <center>
                    <div className="balance">
                      <a
                        title="Documentation link"
                        target="_blank"
                        href={(NETWORKS[selectedNetwork] as any).docs}
                      >
                        {NETWORKS[selectedNetwork].name} Documentation
                      </a>
                    </div>
                  </center>
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
              {(activeTab !== "bridge" || swapStage === "input") && activeTab !== "send" && (
                <button
                  className={`swap-button ${isLoading ? "loading" : ""}`}
                  onClick={
                    activeTab === "shield"
                      ? handleShield
                      : activeTab === "unshield"
                        ? handleUnshield
                        : activeTab === "bridge"
                          ? isMainnet(selectedNetwork)
                            ? createSwap
                            : handleBridge
                          : () => {}
                  }
                  disabled={
                    isLoading ||
                    (requiresWalletConnection() && !isWalletConnected)
                  }
                >
                  {isLoading
                    ? "Processing..."
                    : activeTab === "shield"
                      ? "Shield"
                      : activeTab === "unshield"
                        ? "Unshield"
                        : activeTab === "bridge"
                          ? isMainnet(selectedNetwork)
                            ? swapStage === "input"
                              ? "Create Swap"
                              : "Continue"
                            : "Bridge Tokens"
                          : "Action"}
                </button>
              )}
            </>
          )}
        </div>{" "}
        {/* Close swap-box */}
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
          By using this website you agree to the Terms of Service.
        </button>
        <button className="privacy-button" onClick={() => setShowPrivacy(true)}>
          🌳 Privacy Guarantee Chart
        </button>
        <button
          className="settings-button"
          onClick={() => setShowSettings(true)}
        >
          <img src="/toolbox.png" alt="Settings" className="settings-icon" />
          Customize Theme
        </button>
        <div style={{ display: "flex", justifyContent: "center", gap: "8px", marginTop: "8px" }}>
          <a
            href="https://kusamashield.codeberg.page/deploy.html"
            title="run Kusama Shield locally"
          >
            <img src="/run_locally.gif" alt="run with ipfs" />
          </a>
          <button
            onClick={() => setShowNameGen(true)}
            title="Fake name generator and email forwarder"
            style={{ background: "none", border: "none", cursor: "pointer", padding: "0 4px" }}
          >
            <img src="/mustach_smile.png" alt="mustach" style={{ width: "90%", height: "90%" }} />
          </button>
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            marginTop: "10px",
          }}
        >
          <a
            href="https://kusama.network/"
            target="_blank"
            title="Kusama Network"
            className="terms-button"
          >
            🐦 Funded by Kusama Network 🐦
          </a>
        </div>
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
        {showPrivacy && (
          <div className="help-modal">
            <div className="help-modal-content">
              <h2>Privacy Dashboard</h2>
              <div className="help-section">
                <h3>Shielded Pool Composition</h3>
                <p>
                  Click "Scan Pool" to query assets currently in the privacy
                  pool.
                </p>
                {!isLoadingPoolData && poolComposition.length > 0 && (
                  <div
                    style={{
                      margin: "10px 0",
                      padding: "12px",
                      background: "rgba(147, 51, 234, 0.08)",
                      borderRadius: "8px",
                      border: "1px solid rgba(147, 51, 234, 0.2)",
                    }}
                  >
                    <div
                      style={{
                        color: "#aaa",
                        fontSize: "0.85rem",
                        marginBottom: "8px",
                        fontWeight: "bold",
                      }}
                    >
                      Pool Assets
                    </div>
                    {poolComposition.map((a, i) => (
                      <div
                        key={i}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          padding: "4px 0",
                          borderBottom:
                            i < poolComposition.length - 1
                              ? "1px solid rgba(147, 51, 234, 0.1)"
                              : "none",
                        }}
                      >
                        <span style={{ color: "#e91e63", fontWeight: "bold" }}>
                          {a.symbol}
                        </span>
                        <span
                          style={{ color: "white", fontFamily: "monospace" }}
                        >
                          {a.amount.toFixed(4)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                <div
                  id="anonymity-chart-container"
                  ref={privacyChartRef}
                  style={{
                    width: "100%",
                    height: "450px",
                    margin: "20px 0",
                    background: "rgba(9, 0, 43, 0.3)",
                    borderRadius: "12px",
                    border: "1px solid rgba(147, 51, 234, 0.3)",
                    overflow: "hidden",
                    position: "relative",
                  }}
                />
                {isLoadingPoolData ? (
                  <div style={{ textAlign: "center", padding: "2rem" }}>
                    <div
                      style={{
                        fontSize: "2rem",
                        marginBottom: "1rem",
                        animation: "pulse 1.5s infinite",
                      }}
                    >
                      🔍
                    </div>
                    <p
                      style={{
                        color: "#9333ea",
                        fontWeight: "bold",
                        fontSize: "1.1rem",
                        marginBottom: "0.5rem",
                      }}
                    >
                      Scanning blockchain for assets...
                    </p>
                    <div
                      style={{
                        background: "rgba(147, 51, 234, 0.1)",
                        borderRadius: "12px",
                        padding: "1rem",
                        margin: "1rem 0",
                        border: "1px solid rgba(147, 51, 234, 0.2)",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          marginBottom: "0.5rem",
                        }}
                      >
                        <span style={{ color: "#aaa", fontSize: "0.9rem" }}>
                          Progress
                        </span>
                        <span
                          style={{
                            color: "#e91e63",
                            fontWeight: "bold",
                            fontFamily: "monospace",
                          }}
                        >
                          {loadingProgress.processed}/{loadingProgress.total}
                        </span>
                      </div>
                      <div
                        style={{
                          background: "rgba(147, 51, 234, 0.2)",
                          borderRadius: "10px",
                          height: "12px",
                          width: "100%",
                          overflow: "hidden",
                          position: "relative",
                        }}
                      >
                        <div
                          style={{
                            background:
                              "linear-gradient(90deg, #9333ea, #e91e63)",
                            height: "100%",
                            width: `${Math.max(5, (loadingProgress.processed / Math.max(1, loadingProgress.total)) * 100)}%`,
                            transition: "width 0.5s ease",
                            borderRadius: "10px",
                            boxShadow: "0 0 10px rgba(147, 51, 234, 0.5)",
                          }}
                        />
                        <div
                          style={{
                            position: "absolute",
                            top: 0,
                            left: 0,
                            right: 0,
                            bottom: 0,
                            background:
                              "linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent)",
                            animation: "shimmer 1.5s infinite",
                          }}
                        />
                      </div>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          marginTop: "0.75rem",
                          fontSize: "0.85rem",
                        }}
                      >
                        <div>
                          <span style={{ color: "#aaa" }}>Found: </span>
                          <span
                            style={{
                              color: "#4ade80",
                              fontWeight: "bold",
                              fontFamily: "monospace",
                            }}
                          >
                            {loadingProgress.found}
                          </span>
                          <span style={{ color: "#aaa", marginLeft: "0.5rem" }}>
                            assets
                          </span>
                        </div>
                        <div>
                          <span style={{ color: "#aaa" }}>Speed: </span>
                          <span
                            style={{
                              color: "#60a5fa",
                              fontWeight: "bold",
                              fontFamily: "monospace",
                            }}
                          >
                            20x
                          </span>
                          <span
                            style={{ color: "#aaa", marginLeft: "0.25rem" }}
                          >
                            (parallel)
                          </span>
                        </div>
                      </div>
                    </div>
                    {loadingProgress.currentAsset && (
                      <div
                        style={{
                          marginTop: "1rem",
                          padding: "0.75rem",
                          background: "rgba(147, 51, 234, 0.05)",
                          borderRadius: "8px",
                          border: "1px solid rgba(147, 51, 234, 0.1)",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: "0.5rem",
                          }}
                        >
                          <span
                            style={{
                              fontSize: "1.2rem",
                              animation: "bounce 1s infinite",
                            }}
                          >
                            ↻
                          </span>
                          <span
                            style={{
                              color: "#e91e63",
                              fontFamily: "monospace",
                              fontSize: "0.9rem",
                            }}
                          >
                            Checking:{" "}
                            <strong>{loadingProgress.currentAsset}</strong>
                          </span>
                        </div>
                      </div>
                    )}
                    <div
                      style={{
                        marginTop: "1.5rem",
                        display: "grid",
                        gridTemplateColumns: "repeat(3, 1fr)",
                        gap: "0.75rem",
                      }}
                    >
                      <div
                        style={{
                          textAlign: "center",
                          padding: "0.75rem",
                          background: "rgba(147, 51, 234, 0.05)",
                          borderRadius: "8px",
                          border: "1px solid rgba(147, 51, 234, 0.1)",
                        }}
                      >
                        <div
                          style={{
                            fontSize: "1.5rem",
                            marginBottom: "0.25rem",
                          }}
                        >
                          ⚡
                        </div>
                        <div style={{ fontSize: "0.8rem", color: "#aaa" }}>
                          Parallel
                        </div>
                        <div
                          style={{
                            color: "#60a5fa",
                            fontWeight: "bold",
                            fontSize: "0.9rem",
                          }}
                        >
                          20 assets/batch
                        </div>
                      </div>
                      <div
                        style={{
                          textAlign: "center",
                          padding: "0.75rem",
                          background: "rgba(147, 51, 234, 0.05)",
                          borderRadius: "8px",
                          border: "1px solid rgba(147, 234, 51, 0.1)",
                        }}
                      >
                        <div
                          style={{
                            fontSize: "1.5rem",
                            marginBottom: "0.25rem",
                          }}
                        >
                          📊
                        </div>
                        <div style={{ fontSize: "0.8rem", color: "#aaa" }}>
                          Total
                        </div>
                        <div
                          style={{
                            color: "#4ade80",
                            fontWeight: "bold",
                            fontSize: "0.9rem",
                          }}
                        >
                          {loadingProgress.total} assets
                        </div>
                      </div>
                      <div
                        style={{
                          textAlign: "center",
                          padding: "0.75rem",
                          background: "rgba(147, 51, 234, 0.05)",
                          borderRadius: "8px",
                          border: "1px solid rgba(234, 51, 147, 0.1)",
                        }}
                      >
                        <div
                          style={{
                            fontSize: "1.5rem",
                            marginBottom: "0.25rem",
                          }}
                        >
                          ✅
                        </div>
                        <div style={{ fontSize: "0.8rem", color: "#aaa" }}>
                          Complete
                        </div>
                        <div
                          style={{
                            color: "#e91e63",
                            fontWeight: "bold",
                            fontSize: "0.9rem",
                          }}
                        >
                          {Math.round(
                            (loadingProgress.processed /
                              Math.max(1, loadingProgress.total)) *
                              100,
                          )}
                          %
                        </div>
                      </div>
                    </div>
                    <p
                      style={{
                        color: "#888",
                        fontSize: "0.85rem",
                        marginTop: "1.5rem",
                        fontStyle: "italic",
                      }}
                    >
                      Live scanning of on-chain asset registry...
                    </p>
                  </div>
                ) : poolComposition.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "2rem" }}>
                    <p style={{ color: "#888" }}>
                      No pool data yet. Click the button below to scan.
                    </p>
                  </div>
                ) : null}
                {!isLoadingPoolData && (
                  <button
                    onClick={() => {
                      setIsLoadingPoolData(true);
                      fetchPoolComposition().then((assets) => {
                        setPoolComposition(assets);
                        setTimeout(renderPrivacyChart, 50);
                      });
                    }}
                    style={{
                      background: "linear-gradient(135deg, #9333ea, #e91e63)",
                      color: "white",
                      border: "none",
                      borderRadius: "12px",
                      padding: "12px 24px",
                      cursor: "pointer",
                      fontWeight: "bold",
                      fontFamily: "'Exo 2', sans-serif",
                      fontSize: "14px",
                      display: "block",
                      margin: "0 auto",
                    }}
                  >
                    🔍 Scan Pool
                  </button>
                )}
              </div>
              <button
                className="close-help-button"
                onClick={() => setShowPrivacy(false)}
              >
                Close
              </button>
            </div>
          </div>
        )}
        {showSettings && (
          <div className="help-modal">
            <div className="help-modal-content" style={{ maxWidth: "800px" }}>
              <h2>Customize Theme</h2>

              <div className="help-section">
                <h3>Background Color (Center)</h3>
                <div style={{ margin: "1.5rem 0" }}>
                  <div style={{ marginBottom: "1rem" }}>
                    <label
                      style={{
                        display: "block",
                        marginBottom: "0.5rem",
                        color: "#ccc",
                        fontWeight: "bold",
                      }}
                    >
                      Primary Color
                    </label>
                    <div
                      style={{
                        display: "flex",
                        gap: "10px",
                        alignItems: "center",
                      }}
                    >
                      <input
                        type="color"
                        value={backgroundColor}
                        onChange={(e) => setBackgroundColor(e.target.value)}
                        style={{
                          width: "60px",
                          height: "60px",
                          borderRadius: "8px",
                          border: "2px solid #333",
                          cursor: "pointer",
                        }}
                      />
                      <div style={{ flex: 1 }}>
                        <div
                          style={{
                            background: backgroundColor,
                            height: "30px",
                            borderRadius: "6px",
                            border: "1px solid #444",
                            marginBottom: "0.25rem",
                          }}
                        />
                        <code style={{ color: "#888", fontSize: "0.8rem" }}>
                          {backgroundColor}
                        </code>
                      </div>
                    </div>
                  </div>
                  <div style={{ marginBottom: "1rem" }}>
                    <label
                      style={{
                        display: "block",
                        marginBottom: "0.5rem",
                        color: "#ccc",
                        fontWeight: "bold",
                      }}
                    >
                      Gradient Color (Edges)
                    </label>
                    <div
                      style={{
                        display: "flex",
                        gap: "10px",
                        alignItems: "center",
                      }}
                    >
                      <input
                        type="color"
                        value={gradientColor}
                        onChange={(e) => setGradientColor(e.target.value)}
                        style={{
                          width: "60px",
                          height: "60px",
                          borderRadius: "8px",
                          border: "2px solid #333",
                          cursor: "pointer",
                        }}
                      />
                      <div style={{ flex: 1 }}>
                        <div
                          style={{
                            background: gradientColor,
                            height: "30px",
                            borderRadius: "6px",
                            border: "1px solid #444",
                            marginBottom: "0.25rem",
                          }}
                        />
                        <code style={{ color: "#888", fontSize: "0.8rem" }}>
                          {gradientColor}
                        </code>
                      </div>
                    </div>
                  </div>
                  <div
                    style={{
                      background: `radial-gradient(circle at center, ${backgroundColor} 0%, ${gradientColor} 100%)`,
                      height: "80px",
                      borderRadius: "12px",
                      border: "1px solid #444",
                      marginTop: "1rem",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "white",
                      fontWeight: "bold",
                      textShadow: "0 1px 3px rgba(0,0,0,0.5)",
                    }}
                  >
                    Preview
                  </div>
                </div>
                <div
                  style={{
                    marginTop: "1.5rem",
                    paddingTop: "1rem",
                    borderTop: "1px solid #333",
                  }}
                >
                  <button
                    onClick={() => {
                      setBackgroundColor("#09002b");
                      setGradientColor("#000000");
                    }}
                    style={{
                      background: "linear-gradient(135deg, #9333ea, #e91e63)",
                      color: "white",
                      border: "none",
                      borderRadius: "8px",
                      padding: "10px 20px",
                      cursor: "pointer",
                      fontWeight: "bold",
                      marginRight: "10px",
                    }}
                  >
                    Reset to Default
                  </button>
                  <button
                    onClick={() => {
                      setBackgroundColor("#1a1a2e");
                      setGradientColor("#16213e");
                    }}
                    style={{
                      background: "linear-gradient(135deg, #1a1a2e, #16213e)",
                      color: "white",
                      border: "none",
                      borderRadius: "8px",
                      padding: "10px 20px",
                      cursor: "pointer",
                      fontWeight: "bold",
                      marginRight: "10px",
                    }}
                  >
                    Dark Blue Theme
                  </button>
                  <button
                    onClick={() => {
                      setBackgroundColor("#0f172a");
                      setGradientColor("#1e293b");
                    }}
                    style={{
                      background: "linear-gradient(135deg, #0f172a, #1e293b)",
                      color: "white",
                      border: "none",
                      borderRadius: "8px",
                      padding: "10px 20px",
                      cursor: "pointer",
                      fontWeight: "bold",
                    }}
                  >
                    Slate Theme
                  </button>
                </div>
              </div>

              <div className="help-section">
                <h3>Theme Modes</h3>
                <p>Choose which visual effects to enable:</p>
                <div style={{ margin: "1.5rem 0" }}>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr 1fr 1fr",
                      gap: "1rem",
                      marginBottom: "2rem",
                    }}
                  >
                    <div
                      onClick={() => setRainMode(!rainMode)}
                      style={{
                        background: "rgba(0,0,0,0.2)",
                        borderRadius: "8px",
                        padding: "1rem",
                        border: `2px solid ${rainMode ? "#9333ea" : "#333"}`,
                        textAlign: "center",
                        cursor: "pointer",
                        transition: "all 0.2s",
                      }}
                    >
                      <div style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>
                        🌧️
                      </div>
                      <div
                        style={{
                          color: "#ccc",
                          fontWeight: "bold",
                          marginBottom: "0.25rem",
                        }}
                      >
                        Rain Mode
                      </div>
                      <div
                        style={{
                          color: rainMode ? "#4ade80" : "#888",
                          fontSize: "0.8rem",
                        }}
                      >
                        {rainMode ? "Enabled" : "Click to enable"}
                      </div>
                    </div>
                    <div
                      onClick={() => setFlameMode(!flameMode)}
                      style={{
                        background: "rgba(0,0,0,0.2)",
                        borderRadius: "8px",
                        padding: "1rem",
                        border: `2px solid ${flameMode ? "#ff4400" : "#333"}`,
                        textAlign: "center",
                        cursor: "pointer",
                        transition: "all 0.2s",
                      }}
                    >
                      <div style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>
                        🔥
                      </div>
                      <div
                        style={{
                          color: "#ccc",
                          fontWeight: "bold",
                          marginBottom: "0.25rem",
                        }}
                      >
                        Flame Mode
                      </div>
                      <div
                        style={{
                          color: flameMode ? "#4ade80" : "#888",
                          fontSize: "0.8rem",
                        }}
                      >
                        {flameMode ? "Enabled" : "Click to enable"}
                      </div>
                    </div>
                    <div
                      onClick={() => setToasterMode(!toasterMode)}
                      style={{
                        background: "rgba(0,0,0,0.2)",
                        borderRadius: "8px",
                        padding: "1rem",
                        border: `2px solid ${toasterMode ? "#ff9966" : "#333"}`,
                        textAlign: "center",
                        cursor: "pointer",
                        transition: "all 0.2s",
                      }}
                    >
                      <div style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>
                        🍞
                      </div>
                      <div
                        style={{
                          color: "#ccc",
                          fontWeight: "bold",
                          marginBottom: "0.25rem",
                        }}
                      >
                        Toaster Mode
                      </div>
                      <div
                        style={{
                          color: toasterMode ? "#4ade80" : "#888",
                          fontSize: "0.8rem",
                        }}
                      >
                        {toasterMode ? "Enabled" : "Click to enable"}
                      </div>
                    </div>
                    <div
                      onClick={() => setPonyMode(!ponyMode)}
                      style={{
                        background: "rgba(0,0,0,0.2)",
                        borderRadius: "8px",
                        padding: "1rem",
                        border: `2px solid ${ponyMode ? "#ff69b4" : "#333"}`,
                        textAlign: "center",
                        cursor: "pointer",
                        transition: "all 0.2s",
                      }}
                    >
                      <div style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>
                        🦄
                      </div>
                      <div
                        style={{
                          color: "#ccc",
                          fontWeight: "bold",
                          marginBottom: "0.25rem",
                        }}
                      >
                        Pony Mode
                      </div>
                      <div
                        style={{
                          color: ponyMode ? "#4ade80" : "#888",
                          fontSize: "0.8rem",
                        }}
                      >
                        {ponyMode ? "Enabled" : "Click to enable"}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {rainMode && (
                <div className="help-section">
                  <h3>Rain Mode Settings</h3>
                  <p>Customize your rain particles:</p>
                  <div style={{ margin: "1.5rem 0" }}>
                    <div style={{ marginBottom: "1rem" }}>
                      <div
                        style={{
                          marginBottom: "1rem",
                          padding: "1rem",
                          background: "rgba(0,0,0,0.2)",
                          borderRadius: "8px",
                        }}
                      >
                        <label
                          style={{
                            display: "block",
                            marginBottom: "0.5rem",
                            color: "#aaa",
                            fontWeight: "bold",
                          }}
                        >
                          Upload Image for Particles
                        </label>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              const reader = new FileReader();
                              reader.onload = (event) => {
                                if (event.target?.result)
                                  setUploadedImage(
                                    event.target.result as string,
                                  );
                              };
                              reader.readAsDataURL(file);
                            }
                          }}
                          style={{
                            width: "100%",
                            padding: "10px",
                            background: "rgba(255,255,255,0.1)",
                            border: "1px solid #444",
                            borderRadius: "6px",
                            color: "#ccc",
                            cursor: "pointer",
                          }}
                        />
                        {uploadedImage && (
                          <div
                            style={{ marginTop: "1rem", textAlign: "center" }}
                          >
                            <p
                              style={{
                                color: "#4ade80",
                                marginBottom: "0.5rem",
                              }}
                            >
                              Image uploaded!
                            </p>
                            <div
                              style={{
                                display: "inline-block",
                                width: "80px",
                                height: "80px",
                                borderRadius: "50%",
                                overflow: "hidden",
                                border: "2px solid #9333ea",
                                background: `url(${uploadedImage}) center/cover`,
                              }}
                            />
                          </div>
                        )}
                      </div>
                    </div>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr",
                        gap: "1rem",
                        marginBottom: "1rem",
                      }}
                    >
                      <div>
                        <label
                          style={{
                            display: "block",
                            marginBottom: "0.5rem",
                            color: "#aaa",
                            fontSize: "0.9rem",
                          }}
                        >
                          Particle Count: {particleCount}
                        </label>
                        <input
                          type="range"
                          min="5"
                          max="100"
                          value={particleCount}
                          onChange={(e) =>
                            setParticleCount(parseInt(e.target.value))
                          }
                          style={{ width: "100%" }}
                        />
                      </div>
                      <div>
                        <label
                          style={{
                            display: "block",
                            marginBottom: "0.5rem",
                            color: "#aaa",
                            fontSize: "0.9rem",
                          }}
                        >
                          Particle Size: {particleSize}px
                        </label>
                        <input
                          type="range"
                          min="4"
                          max="20"
                          value={particleSize}
                          onChange={(e) =>
                            setParticleSize(parseInt(e.target.value))
                          }
                          style={{ width: "100%" }}
                        />
                      </div>
                    </div>
                    <div>
                      <label
                        style={{
                          display: "block",
                          marginBottom: "0.5rem",
                          color: "#aaa",
                          fontSize: "0.9rem",
                        }}
                      >
                        Falling Speed: {fallingSpeed}
                      </label>
                      <input
                        type="range"
                        min="1"
                        max="10"
                        value={fallingSpeed}
                        onChange={(e) =>
                          setFallingSpeed(parseInt(e.target.value))
                        }
                        style={{ width: "100%" }}
                      />
                    </div>
                  </div>
                </div>
              )}

              <button
                className="close-help-button"
                onClick={() => setShowSettings(false)}
              >
                Close
              </button>
            </div>
          </div>
        )}
        {showNameGen && (
          <div className="help-modal" onClick={() => setShowNameGen(false)}>
            <div className="help-modal-content" onClick={(e) => e.stopPropagation()}>
              <h2><img src="/haltman.png" alt="haltman" style={{ width: "32px", height: "32px", verticalAlign: "middle", marginRight: "8px" }} />Fake name generator</h2>
              <div className="help-section">
                <div style={{ textAlign: "center", marginBottom: "1.5rem" }}>
                  {generatedFirstName ? (
                    <>
                      <div style={{ fontSize: "1.5rem", fontWeight: "bold", color: "#9d4edd", marginBottom: "0.5rem" }}>
                        {generatedFirstName} {generatedLastName}
                      </div>
                      <div style={{ fontSize: "0.95rem", color: "#aaa" }}>
                        📧 {generatedFirstName.toLowerCase()}.{generatedLastName.toLowerCase()}@metasploit.io
                      </div>
                    </>
                  ) : (
                    <div style={{ color: "#888" }}>Click generate to create a fake identity</div>
                  )}
                </div>
                <div style={{ display: "flex", gap: "0.5rem", justifyContent: "center", marginBottom: "1rem" }}>
                  <button
                    className="help-button"
                    onClick={async () => {
                      const loaded = await loadWordlists();
                      if (loaded) {
                        generateName(loaded[0], loaded[1]);
                      } else {
                        generateName();
                      }
                      setNameGenStep("generate");
                      setNameGenResult("");
                    }}
                    style={{ padding: "0.5rem 1rem" }}
                  >
                    🎲 Generate
                  </button>
                  {generatedFirstName && nameGenStep === "generate" && (
                    <button
                      className="help-button"
                      onClick={() => setNameGenStep("confirm")}
                      style={{ padding: "0.5rem 1rem" }}
                    >
                      📨 Create Forwarder
                    </button>
                  )}
                </div>
                {nameGenStep === "confirm" && (
                  <div style={{ marginBottom: "1rem" }}>
                    <div style={{ marginBottom: "0.75rem" }}>
                      <label style={{ display: "block", marginBottom: "0.3rem", color: "#aaa", fontSize: "0.85rem" }}>
                        Your email (where the confirmation will be sent)
                      </label>
                      <input
                        type="email"
                        value={userEmail}
                        onChange={(e) => setUserEmail(e.target.value)}
                        placeholder="you@example.com"
                        style={{
                          width: "100%",
                          padding: "0.5rem",
                          borderRadius: "6px",
                          border: "1px solid #444",
                          background: "#111",
                          color: "#ccc",
                          fontSize: "0.85rem",
                          boxSizing: "border-box",
                        }}
                      />
                    </div>
                    <button
                      className="help-button"
                      onClick={subscribeForwarder}
                      disabled={!userEmail}
                      style={{ padding: "0.5rem 1rem", width: "100%", opacity: userEmail ? 1 : 0.5 }}
                    >
                      Send Confirmation && Activate forwarder
                    </button>
                  </div>
                )}
                {nameGenStep === "done" && (
                  <div style={{ textAlign: "center", padding: "1rem 0", marginBottom: "1rem" }}>
                    <div style={{ fontSize: "1rem", color: "#4ade80", marginBottom: "0.5rem" }}>
                      Confirmation link sent, ready for action!
                    </div>
                  </div>
                )}
                {nameGenResult && (
                  <div style={{ textAlign: "center", fontSize: "0.85rem", color: nameGenResult.startsWith("✓") ? "#4ade80" : "#f87171" }}>
                    {nameGenResult}
                  </div>
                )}
              </div>
              <div style={{ textAlign: "center", fontSize: "0.75rem", color: "#666" }}>
                Emails powered by <a href="https://haltman.org/" target="_blank" title="Haltman.org" style={{ color: "rgb(222 186 255)" }}>Brazilian Hacking Group Haltman</a>
              </div>
              <button className="close-help-button" onClick={() => setShowNameGen(false)}>Close</button>
            </div>
          </div>
        )}
        {toasterMode && <FlyingToasters />}
        {rainMode && (
          <RainAnimation
            particleCount={particleCount}
            particleSize={particleSize}
            fallingSpeed={fallingSpeed}
            uploadedImage={uploadedImage}
          />
        )}
        {flameMode && <FlameAnimation />}
        {ponyMode && <PonyAnimation />}
      </div>
    </div>
  );
}
