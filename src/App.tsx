/*
 * Copyright 2025 Kusama Shield Developers on behalf of the Kusama DAO, see LICENSE in main folder.
 */

import "./App.css";
import { useState, useEffect, useRef } from "react";
import { WalletSelect } from "@talismn/connect-components";
import { shieldTokens, fakeshield } from "./transactions/shield";
import { isEvmAddress } from "./transactions/adresses";
import SHIELD_CONTRACT_ADDRESS from "./transactions/shield";
import fakeerc20asset from "./transactions/shield";
import { make_deposit_tx, gen_tx_no_sig } from "./transactions/txgen";
import { unshieldTokens, fetchKzgParams } from "./transactions/unshield";
import {
  generate_tx2,
  xcm_chains,
  KSM2ah,
  generate_dot2ksm,
  eth2accountid32,
} from "./transactions/xcm";
import { ZKPService } from "./transactions/zklib";
import {
  westend_pool,
  generateCommitment,
  zkDeposit,
  zkWithdraw,
} from "./transactions/zkg16";
import { ToastContainer, toast } from "react-toastify";
import { ApiPromise, WsProvider } from "@polkadot/api";
import { u8aToHex } from "@polkadot/util";
import { Transaction, parseEther, parseUnits } from "ethers";
import { WalletAccount } from "@talismn/connect-wallets";
import QRCode from "qrcode";
import SwapStatusTracker from "./components/SwapStatusTracker";
//import init, { generate_commitment, test_console, test_proofo, generate_proof_data } from '../pkg/generate_zk_wasm'; // adjust path as needed
import { Buffer } from "buffer";

// Polyfill for the global Buffer object
if (typeof window !== "undefined") {
  (window as any).Buffer = Buffer;
}
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

// input token amounts
const amountOptions = [0.5, 1, 5, 10, 100, 500, 1000, 10000];

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

  paseo_assethub2: {
    name: "Paseo hub v2",
    asset: "PAS",
    chain_id: 420420422,
    rpcEndpoint: "https://testnet-passet-hub-eth-rpc.polkadot.io", //"https://testnet-passet-hub-eth-rpc.polkadot.io",
    faucet: "https://faucet.polkadot.io/?parachain=1111",
    block_explorer: "https://blockscout-passet-hub.parity-testnet.parity.io/",
    vk_address: "0xF3A0c5DaE0Cb99f9e4ED56D77BAC094517a05166",
    shield_address: "0xa1Ab66CB2634007a5450643F0a240f8E8062178C", //"0xA3d1E0e2AAEFAf6E8a20144E433e123BC0cC5ef8",
    abi: [
      "function deposit3(address asset, uint256 amount, bytes32 commitment) external payable",
      "function withdrawETH(uint256[2] calldata a, uint256[2][2] calldata b, uint256[2] calldata c, uint256[6] calldata pubSignals) external",
      "function withdrawWithAsset(uint256[2] calldata a, uint256[2][2] calldata b, uint256[2] calldata c, uint256[6] calldata pubSignals, address asset) external",
      "function currentRoot() external view returns (uint256)",
      "function nullifiers(bytes32) external view returns (address asset, uint256 amount, bytes32 commitment, bool isUsed)",
      "function escrow(address) external view returns (uint256)",
      "function isNullifierUsed(uint256 nullifier) external view returns (bool)",
      "function getNullifierInfo(uint256 nullifier) external view returns (address asset, uint256 amount, bytes32 commitment, bool isUsed)",
    ],
    docs: "https://kusamashield.codeberg.page/networks/PaseoAH.html",
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
  kusama: {
    name: "Kusama Assethub Mainnet",
    type: "mainnet",
    wsEndpoint: "wss://statemine-rpc-tn.dwellir.com",
    rpcEndpoint: "http://eth-pas-hub.laissez-faire.trade:8545",
    asset: "KSM",
    chain_id: 420420418,
    shield_address: "0xDC80565357D63eCa67F3f020b6DD1CE1fD0E1Ed8",
    abi: [
      "function deposit3(address asset, uint256 amount, bytes32 commitment) external payable",
      "function withdrawETH(uint256[2] calldata a, uint256[2][2] calldata b, uint256[2] calldata c, uint256[6] calldata pubSignals) external",
      "function withdrawWithAsset(uint256[2] calldata a, uint256[2][2] calldata b, uint256[2] calldata c, uint256[6] calldata pubSignals, address asset) external",
      "function currentRoot() external view returns (uint256)",
      "function nullifiers(bytes32) external view returns (address asset, uint256 amount, bytes32 commitment, bool isUsed)",
      "function escrow(address) external view returns (uint256)",
      "function isNullifierUsed(uint256 nullifier) external view returns (bool)",
      "function getNullifierInfo(uint256 nullifier) external view returns (address asset, uint256 amount, bytes32 commitment, bool isUsed)",
    ],
    block_explorer:
      "https://blockscout-kusama-asset-hub.parity-chains-scw.parity.io/",
    docs: "https://kusamashield.codeberg.page/networks/kusama.html",
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

export function App() {
  const [isWalletConnected, setIsWalletConnected] = useState(false);
  const [selectedWallet, setSelectedWallet] = useState<any>(null); // Consider using proper type instead of any
  const [selectedWalletEVM, setSelectedWalletEVM] = useState<any>(null);
  const [evmAddress, setEvmAddress] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<
    "shield" | "unshield" | "bridge" | "crosschainbridge"
  >("shield");
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
  // Destination address for non-KSM swaps
  const [destinationAddress, setDestinationAddress] = useState<string>("");

  // Available currencies - only currencies that can be swapped TO DOT
  const availableCurrencies = [
    { symbol: "DOT", name: "Polkadot", logo: "/coin_logos/images/dot.svg" },
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
    { symbol: "USDT", name: "Tether", logo: "/coin_logos/images/usdt.svg" },
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
      symbol: "USDTTRC",
      name: "USDT (TRON)",
      logo: "/coin_logos/images/usdttrc.svg",
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
    if (networkKey === "kusama") return "mainnet";
    return "testnet";
  };

  // Add this ref to track current evmAddress
  const evmAddressRef = useRef<string | null>(null);

  useEffect(() => {
    evmAddressRef.current = evmAddress;
  }, [evmAddress]);

  const isMainnet = (networkKey: string) =>
    getNetworkType(networkKey) === "mainnet";
  const isTestnet = (networkKey: string) =>
    getNetworkType(networkKey) === "testnet";

  // Network-specific currency lists
  const getAvailableCurrencies = (networkKey: string) => {
    if (isMainnet(networkKey)) {
      // Kusama AssetHub - all swap currencies including cross-chain DOT→KSM
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

  // Check if swap is cross-chain (DOT→KSM)
  const isCrossChainSwap = (fromCurrency: string, toCurrency: string) => {
    return (
      (fromCurrency === "DOT" && toCurrency === "KSM") ||
      (fromCurrency === "KSM" && toCurrency === "DOT")
    );
  };

  // Check if swap requires destination address input
  const requiresDestinationAddress = (fromCurrency: string, toCurrency: string) => {
    // DOT to KSM uses connected wallet address, other swaps need destination input
    return fromCurrency === "DOT" && toCurrency !== "KSM";
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
      DOT: "Polkadot",
      KSM: "Kusama",
      PAS: "Paseo Testnet",
      WND: "Westend Testnet",
      DEV: "Moonbeam Testnet",
    };

    return currencyNetworkMap[currency] || "Unknown Network";
  };

  // Swap API base URL - will be deployed to public endpoint
  const SWAP_API_BASE = "https://proxyswap.laissez-faire.trade";//"http://localhost:5000";

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
          setNetwork("kusama");
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
      //  console.log(`westend pool:`, westend_pool);
      var shieldedContract;
      if (selectedNetwork == "moonbase") {
        console.log(`moonbase`);
        shieldedContract = new ethers.Contract(
          SHIELD_CONTRACT_ADDRESS.SHIELD_CONTRACT_ADDRESS, // Using the fake ERC-20 address from your constants
          SHIELD_CONTRACT_ADDRESS.shielderAbi,
          ETHsigner,
        );
      } else if (selectedNetwork == "kusama") {
        shieldedContract = new ethers.Contract(
          NETWORKS[selectedNetwork].shield_address,
          NETWORKS[selectedNetwork].abi, //["function deposit(address,uint256,bytes32) payable"],
          ETHsigner,
        );
      } else if (selectedNetwork == "paseo_assethub2") {
        //	NETWORKS["paseo_assethub"].shield_address,

        console.log(
          `paseo assethub v2: `,
          NETWORKS[selectedNetwork].shield_address,
        );

        shieldedContract = new ethers.Contract(
          NETWORKS[selectedNetwork].shield_address,
          NETWORKS[selectedNetwork].abi, //["function deposit(address,uint256,bytes32) payable"],
          ETHsigner,
        );
        console.log(`contract v2 initilized`);
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
            */
        console.log(`calling abi66`);
        console.log(`sending paseo deposit`);
        if (selectedNetwork == "paseo_assethub") {
          const ABI66 = [
            "function deposit(address,uint256,bytes32) payable",
            "function withdraw2(uint256[2],uint256[2][2],uint256[2],uint256[3],address,uint256,bytes32)",
          ];
          console.log(`calling contract paseo invalid`);

          const contractpase = new ethers.Contract(
            "0xde734db4ab4a8d9ad59d69737e402f54a84d4c17",
            ABI66, //["function deposit(address,uint256,bytes32) payable"],
            ETHsigner,
          );

          const myamount = ethers.parseUnits(amount, 18);
          console.log("Sending with params:", {
            token: ethers.ZeroAddress,
            amount: myamount.toString(),
            x,
            value: myamount.toString(),
          });

          console.log(`x, myamount:`, x, myamount);
          const paddedCommitment = ethers.zeroPadValue(x, 32);
          var gasEstimate;

          try {
            console.log(`running gasEstimate`);
            gasEstimate = await contractpase.deposit.estimateGas(
              ethers.ZeroAddress,
              1000000000000000000n,
              paddedCommitment, //x,  uint8ArrayToHex(ethers.randomBytes(32))
              { value: 1000000000000000000n },
            );
            console.log("Gas estimate:", gasEstimate);
          } catch (e) {
            console.error("Estimation failed:", e);
          }

          console.log(`x:`, x);
          console.log(`calling txResponse2`);
          txResponse2 = await shieldedContract.deposit(
            ethers.ZeroAddress,
            ethers.parseEther(amount), //,
            x,
            {
              value: ethers.parseEther(amount), //1000000000000000000n,
              maxFeePerGas: gasEstimate,
              gasPrice: ethers.parseUnits("1000", "wei"),
              type: 0,
              //      gasLimit: 16317587311833n,
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
    console.log(`setNework called, input:`, networkKey);
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

      try {
        console.log(`generating proofo`);

        // if we manage to load the
        if (ProofWorker) {
          var proofBytes;
          if (
            selectedNetwork == "westend_assethub" ||
            selectedNetwork == "paseo_assethub2" ||
            selectedNetwork == "kusama" ||
            selectedNetwork == "paseo_assethub"
          ) {
            proofBytes = "not set ";
          } else {
            const p = await fetchKzgParams(
              "http://kusamashield.laissez-faire.trade/proofs/hermez-raw-8",
            ); //params8.bin
            console.log(`params fetched ok`);
            console.log("Params length:", p.length);

            console.log(`generating proof`);

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
          } else if (
            selectedNetwork == "paseo_assethub2" ||
            selectedNetwork == "kusama"
          ) {
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
            var gasestimate;
            try {
              gasestimate = await shieldedContract.withdraw2.estimateGas(
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
            txResponse = await shieldedContract.withdraw2(
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
                evmAddress, // selected browser wallet address
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
    if (isEvmAddress(evmAddress)) {
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
        evmAddress,
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
      const response = await fetch(`${SWAP_API_BASE}/exchange_rate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fromCcy: fromCurrency,
          toCcy: toCurrency,
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
    if (!swapAmount || !fromCurrency || !toCurrency || !evmAddress) {
      toast.error("Please fill in all required fields");
      console.error("Please fill in all required fields");
      return;
    }

    // Check if destination address is required and provided
    if (requiresDestinationAddress(fromCurrency, toCurrency) && !destinationAddress.trim()) {
      toast.error(`Please enter a ${toCurrency} destination address`);
      console.error(`Destination address required for ${fromCurrency} to ${toCurrency} swap`);
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


    if (toCurrency == "DOT" && isEvmAddress(evmAddress)) {
              toast.error(`Select a (Polkadot style)non-evm address`, {
          position: "top-right",
          autoClose: 5000,
          hideProgressBar: false,
          closeOnClick: false,
          pauseOnHover: true,
          draggable: true,
          progress: undefined,
          theme: "dark",
        });
    //    setError("Select a polkadot style account, not evm");
      return ;
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
        if (isEvmAddress(evmAddress)) {
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
  evmAddress
        );
        console.log(`tx called!`);

      
            const unsub = await tx.signAndSend(
      evmAddress,
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
              `checking address: ${currentAddress}, isEvm: ${isEvmAddress(currentAddress)}`,
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
          destaddress,
        ); //eth2accountid32(destaddress)

        const unsub2 = await tx2.signAndSend(
          evmAddress,
          { signer },
          ({ status, events, dispatchError }) => {
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
    const finalDestinationAddress = requiresDestinationAddress(fromCurrency, toCurrency) 
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
      const response = await fetch(`${SWAP_API_BASE}/trade`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fromCcy: fromCurrency,
          toCcy: toCurrency,
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
        
        const statusData = data.data.data;
        setSwapStatusData(statusData);
        setTradeData(data);
        
        // Update swap stage based on status
        switch (statusData.status) {
          case 'NEW':
            setSwapStage("deposit");
            break;
          case 'PENDING':
          case 'EXCHANGE':
          case 'WITHDRAW':
            setSwapStage("processing");
            break;
          case 'DONE':
            setSwapStage("completed");
            toast.success("Swap completed successfully!");
            stopPolling();
            break;
          case 'EXPIRED':
            toast.error("Swap expired");
            stopPolling();
            break;
          case 'EMERGENCY':
            toast.error(`🚨 Order requires manual review!\n\nPlease email kusamashield@smokes.thc.org with your order number: ${statusData.id}\n\nWe will sort it out straight away.`, {
              position: "top-center",
              autoClose: false,
              hideProgressBar: false,
              closeOnClick: true,
              pauseOnHover: true,
              draggable: true,
              progress: undefined,
              theme: "dark",
              style: {
                whiteSpace: 'pre-line',
                textAlign: 'center',
                fontSize: '14px',
                maxWidth: '500px'
              }
            });
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
      case 'NEW':
        newInterval = 15000; // 15 seconds for new orders
        break;
      case 'PENDING':
        newInterval = 5000; // 5 seconds for pending confirmation
        break;
      case 'EXCHANGE':
      case 'WITHDRAW':
        newInterval = 3000; // 3 seconds for active processing
        break;
      case 'DONE':
      case 'EXPIRED':
      case 'EMERGENCY':
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
  };

  // Reset currencies when network changes
  useEffect(() => {
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
  }, [selectedNetwork]);

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

  // Auto-refresh swap status during processing
  useEffect(() => {
    if ((swapStage === "processing" || swapStage === "deposit") && currentTrade?.trade_id) {
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
            <option value="" disabled className="group-header testnet-header">
              🧪 Testnet Networks
            </option>
            <option value="moonbase">🔗 {NETWORKS.moonbase.name}</option>

            <option value="paseo_assethub">
              🔗 {NETWORKS.paseo_assethub.name}
            </option>

            <option value="paseo_assethub2">
              🔗 {NETWORKS.paseo_assethub2.name}
            </option>

            <option value="westend_assethub">
              🔗 {NETWORKS.westend_assethub.name}
            </option>
            <option value="" disabled className="group-header mainnet-header">
              🌐 Mainnet Networks (👇Live now👇)
            </option>
            <option value="kusama">🐦 Kusama Assethub Mainnet</option>
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
              {getBridgeTitle(selectedNetwork)}
            </button>
          </div>
          {/* Tab content */}
          {activeTab === "crosschainbridge" ? (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                minHeight: "200px",
              }}
            >
              <button
                className="swap-button"
                style={{
                  maxWidth: 220,
                  margin: "2rem auto",
                  fontSize: "1.2rem",
                  opacity: 0.7,
                  cursor: "not-allowed",
                }}
              >
                🚧 Coming Soon 🚧
              </button>
            </div>
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
                              {getAvailableCurrencies(selectedNetwork).map(
                                (currency) => (
                                  <option
                                    key={currency.symbol}
                                    value={currency.symbol}
                                  >
                                    {currency.symbol} - {currency.name}
                                  </option>
                                ),
                              )}
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
                            Destination Balance: {userBalance} {toCurrency}
                          </div>
                        </div>

                        {requiresDestinationAddress(fromCurrency, toCurrency) && (
                          <div className="amount-input">
                            <label>{toCurrency} Destination Address:</label>
                            <input
                              type="text"
                              value={destinationAddress}
                              onChange={(e) => setDestinationAddress(e.target.value)}
                              placeholder={`Enter ${toCurrency} address to receive funds`}
                              style={{
                                width: '100%',
                                padding: '8px',
                                borderRadius: '4px',
                                border: '1px solid rgba(255, 255, 255, 0.2)',
                                background: 'rgba(255, 255, 255, 0.05)',
                                color: 'white',
                                fontSize: '14px'
                              }}
                            />
                            <div className="address-help" style={{
                              fontSize: '12px',
                              color: '#9ca3af',
                              marginTop: '4px'
                            }}>
                              Enter a valid {toCurrency} address where you want to receive your {toCurrency} tokens
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
                            <label>Send tokens to this Deposit Address:</label>
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
                            <label>Send token on the network:</label>
                            <div className="amount-display">
                              {currentTrade.from.network}
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
                            <div className="amount-display">
                              {currentTrade.from.amount} {fromCurrency}
                            </div>
                          </div>

                          <div className="deposit-amount">
                            <label>Receiving:</label>
                            <div className="amount-display">
                              {currentTrade.to.amount} {toCurrency}
                            </div>
                          </div>

                          <div className="deposit-amount">
                            <label>Receiving address:</label>
                            <div className="amount-display">
                              {currentTrade.to.address}
                            </div>
                          </div>

                          <div className="swap-progress">
                            <button
                              onClick={() => setSwapStage("processing")}
                              className="confirm-deposit-button"
                            >
                              I've sent the {fromCurrency}
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
                            <p>Waiting for confirmation and processing your swap</p>
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
                        <p>Your {swapStatusData?.to?.code || toCurrency} has been sent to your address</p>
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
                            background: 'linear-gradient(135deg, #8b5cf6 0%, #3b82f6 50%, #06b6d4 100%)',
                            border: 'none',
                            borderRadius: '12px',
                            padding: '16px 32px',
                            color: 'white',
                            fontSize: '16px',
                            fontWeight: '600',
                            cursor: 'pointer',
                            transition: 'all 0.3s ease',
                            boxShadow: '0 4px 15px rgba(139, 92, 246, 0.3)',
                            textTransform: 'none',
                            letterSpacing: '0.5px',
                            minWidth: '200px',
                            margin: '20px auto 0',
                            display: 'block',
                            position: 'relative',
                            overflow: 'hidden'
                          }}
                          onMouseEnter={(e) => {
                            e.target.style.transform = 'translateY(-2px)';
                            e.target.style.boxShadow = '0 8px 25px rgba(139, 92, 246, 0.4)';
                          }}
                          onMouseLeave={(e) => {
                            e.target.style.transform = 'translateY(0)';
                            e.target.style.boxShadow = '0 4px 15px rgba(139, 92, 246, 0.3)';
                          }}
                          onMouseDown={(e) => {
                            e.target.style.transform = 'translateY(0) scale(0.98)';
                          }}
                          onMouseUp={(e) => {
                            e.target.style.transform = 'translateY(-2px) scale(1)';
                          }}
                        >
                          <span style={{ position: 'relative', zIndex: 2 }}>
                            ✨ Start New Swap
                          </span>
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {activeTab !== "bridge" && (
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
                      <option title="native Currency">
                        {NETWORKS[selectedNetwork].asset}
                      </option>

                      {/* Alternative assets */}
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
                  </div>
                )}

                {activeTab === "shield" &&
                  (NETWORKS[selectedNetwork] as any).faucet && (
                    <div className="balance">
                      <a
                        title="faucet link"
                        target="_blank"
                        href={(NETWORKS[selectedNetwork] as any).faucet}
                      >
                        {NETWORKS[selectedNetwork].name} faucet link
                      </a>
                    </div>
                  )}

                {activeTab === "shield" && (
                  <div className="balance">
                    <a
                      title="Documentation link"
                      target="_blank"
                      href={(NETWORKS[selectedNetwork] as any).docs}
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
              {(activeTab !== "bridge" || swapStage === "input") && (
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
                  disabled={isLoading || !isWalletConnected}
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
          By using this website you agree to the Terms of Service
        </button>
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
      </div>
    </div>
  );
}
