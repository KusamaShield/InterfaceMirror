// Copyright 2025 Kusama Shield Developers on behalf of the Kusama DAO, see LICENSE in main folder.

import { useState, useEffect, useCallback, useRef } from "react";
import { toast } from "react-toastify";
import { useAccount } from "wagmi";
import { offramp, PLATFORMS, CURRENCIES, type PlatformEntry, type CurrencyEntry, type OfframpParams, type OfframpResult, type OfframpStep } from "@usdctofiat/offramp";
import type { WalletClient } from "viem";
import QRCode from "qrcode";
import { base } from "../config/wagmi";

const BASE_CHAIN_ID = 8453;
const PEERLYTICS_PROXY_BASE = import.meta.env.VITE_PROXY_BASE || "https://proxyswap.laissez-faire.trade";
const BASE_RPC_URL = import.meta.env.VITE_BASE_RPC_URL || "https://mainnet.base.org";

interface MarketEntry {
  platform: string;
  currency: string;
  sampleSize: number;
  totalLiquidity: number;
  median?: number | null;
  suggestedRate?: number | null;
}

type BridgeOrderStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'expired';

interface BridgeOrder {
  orderId: string;
  depositAddress: string;
  fromCurrency: string;
  toCurrency: string;
  amount: number;
  expectedAmount: number;
  rawExpectedAmount: number;
  decimals: number;
  status: BridgeOrderStatus;
}

interface OfframpWidgetProps {
  walletClient: WalletClient;
  selectedNetwork?: string; // Network selection from main app
}

export default function OfframpWidget({ walletClient, selectedNetwork }: OfframpWidgetProps) {
  const { address, chain } = useAccount();

  // Form state
  const [amount, setAmount] = useState<string>("");
  const [platformId, setPlatformId] = useState<string>("revolut");
  const [currencyCode, setCurrencyCode] = useState<string>("EUR");
  const [identifier, setIdentifier] = useState<string>("");
  const [otcTaker, setOtcTaker] = useState<string>("");

  const [step, setStep] = useState<OfframpStep | "">("");
  const [error, setError] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [depositId, setDepositId] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [resumed, setResumed] = useState(false);

  // Market data
  const [quotes, setQuotes] = useState<MarketEntry[]>([]);
  const [isLoadingQuotes, setIsLoadingQuotes] = useState(false);
  const [orderbook, setOrderbook] = useState<any>(null);
  const [settlementTime, setSettlementTime] = useState<number | null>(null);
  const [isLoadingSettlement, setIsLoadingSettlement] = useState(false);

  // Bridge state
  const [gasOrder, setGasOrder] = useState<BridgeOrder | null>(null);
  const [usdcOrder, setUsdcOrder] = useState<BridgeOrder | null>(null);
  const [dotGasAmount, setDotGasAmount] = useState<string>("0.5");
  const [dotUsdcAmount, setDotUsdcAmount] = useState<string>("");
  const [isCreatingGasOrder, setIsCreatingGasOrder] = useState(false);
  const [isCreatingUsdcOrder, setIsCreatingUsdcOrder] = useState(false);
  const [pollingGas, setPollingGas] = useState(false);
  const [pollingUsdc, setPollingUsdc] = useState(false);
  const pollingGasRef = useRef<NodeJS.Timeout | null>(null);
  const pollingUsdcRef = useRef<NodeJS.Timeout | null>(null);

  // Preview state
  const [estimatedUsdc, setEstimatedUsdc] = useState<number | null>(null);
  const [isFetchingRate, setIsFetchingRate] = useState(false);

   // QR codes
   const [gasQrCode, setGasQrCode] = useState<string>("");
   const [usdcQrCode, setUsdcQrCode] = useState<string>("");

   // USDC balance on Base check (for Polkadot network offramp)
   const [usdcBalance, setUsdcBalance] = useState<bigint | null>(null);
   const [isCheckingUsdc, setIsCheckingUsdc] = useState(false);
   const [useExistingUsdc, setUseExistingUsdc] = useState(false);
   const [showUsdcPrompt, setShowUsdcPrompt] = useState(false);

   // ETH balance & price - using manual fetch for compatibility
   const [ethBalanceWei, setEthBalanceWei] = useState<bigint>(BigInt(0));
   const [ethPriceUsd, setEthPriceUsd] = useState<number | null>(null);

  const ethBalanceEth = Number(ethBalanceWei) / 1e18;
  const ethBalanceUsd = ethPriceUsd ? ethBalanceEth * ethPriceUsd : 0;

  const gasOrderCompleted = gasOrder?.status === 'completed';
  const usdcOrderCompleted = usdcOrder?.status === 'completed';

  // Refs to avoid frequent effect re-triggers
  const hasSufficientGasRef = useRef(ethBalanceUsd >= 1.5);
  const gasOrderCompletedRef = useRef(gasOrderCompleted);

  // Keep refs updated
  useEffect(() => { hasSufficientGasRef.current = ethBalanceUsd >= 1.5; }, [ethBalanceUsd]);
  useEffect(() => { gasOrderCompletedRef.current = gasOrderCompleted; }, [gasOrderCompleted]);

  const hasSufficientGas = hasSufficientGasRef.current;

  const platform = Object.values(PLATFORMS).find((p) => p.id === platformId)! as PlatformEntry;
  const currency = Object.values(CURRENCIES).find((c) => c.code === currencyCode)! as CurrencyEntry;
  const usdcAmount = parseFloat(amount) || 0;
  const validation = identifier ? platform.validate(identifier) : null;
   const canSubmit = (hasSufficientGas || gasOrderCompleted) && usdcOrderCompleted && usdcAmount >= 1 && validation?.valid && !isLoading;

  // Data fetching
  const fetchQuotes = useCallback(async () => {
    if (!currencyCode) return;
    setIsLoadingQuotes(true);
    try {
      const params = new URLSearchParams({ currency: currencyCode, includeRates: "true" });
      const response = await fetch(`${PEERLYTICS_PROXY_BASE}/market/summary?${params}`);
      if (!response.ok) throw new Error(`Proxy error: ${response.status}`);
      const data = await response.json();
      setQuotes(data.markets || []);
    } catch (err: any) {
      console.error("Failed to fetch quotes:", err);
      toast.error(`Quote error: ${err.message}`);
    } finally {
      setIsLoadingQuotes(false);
    }
  }, [currencyCode]);

  const fetchOrderbook = useCallback(async () => {
    if (!platformId || !currencyCode) return;
    try {
      const params = new URLSearchParams({ currency: currencyCode, platform: platformId });
      const response = await fetch(`${PEERLYTICS_PROXY_BASE}/orderbook?${params}`);
      if (!response.ok) throw new Error(`Proxy error: ${response.status}`);
      const data = await response.json();
      setOrderbook(data.orderbooks?.[0] || null);
    } catch (err: any) {
      console.error("Failed to fetch orderbook:", err);
    }
  }, [platformId, currencyCode]);

  const fetchSettlementTime = useCallback(async () => {
    setIsLoadingSettlement(true);
    try {
      const response = await fetch(`${PEERLYTICS_PROXY_BASE}/analytics/overview?range=all`);
      if (!response.ok) throw new Error(`Proxy error: ${response.status}`);
      const data = await response.json();
      const medianSeconds = data?.snapshot?.medianFillSeconds;
      if (medianSeconds != null) setSettlementTime(Math.round(medianSeconds));
    } catch (err: any) {
      console.error("Failed to fetch settlement time:", err);
    } finally {
      setIsLoadingSettlement(false);
    }
  }, []);

   // Fetch ETH balance on Base via direct RPC (independent of wallet chain)
   const fetchEthBalance = useCallback(async () => {
     console.log('[ETH Balance] fetchEthBalance called, address:', address);
     if (!address) {
       console.log('[ETH Balance] No address, setting to 0');
       setEthBalanceWei(BigInt(0));
       return;
     }
     try {
       console.log('[ETH Balance] Querying Base RPC:', BASE_RPC_URL);
       const response = await fetch(BASE_RPC_URL, {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({
           jsonrpc: '2.0',
           method: 'eth_getBalance',
           params: [address, 'latest'],
           id: 1,
         }),
       });
       const result = await response.json();
       console.log('[ETH Balance] RPC response:', result);
       if (result?.result) {
         const balance = BigInt(result.result);
         setEthBalanceWei(balance);
         const ethEther = Number(balance) / 1e18;
         console.log(`[ETH Balance] Updated: ${balance.toString()} wei = ${ethEther.toFixed(6)} ETH`);
       } else {
         console.error('[ETH Balance] RPC error:', result?.error);
         setEthBalanceWei(BigInt(0));
       }
     } catch (err) {
       console.error('[ETH Balance] Fetch failed:', err);
       setEthBalanceWei(BigInt(0));
     }
   }, [address]);

   const fetchEthPrice = useCallback(async () => {
     try {
       const resp = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd');
       const data = await resp.json();
       if (data.ethereum?.usd) setEthPriceUsd(data.ethereum.usd);
     } catch (err) {
       console.error('Failed to fetch ETH price:', err);
     }
   }, []);

    // Query USDC balance on Base for the connected address (via direct Base RPC)
    const fetchUsdcBalance = useCallback(async () => {
      console.log('[USDC Balance] fetchUsdcBalance called', { address, selectedNetwork, gasOrderCompleted, usdcOrder, isCheckingUsdc, usdcBalance });
      if (!address) {
        console.log('[USDC Balance] No address, skipping');
        setUsdcBalance(null);
        return;
      }
      setIsCheckingUsdc(true);
      try {
        // USDC on Base mainnet
        const USDC_BASE = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
        const balanceOfSig = '0x70a08231'; // balanceOf(address) signature
        const paddedAddress = address.slice(2).padStart(64, '0');
        const data = balanceOfSig + paddedAddress;

        console.log('[USDC Balance] Querying Base RPC:', BASE_RPC_URL);
        const response = await fetch(BASE_RPC_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            method: 'eth_call',
            params: [{ to: USDC_BASE, data }, 'latest'],
            id: 1
          })
        });
        const result = await response.json();
        console.log('[USDC Balance] RPC response:', result);
        if (result.result) {
          const balance = BigInt(result.result);
          setUsdcBalance(balance);
          const usdcHuman = Number(balance) / 1e6;
          console.log(`[USDC Balance] Updated: ${balance.toString()} = ${usdcHuman.toFixed(6)} USDC`);
        } else {
          console.error('[USDC Balance] RPC error:', result.error);
          setUsdcBalance(null);
        }
      } catch (err: any) {
        console.error('[USDC Balance] Fetch failed:', err);
        setUsdcBalance(null);
      } finally {
        setIsCheckingUsdc(false);
      }
    }, [address]);

  // Bridge helpers
  const fetchExchangeRate = useCallback(async (toCcy: string, dotAmount: number) => {
    try {
      const resp = await fetch(`${PEERLYTICS_PROXY_BASE}/exchange_rate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fromCcy: 'DOTAH', toCcy, amount: dotAmount }),
      });
      const data = await resp.json();
      if (data.status === 'good' && data.response?.data) return data.response.data;
      if (data.response?.data?.errors?.includes('LIMIT_MIN') || data.error?.includes('LIMIT_MIN')) {
        const fallback = 10;
        const resp2 = await fetch(`${PEERLYTICS_PROXY_BASE}/exchange_rate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fromCcy: 'DOTAH', toCcy, amount: fallback }),
        });
        const data2 = await resp2.json();
        if (data2.status === 'good' && data2.response?.data) {
          const fallbackData = data2.response.data;
          const scale = dotAmount / fallback;
          const scaledTo = parseFloat(fallbackData.to.amount) * scale;
          return { ...fallbackData, to: { ...fallbackData.to, amount: scaledTo.toFixed(fallbackData.to.precision || 8) } };
        }
      }
      throw new Error(data.error || 'Failed to get exchange rate');
    } catch (err: any) { throw err; }
  }, [PEERLYTICS_PROXY_BASE]);

  const createBridgeOrder = async (toCcy: string, dotAmount: number, phase: 'gas' | 'usdc') => {
    if (!address) { toast.error('Please connect your EVM wallet (Base) to receive funds'); return; }
    if (phase === 'gas') setIsCreatingGasOrder(true); else setIsCreatingUsdcOrder(true);
    try {
      const rateData = await fetchExchangeRate(toCcy, dotAmount);
      const toAmountRaw = parseFloat(rateData.to.amount);
      const decimals = toCcy === 'ETHBASE' ? 18 : 6;
      const expectedHuman = toAmountRaw / Math.pow(10, decimals);

      const tradeRes = await fetch(`${PEERLYTICS_PROXY_BASE}/trade`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fromCcy: 'DOTAH', toCcy, amount: dotAmount, destination_addres: address }),
      });
      const tradeJson = await tradeRes.json();
      if (tradeRes.status !== 200 || tradeJson.status !== 'trade created :)') throw new Error(tradeJson.error || 'Failed to create bridge order');

      const trade = tradeJson.trade;
      const orderId = trade.trade_id || trade.id;
      const depositAddress = trade.from.address;
      const actualToAmountRaw = parseFloat(trade.to.amount);
      const actualExpectedHuman = actualToAmountRaw / Math.pow(10, decimals);

      const order: BridgeOrder = { orderId, depositAddress, fromCurrency: 'DOTAH', toCurrency: toCcy, amount: dotAmount, expectedAmount: actualExpectedHuman, rawExpectedAmount: actualToAmountRaw, decimals, status: 'pending' };

      if (phase === 'gas') setGasOrder(order);
      else { setUsdcOrder(order); setAmount(actualExpectedHuman.toFixed(6).replace(/\.?0+$/, "")); }
      toast.success(`Bridge order created! Send DOT to the deposit address.`);
    } catch (err: any) {
      console.error('createBridgeOrder error:', err);
      toast.error(`Error: ${err.message}`);
    } finally {
      if (phase === 'gas') setIsCreatingGasOrder(false); else setIsCreatingUsdcOrder(false);
    }
  };

  const pollOrder = async (orderId: string, phase: 'gas' | 'usdc') => {
    try {
      const resp = await fetch(`${PEERLYTICS_PROXY_BASE}/order-status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderid: orderId }),
      });
      const data = await resp.json();
      if (data.msg === 'found trade' && data.data?.data) {
        const status = data.data.data.status;
        if (status === 'DONE') {
          if (phase === 'gas') { setGasOrder(p => p ? { ...p, status: 'completed' } : null); toast.success('✅ Gas bridge completed!'); }
          else { setUsdcOrder(p => p ? { ...p, status: 'completed' } : null); toast.success('✅ USDC bridge completed!'); }
          if (phase === 'gas') { if (pollingGasRef.current) clearInterval(pollingGasRef.current); setPollingGas(false); }
          else { if (pollingUsdcRef.current) clearInterval(pollingUsdcRef.current); setPollingUsdc(false); }
        } else if (status === 'EXPIRED' || status === 'EMERGENCY') {
          if (phase === 'gas') setGasOrder(p => p ? { ...p, status: 'failed' } : null);
          else setUsdcOrder(p => p ? { ...p, status: 'failed' } : null);
          toast.error(`Bridge order ${status.toLowerCase()}`);
          if (phase === 'gas') setPollingGas(false); else setPollingUsdc(false);
        }
      }
    } catch (err) { console.error('Polling error:', err); }
  };

  const startPollingForOrder = (phase: 'gas' | 'usdc') => {
    const orderId = phase === 'gas' ? gasOrder?.orderId : usdcOrder?.orderId;
    if (!orderId) return;
    if (phase === 'gas') setPollingGas(true); else setPollingUsdc(true);
    pollOrder(orderId, phase);
    const interval = setInterval(() => pollOrder(orderId, phase), 10000);
    if (phase === 'gas') pollingGasRef.current = interval; else pollingUsdcRef.current = interval;
  };

  const handleCreateUsdcOrder = async () => {
    const dotAmountVal = parseFloat(dotUsdcAmount);
    if (!dotAmountVal || dotAmountVal <= 0) { toast.error('Enter a valid DOT amount'); return; }
    if (!hasSufficientGasRef.current && !gasOrderCompletedRef.current) { toast.error('Complete the gas bridge first'); return; }
    try {
      const baseAmount = 10;
      const rateData = await fetchExchangeRate('USDCBASE', baseAmount);
      const fromAmt = parseFloat(rateData.from.amount);
      const toAmt = parseFloat(rateData.to.amount);
      const usdcPerDot = toAmt / fromAmt;
      const expectedUsdc = dotAmountVal * usdcPerDot;
      const confirmed = window.confirm(`Send ${dotAmountVal} DOT to receive ~${expectedUsdc.toFixed(6)} USDC on Base. Continue?`);
      if (!confirmed) return;
      await createBridgeOrder('USDCBASE', dotAmountVal, 'usdc');
    } catch (err: any) { toast.error('Failed to get rate: ' + err.message); }
  };

    const handleOfframp = async () => {
      if (!address) { toast.error("Please connect your wallet"); return; }
      if (!walletClient) { toast.error("Wallet client not available"); return; }
      if (!hasSufficientGasRef.current && !gasOrderCompletedRef.current) { toast.error('Please complete the gas bridge first'); return; }
      if (!usdcOrderCompleted) { toast.error('Please complete the USDC bridge first'); return; }

      // Auto-switch to Base if on wrong network
      if (chain?.id !== BASE_CHAIN_ID) {
        toast.info(`Switching to Base network...`);
        try {
          await walletClient.switchChain({ id: base.id });
        } catch (err: any) {
          console.error('Failed to switch chain:', err);
          toast.error(`Failed to switch to Base: ${err.message || 'User rejected'}`);
          return;
        }
      }

     setIsLoading(true);
     setError(null);
     setDepositId(null);
     setTxHash(null);
     setResumed(false);
     const toastId = toast.loading('Starting offramp...');

     try {
       // === USDC APPROVAL STEP ===
       const USDC_BASE = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
       const OFF_RAMP_CONTRACT = '0x777777779d229cdF3110e9de47943791c26300Ef';

       toast.update(toastId, { render: 'Step 1: Approving USDC spending...', isLoading: true });

       const amountWei = BigInt(Math.round(usdcAmount * 1e6));
       const approveData = '0x095ea7b3' +
         OFF_RAMP_CONTRACT.slice(2).padStart(64, '0') +
         amountWei.toString(16).padStart(64, '0');

       const approveTxHash = await walletClient.request({
         method: 'eth_sendTransaction',
         params: [{ to: USDC_BASE, data: approveData, value: '0x0', from: address }],
       });
       console.log('USDC approval tx:', approveTxHash);

       // Wait for confirmation
       let approved = false;
       for (let i = 0; i < 60; i++) {
         try {
           const receipt: any = await walletClient.request({
             method: 'eth_getTransactionReceipt',
             params: [approveTxHash],
           });
           if (receipt && receipt.status === '0x1') { approved = true; break; }
         } catch {}
         await new Promise(r => setTimeout(r, 2000));
       }
       if (!approved) throw new Error('USDC approval transaction failed or timed out');

       // === OFF RAMP STEP ===
       toast.update(toastId, { render: 'Step 2: Creating deposit...', isLoading: true });

       const params: OfframpParams = {
         amount,
         platform: platform as PlatformEntry,
         currency: currency as CurrencyEntry,
         identifier: validation?.normalized || identifier,
       };
       if (otcTaker) params.otcTaker = otcTaker as `0x${string}`;

       const result = await offramp(walletClient, params, (progress) => {
         setStep(progress.step);
         if (progress.txHash) console.log('Tx:', progress.txHash);
         if (progress.depositId) console.log('Deposit:', progress.depositId);
       });

       setDepositId(result.depositId);
       setTxHash(result.txHash);
       setResumed(result.resumed || false);
       toast.update(toastId, { render: `✅ Offramp complete! Deposit #${result.depositId}`, type: 'success', isLoading: false, autoClose: 8000 });
       console.log('Offramp result:', result);
     } catch (err: any) {
       console.error('Offramp failed:', err);
       setError(err);
       let errorMsg = `Offramp failed: ${err.message}`;
       if (err.code === 'USER_CANCELLED') errorMsg = 'User cancelled transaction';
       else if (err.code === 'APPROVAL_FAILED') errorMsg = 'USDC approval failed';
       else if (err.code === 'REGISTRATION_FAILED') errorMsg = 'Payment registration failed';
       else if (err.code === 'DEPOSIT_FAILED') errorMsg = 'Deposit creation failed';
       else if (err.code === 'CONFIRMATION_FAILED') errorMsg = 'Transaction confirmation timeout';
       else if (err.code === 'DELEGATION_FAILED') errorMsg = 'Vault delegation failed';
       else if (err.code === 'VALIDATION') errorMsg = `Invalid input: ${err.message}`;
       else if (err.code === 'UNSUPPORTED') errorMsg = `Unsupported: ${err.message}`;
       toast.update(toastId, { render: errorMsg, type: 'error', isLoading: false, autoClose: 10000 });
     } finally { setIsLoading(false); }
   };

   // Copy handler
  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text).then(() => {
      toast.success(`${label} copied!`, { position: "top-right", autoClose: 2000, theme: "dark" });
    }).catch(() => toast.error('Copy failed'));
  };

  // Render Step 1
  const renderStep1 = () => {
    if (gasOrder) {
      return (
        <div style={{ marginBottom: "2rem", padding: "1rem", background: "rgba(168,85,247,0.05)", borderRadius: "8px", border: "1px solid rgba(168,85,247,0.2)" }}>
          <h3 style={{ marginTop: 0, color: "#a855f7" }}>Step 1: Bridge DOT → ETH (for gas)</h3>
          <div style={{ marginTop: "1rem", padding: "1rem", background: "rgba(168,85,247,0.1)", borderRadius: "8px" }}>
            <p style={{ margin: "0.25rem 0" }}><strong>Deposit Address:</strong></p>
            <div style={{ display: "flex", gap: "1rem", alignItems: "flex-start", flexWrap: "wrap" }}>
              {gasQrCode && <div style={{ flexShrink: 0 }}><img src={gasQrCode} alt="QR" style={{ width: "150px", height: "150px", border: "2px solid #22c55e", borderRadius: "8px", padding: "4px" }} /></div>}
              <div style={{ flex: 1, minWidth: "200px" }}>
                <p style={{ margin: "0.25rem 0", fontFamily: "monospace", wordBreak: "break-all", background: "#111", padding: "0.5rem", borderRadius: "4px", color: "#22c55e", fontSize: "0.85rem" }}>{gasOrder.depositAddress}</p>
                <button onClick={() => copyToClipboard(gasOrder.depositAddress, "Gas address")} style={{ marginTop: "0.5rem", padding: "0.5rem 1rem", background: "#374151", color: "#fff", border: "none", borderRadius: "4px", cursor: "pointer" }}>📋 Copy</button>
              </div>
            </div>
            <p style={{ margin: "0.25rem 0", marginTop: "0.5rem" }}>Send <strong>{gasOrder.amount.toFixed(6)} DOT</strong>. You receive <strong>{gasOrder.expectedAmount.toFixed(6)} ETH</strong>.</p>
            {!gasOrderCompleted && (
              <button onClick={() => startPollingForOrder('gas')} disabled={pollingGas} style={{ marginTop: "0.5rem", padding: "0.5rem 1rem", background: pollingGas ? "#374151" : "#22c55e", color: "#fff", border: "none", borderRadius: "4px", cursor: pollingGas ? "not-allowed" : "pointer" }}>
                {pollingGas ? "Polling..." : "I've sent DOT - Start Polling"}
              </button>
            )}
            {gasOrderCompleted && <p style={{ color: "#22c55e" }}>✅ Order completed. ETH should be in your Base wallet.</p>}
          </div>
        </div>
      );
    }
    if (hasSufficientGas) {
      return (
        <div style={{ marginBottom: "2rem", padding: "1rem", background: "rgba(34,197,94,0.1)", borderRadius: "8px", border: "1px solid rgba(34,197,94,0.3)" }}>
          <h3 style={{ marginTop: 0, color: "#22c55e" }}>✅ Step 1: Gas Skipped — Sufficient ETH Balance</h3>
          <p style={{ margin: "0.5rem 0" }}>Your Base wallet has <strong>{ethBalanceEth.toFixed(6)} ETH</strong>{ethPriceUsd && <span> (~${ethBalanceUsd.toFixed(2)} USD)</span>}, sufficient for gas.</p>
        </div>
      );
    }
    return (
      <div style={{ marginBottom: "2rem", padding: "1rem", background: "rgba(168,85,247,0.05)", borderRadius: "8px", border: "1px solid rgba(168,85,247,0.2)" }}>
        <h3 style={{ marginTop: 0, color: "#a855f7" }}>Step 1: Bridge DOT → ETH (for gas)</h3>
        <div style={{ marginBottom: "1rem", padding: "0.75rem", background: "rgba(0,0,0,0.2)", borderRadius: "8px" }}>
          <p style={{ margin: 0, fontSize: "0.9rem" }}><strong>Base ETH Balance:</strong> {ethPriceUsd ? `${ethBalanceEth.toFixed(6)} ETH (~$${ethBalanceUsd.toFixed(2)} USD)` : `${ethBalanceEth.toFixed(6)} ETH`}</p>
        </div>
        <p style={{ fontSize: "0.9rem", marginBottom: "1rem" }}>Send DOT to receive ETH on Base.</p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1rem" }}>
          <div>
            <label style={{ display: "block", marginBottom: "0.5rem", fontSize: "0.9rem", color: "#ccc" }}>DOT Amount</label>
            <input type="number" value={dotGasAmount} onChange={(e) => setDotGasAmount(e.target.value)} min="0.1" step="0.1" disabled={isCreatingGasOrder} style={{ width: "100%", padding: "0.75rem", background: "#1a0b2e", color: "#fff", border: "1px solid rgba(147,51,234,0.5)", borderRadius: "8px" }} />
          </div>
          <div style={{ display: "flex", alignItems: "flex-end" }}>
            <button onClick={() => createBridgeOrder('ETHBASE', parseFloat(dotGasAmount), 'gas')} disabled={isCreatingGasOrder} style={{ width: "100%", padding: "0.75rem", background: isCreatingGasOrder ? "#374151" : "linear-gradient(135deg, #a855f7, #7c3aed)", color: "#fff", border: "none", borderRadius: "8px", cursor: isCreatingGasOrder ? "not-allowed" : "pointer" }}>
              {isCreatingGasOrder ? "Creating Order..." : "Create Gas Order"}
            </button>
          </div>
        </div>
      </div>
    );
  };

  // Best rate
  const bestRate = quotes.length > 0
    ? quotes.filter((q) => platform.currencies.includes(q.currency)).sort((a, b) => ((b.median ?? b.suggestedRate) || 0) - ((a.median ?? a.suggestedRate) || 0))[0]
    : null;

  const stepLabels: Record<string, string> = {
    approving: "Approving USDC...",
    registering: "Registering payment details...",
    depositing: "Creating deposit...",
    confirming: "Waiting for confirmation...",
    delegating: "Delegating to vault...",
    restricting: "Setting up private order...",
    resuming: "Resuming previous attempt...",
    done: "Complete!",
  };

   // Main effects
   useEffect(() => { fetchQuotes(); }, [fetchQuotes]);
   useEffect(() => { fetchOrderbook(); }, [fetchOrderbook]);
   useEffect(() => { fetchSettlementTime(); }, [fetchSettlementTime]);
   useEffect(() => {
     fetchEthPrice();
     const i = setInterval(fetchEthPrice, 60000);
     return () => clearInterval(i);
   }, [fetchEthPrice]);
   useEffect(() => {
     fetchEthBalance();
     const i = setInterval(fetchEthBalance, 15000);
     return () => clearInterval(i);
   }, [fetchEthBalance]);

   // Network switch reminder when on wrong chain for offramp
   useEffect(() => {
     if (!chain || chain.id === BASE_CHAIN_ID) return;

     const toastId = toast.info(
       <div style={{ textAlign: 'left' }}>
         <div><strong>Switch to Base Network</strong></div>
         <div style={{ fontSize: '0.85rem', marginTop: '0.25rem' }}>
           Offramp requires Base network. Current: {chain.name} (chainId: {chain.id})
         </div>
       </div>,
       { autoClose: 8000, closeOnClick: false, position: 'top-right' }
     );

     return () => toast.dismiss(toastId);
   }, [chain]);

    // Check USDC balance on Base when user reaches Step 2 with Polkadot selected
    // Triggers when gas bridge is complete OR user has sufficient ETH for gas (≥$1.5)
    useEffect(() => {
      console.log('[USDC Effect] Running effect with deps:', {
        selectedNetwork,
        gasOrderCompleted,
        ethBalanceUsd,
        usdcOrder,
        address,
        isCheckingUsdc,
        usdcBalance,
        showUsdcPrompt
      });
      
      const gasBridgeReady = gasOrderCompleted || ethBalanceUsd >= 1.5;
      
      // Conditions: Polkadot network selected, in step 2 (no usdcOrder yet), gas bridge ready, have EVM address, not already checked
      if (selectedNetwork === 'polkadot' && gasBridgeReady && !usdcOrder && address && !isCheckingUsdc && usdcBalance === null && !showUsdcPrompt) {
        console.log('[USDC Effect] Conditions met, calling fetchUsdcBalance');
        fetchUsdcBalance();
      } else {
        console.log('[USDC Effect] Conditions NOT met:', {
          polkadot: selectedNetwork === 'polkadot',
          gasBridgeReady,
          hasUsdcOrder: !!usdcOrder,
          hasAddress: !!address,
          notChecking: !isCheckingUsdc,
          balanceNull: usdcBalance === null,
          noPrompt: !showUsdcPrompt
        });
      }
    }, [selectedNetwork, gasOrderCompleted, ethBalanceUsd, usdcOrder, address, isCheckingUsdc, usdcBalance, showUsdcPrompt, fetchUsdcBalance]);

  useEffect(() => {
    if (chain && chain.id !== BASE_CHAIN_ID) {
      toast.warn(`Please switch to Base network (chainId: ${BASE_CHAIN_ID}) to use Offramp`);
    }
  }, [chain]);

  useEffect(() => {
    return () => {
      if (pollingGasRef.current) clearInterval(pollingGasRef.current);
      if (pollingUsdcRef.current) clearInterval(pollingUsdcRef.current);
    };
  }, []);

  // Debounced rate estimation for Step 2 (only when dotUsdcAmount changes)
  useEffect(() => {
    const val = parseFloat(dotUsdcAmount);
    if (!val || val <= 0) {
      setEstimatedUsdc(null);
      return;
    }
    if (!hasSufficientGasRef.current && !gasOrderCompletedRef.current) {
      setEstimatedUsdc(null);
      return;
    }
    const timer = setTimeout(async () => {
      setIsFetchingRate(true);
      try {
        const baseAmount = 10;
        const resp = await fetch(`${PEERLYTICS_PROXY_BASE}/exchange_rate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fromCcy: 'DOTAH', toCcy: 'USDCBASE', amount: baseAmount }),
        });
        const data = await resp.json();
        let rateData;
        if (data.status === 'good' && data.response?.data) {
          rateData = data.response.data;
        } else if (data.response?.data?.errors?.includes('LIMIT_MIN') || data.error?.includes('LIMIT_MIN')) {
          const fallback = 10;
          const resp2 = await fetch(`${PEERLYTICS_PROXY_BASE}/exchange_rate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fromCcy: 'DOTAH', toCcy: 'USDCBASE', amount: fallback }),
          });
          const data2 = await resp2.json();
          if (data2.status === 'good' && data2.response?.data) {
            const fallbackData = data2.response.data;
            const scale = baseAmount / fallback;
            const scaledTo = parseFloat(fallbackData.to.amount) * scale;
            rateData = { ...fallbackData, to: { ...fallbackData.to, amount: scaledTo.toFixed(fallbackData.to.precision || 8) } };
          } else {
            throw new Error(data.error || 'Failed to get exchange rate');
          }
        } else {
          throw new Error(data.error || 'Failed to get exchange rate');
        }
        const fromAmt = parseFloat(rateData.from.amount);
        const toAmt = parseFloat(rateData.to.amount);
        const usdcPerDot = toAmt / fromAmt;
        setEstimatedUsdc(val * usdcPerDot);
      } catch (err) {
        console.error('Rate fetch error:', err);
        setEstimatedUsdc(null);
      } finally {
        setIsFetchingRate(false);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [dotUsdcAmount]);

  // QR generation
  useEffect(() => {
    if (gasOrder?.depositAddress) {
      QRCode.toDataURL(gasOrder.depositAddress, { width: 200, margin: 2 }).then(setGasQrCode).catch(console.error);
    } else setGasQrCode("");
  }, [gasOrder?.depositAddress]);

  useEffect(() => {
    if (usdcOrder?.depositAddress) {
      QRCode.toDataURL(usdcOrder.depositAddress, { width: 200, margin: 2 }).then(setUsdcQrCode).catch(console.error);
    } else setUsdcQrCode("");
  }, [usdcOrder?.depositAddress]);

  return (
    <div className="offramp-widget" style={{ maxWidth: "700px", margin: "0 auto", padding: "1rem" }}>
      <h2 style={{ textAlign: "center", marginBottom: "1.5rem", color: "#a855f7" }}>Convert USDC → Fiat</h2>

      {/* Source Network */}
      <div style={{ marginBottom: "1rem", padding: "0.75rem", background: "rgba(168,85,247,0.1)", borderRadius: "8px", border: "1px solid rgba(168,85,247,0.2)" }}>
        <p style={{ margin: 0, fontSize: "0.9rem" }}><strong>Source Network:</strong> Polkadot</p>
        <p style={{ margin: "0.25rem 0 0", fontSize: "0.8rem", color: "#888" }}>You will bridge DOT → ETH (for gas) and DOT → USDC (for offramp).</p>
      </div>

      {/* Wallet info */}
      <div style={{ marginBottom: "1.5rem", padding: "1rem", background: "rgba(168,85,247,0.1)", borderRadius: "12px", border: "1px solid rgba(168,85,247,0.2)" }}>
        <p style={{ margin: "0.5rem 0", fontSize: "0.9rem" }}><strong>Wallet:</strong> {address ? `${address.slice(0,6)}...${address.slice(-4)}` : "Not connected"}</p>
        <p style={{ margin: "0.5rem 0", fontSize: "0.9rem" }}><strong>Network:</strong> {chain?.name || "Unknown"} (chainId: {chain?.id})</p>
        <p style={{ margin: "0.5rem 0", fontSize: "0.8rem", color: "#888" }}>Ensure you have a Polkadot wallet to send DOT, and ETH on Base for gas.</p>
      </div>

      {/* Best rate */}
      {bestRate && (
        <div style={{ marginBottom: "1.5rem", padding: "1rem", background: "linear-gradient(135deg, rgba(34,197,94,0.1), rgba(34,197,94,0.05))", borderRadius: "12px", border: "1px solid rgba(34,197,94,0.3)" }}>
          <h4 style={{ margin: "0 0 0.5rem 0", color: "#22c55e" }}>Best Available Rate</h4>
          <p style={{ margin: "0.25rem 0" }}><strong>{bestRate.platform}</strong>: 1 USDC = {((bestRate.median ?? bestRate.suggestedRate) || 0).toFixed(4)} {currencyCode}</p>
          <p style={{ margin: "0.25rem 0", fontSize: "0.85rem", color: "#aaa" }}>Liquidity: ${(bestRate.totalLiquidity / 1000).toFixed(1)}K</p>
        </div>
      )}

      {/* Step 1 */}
      {renderStep1()}

      {/* Step 2: Bridge DOT → USDC */}
      <div style={{ marginBottom: "2rem", padding: "1rem", background: "rgba(168,85,247,0.05)", borderRadius: "8px", border: "1px solid rgba(168,85,247,0.2)" }}>
        <h3 style={{ marginTop: 0, color: "#a855f7" }}>Step 2: Bridge DOT → USDC</h3>
        <p style={{ fontSize: "0.9rem", marginBottom: "1rem" }}>Enter the amount of DOT you want to send. We'll show you how much USDC you'll receive on Base.</p>
        
         {/* USDC existing balance prompt for Polkadot users */}
         {selectedNetwork === 'polkadot' && (gasOrderCompleted || ethBalanceUsd >= 1.5) && !usdcOrder && usdcBalance !== null && usdcBalance > 0n && !showUsdcPrompt && !useExistingUsdc && (
          <div style={{ 
            marginBottom: "1rem", 
            padding: "1rem", 
            background: "rgba(34,197,94,0.1)", 
            borderRadius: "8px", 
            border: "1px solid rgba(34,197,94,0.3)" 
          }}>
            <p style={{ margin: "0 0 0.5rem 0", fontSize: "0.9rem", color: "#22c55e" }}>
              💰 You have <strong>{(Number(usdcBalance) / 1e6).toFixed(6)} USDC</strong> on Base.
            </p>
            <p style={{ margin: "0 0 1rem 0", fontSize: "0.9rem", color: "#ccc" }}>
              Would you like to use your existing USDC directly instead of bridging more DOT?
            </p>
            <div style={{ display: "flex", gap: "1rem" }}>
               <button 
                 onClick={() => {
                   setUseExistingUsdc(true);
                   setShowUsdcPrompt(true);
                   // Mark step 2 as completed by setting a dummy usdcOrder with status 'completed'
                   setUsdcOrder({ status: 'completed', depositAddress: '' } as any);
                 }}
                style={{ 
                  flex: 1, 
                  padding: "0.75rem", 
                  background: "#22c55e", 
                  color: "#fff", 
                  border: "none", 
                  borderRadius: "8px", 
                  cursor: "pointer",
                  fontWeight: "bold"
                }}
              >
                Yes, Use Existing USDC
              </button>
              <button 
                onClick={() => setShowUsdcPrompt(true)}
                style={{ 
                  flex: 1, 
                  padding: "0.75rem", 
                  background: "#374151", 
                  color: "#fff", 
                  border: "none", 
                  borderRadius: "8px", 
                  cursor: "pointer"
                }}
              >
                No, Bridge More DOT
              </button>
            </div>
          </div>
        )}
        
        {/* If user chooses to use existing USDC, show confirmation and skip to step 3 */}
        {useExistingUsdc && (
          <div style={{ 
            marginBottom: "1rem", 
            padding: "1rem", 
            background: "rgba(34,197,94,0.1)", 
            borderRadius: "8px", 
            border: "1px solid rgba(34,197,94,0.3)" 
          }}>
            <p style={{ margin: "0 0 0.5rem 0", fontSize: "0.9rem", color: "#22c55e" }}>
              ✅ Using existing Base USDC balance: <strong>{(Number(usdcBalance) / 1e6).toFixed(6)} USDC</strong>
            </p>
            <button 
              onClick={() => {
                setUseExistingUsdc(false);
                setUsdcOrder(null);
              }}
              style={{ 
                padding: "0.5rem 1rem", 
                background: "transparent", 
                color: "#a855f7", 
                border: "1px solid #a855f7", 
                borderRadius: "4px", 
                cursor: "pointer",
                fontSize: "0.85rem"
              }}
            >
              Change Mind — Bridge DOT Instead
            </button>
          </div>
         )}
         
         {/* Bridge form - hidden when using existing USDC */}
         {!useExistingUsdc && (
           <>
             <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1rem" }}>
          <div>
            <label style={{ display: "block", marginBottom: "0.5rem", fontSize: "0.9rem", color: "#ccc" }}>DOT Amount</label>
            <input type="number" value={dotUsdcAmount} onChange={(e) => setDotUsdcAmount(e.target.value)} min="0.1" step="0.1" disabled={!!usdcOrder?.depositAddress} style={{ width: "100%", padding: "0.75rem", background: "#1a0b2e", color: "#fff", border: "1px solid rgba(147,51,234,0.5)", borderRadius: "8px" }} />
          </div>
          <div style={{ display: "flex", alignItems: "flex-end" }}>
            <button onClick={handleCreateUsdcOrder} disabled={isCreatingUsdcOrder || !!usdcOrder?.depositAddress || (!hasSufficientGas && !gasOrderCompleted)} style={{ width: "100%", padding: "0.75rem", background: (isCreatingUsdcOrder || !!usdcOrder?.depositAddress || (!hasSufficientGas && !gasOrderCompleted)) ? "#374151" : "linear-gradient(135deg, #a855f7, #7c3aed)", color: "#fff", border: "none", borderRadius: "8px", cursor: (isCreatingUsdcOrder || !!usdcOrder?.depositAddress || (!hasSufficientGas && !gasOrderCompleted)) ? "not-allowed" : "pointer" }}>
              {isCreatingUsdcOrder ? "Calculating..." : usdcOrder?.depositAddress ? "USDC Order Created" : "Create USDC Order"}
            </button>
          </div>
        </div>
        {/* Estimated USDC display */}
        {isFetchingRate && <p style={{ fontSize: "0.9rem", color: "#a855f7" }}>Fetching rate...</p>}
        {!isFetchingRate && estimatedUsdc !== null && (
          <p style={{ fontSize: "0.9rem", color: "#22c55e", marginTop: "-0.5rem", marginBottom: "1rem" }}>
            You will receive ~<strong>{estimatedUsdc.toFixed(6)} USDC</strong> on Base
          </p>
        )}
        {usdcOrder?.depositAddress && (
          <div style={{ marginTop: "1rem", padding: "1rem", background: "rgba(168,85,247,0.1)", borderRadius: "8px" }}>
            <p style={{ margin: "0.25rem 0" }}><strong>Deposit Address (receive DOT):</strong></p>
            <div style={{ display: "flex", gap: "1rem", alignItems: "flex-start", flexWrap: "wrap" }}>
              {usdcQrCode && <div style={{ flexShrink: 0 }}><img src={usdcQrCode} alt="QR" style={{ width: "150px", height: "150px", border: "2px solid #22c55e", borderRadius: "8px", padding: "4px" }} /></div>}
              <div style={{ flex: 1, minWidth: "200px" }}>
                <p style={{ margin: "0.25rem 0", fontFamily: "monospace", wordBreak: "break-all", background: "#111", padding: "0.5rem", borderRadius: "4px", color: "#22c55e", fontSize: "0.85rem" }}>{usdcOrder.depositAddress}</p>
                <button onClick={() => copyToClipboard(usdcOrder.depositAddress, "USDC address")} style={{ marginTop: "0.5rem", padding: "0.5rem 1rem", background: "#374151", color: "#fff", border: "none", borderRadius: "4px", cursor: "pointer" }}>📋 Copy</button>
              </div>
            </div>
            <p style={{ margin: "0.25rem 0", marginTop: "0.5rem" }}>Send <strong>{usdcOrder.amount.toFixed(6)} DOT</strong>. You will receive ~<strong>{usdcOrder.expectedAmount.toFixed(6)} USDC</strong>.</p>
            {usdcOrder.status !== 'completed' && (
              <button onClick={() => startPollingForOrder('usdc')} disabled={pollingUsdc} style={{ marginTop: "0.5rem", padding: "0.5rem 1rem", background: pollingUsdc ? "#374151" : "#22c55e", color: "#fff", border: "none", borderRadius: "4px", cursor: pollingUsdc ? "not-allowed" : "pointer" }}>
                {pollingUsdc ? "Polling..." : "I've sent DOT - Start Polling"}
              </button>
            )}
         {usdcOrder.status === 'completed' && <p style={{ color: "#22c55e" }}>✅ Order completed. USDC should be in your Base wallet.</p>}
            </div>
          )}
        </>)}
       </div>

       {/* Step 3: Offramp Form */}
        {usdcOrderCompleted && (
          <div style={{ marginTop: "2rem", padding: "1rem", background: "rgba(34,197,94,0.1)", borderRadius: "8px", border: "1px solid rgba(34,197,94,0.3)" }}>
            <h3 style={{ marginTop: 0, marginBottom: "1rem", color: "#22c55e" }}>Step 3: Offramp USDC → Fiat</h3>

            {/* USDC Amount */}
          <div style={{ marginBottom: "1rem" }}>
            <label style={{ display: "block", marginBottom: "0.5rem", fontSize: "0.9rem", color: "#ccc" }}>USDC Amount</label>
            <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} min="1" placeholder="20" style={{ width: "100%", padding: "0.75rem", background: "#1a0b2e", color: "#fff", border: "1px solid rgba(147,51,234,0.5)", borderRadius: "8px", fontSize: "1.1rem" }} />
            {bestRate && amount && usdcAmount > 0 && (
              <p style={{ marginTop: "0.5rem", fontSize: "0.9rem", color: "#22c55e" }}>
                You receive ~{(usdcAmount * ((bestRate.median ?? bestRate.suggestedRate) || 0)).toFixed(2)} {currencyCode}
              </p>
            )}
          </div>

          {/* Platform and Currency */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1rem" }}>
            <div>
              <label style={{ display: "block", marginBottom: "0.5rem", fontSize: "0.9rem", color: "#ccc" }}>Platform</label>
              <select value={platformId} onChange={(e) => { setPlatformId(e.target.value); setIdentifier(""); }} style={{ width: "100%", padding: "0.75rem", background: "#1a0b2e", color: "#fff", border: "1px solid rgba(147,51,234,0.5)", borderRadius: "8px" }}>
                {Object.values(PLATFORMS).map((p) => (<option key={p.id} value={p.id}>{p.name}</option>))}
              </select>
            </div>
            <div>
              <label style={{ display: "block", marginBottom: "0.5rem", fontSize: "0.9rem", color: "#ccc" }}>Currency</label>
              <select value={currencyCode} onChange={(e) => setCurrencyCode(e.target.value)} style={{ width: "100%", padding: "0.75rem", background: "#1a0b2e", color: "#fff", border: "1px solid rgba(147,51,234,0.5)", borderRadius: "8px" }}>
                {platform.currencies.map((code) => {
                  const curr = CURRENCIES[code as keyof typeof CURRENCIES];
                  return curr ? (<option key={code} value={code}>{code} — {curr.name}</option>) : null;
                })}
              </select>
            </div>
          </div>

          {/* Identifier */}
          <div style={{ marginBottom: "1.5rem" }}>
            <label style={{ display: "block", marginBottom: "0.5rem", fontSize: "0.9rem", color: "#ccc" }}>{platform.identifier.label}</label>
            <input type="text" value={identifier} onChange={(e) => setIdentifier(e.target.value)} placeholder={platform.identifier.placeholder} style={{ width: "100%", padding: "0.75rem", background: "#1a0b2e", color: "#fff", border: "1px solid rgba(147,51,234,0.5)", borderRadius: "8px" }} />
            <small style={{ color: "#888", display: "block", marginTop: "0.25rem" }}>{platform.identifier.help}</small>
            {validation && !validation.valid && <p style={{ color: "#ef4444", fontSize: "0.85rem", marginTop: "0.5rem" }}>{validation.error}</p>}
          </div>

          {/* OTC */}
          <details style={{ marginBottom: "1.5rem" }}>
            <summary style={{ cursor: "pointer", color: "#a855f7" }}>Private Order (OTC)</summary>
            <p style={{ fontSize: "0.85rem", color: "#888", marginTop: "0.5rem" }}>Restrict this deposit to a specific taker wallet address.</p>
            <input type="text" value={otcTaker} onChange={(e) => setOtcTaker(e.target.value)} placeholder="0xTakerAddress (optional)" style={{ width: "100%", padding: "0.75rem", background: "#1a0b2e", color: "#fff", border: "1px solid rgba(147,51,234,0.5)", borderRadius: "8px", marginTop: "0.5rem" }} />
          </details>

          {/* Submit */}
          <button onClick={handleOfframp} disabled={!canSubmit} style={{ width: "100%", padding: "1rem", fontSize: "1.1rem", fontWeight: "bold", background: canSubmit ? "linear-gradient(135deg, #a855f7, #7c3aed)" : "#374151", color: canSubmit ? "#fff" : "#9ca3af", border: "none", borderRadius: "12px", cursor: canSubmit ? "pointer" : "not-allowed", transition: "all 0.2s" }}>
            {isLoading ? "Processing..." : `Sell ${usdcAmount.toFixed(2)} USDC → ${currency.symbol}`}
          </button>

          {/* Progress */}
          {step && step !== "done" && (
            <div style={{ padding: "1rem", background: "rgba(168,85,247,0.1)", borderRadius: "8px", marginTop: "1rem", textAlign: "center", border: "1px solid rgba(168,85,247,0.2)" }}>
              <strong>Status:</strong> {stepLabels[step] || step}
            </div>
          )}

          {/* Error */}
          {error && (
            <div style={{ padding: "1rem", background: "rgba(239,68,68,0.1)", borderRadius: "8px", marginTop: "1rem", border: "1px solid rgba(239,68,68,0.3)", color: "#f87171" }}>
              <strong>Error [{error.code}]:</strong> {error.message}
            </div>
          )}

          {/* Success */}
          {depositId && (
            <div style={{ padding: "1rem", background: "rgba(34,197,94,0.1)", borderRadius: "8px", marginTop: "1rem", border: "1px solid rgba(34,197,94,0.3)", color: "#4ade80" }}>
              <p style={{ margin: "0.5rem 0" }}>✅ Offramp deposit created: <strong>#{depositId}</strong></p>
              {txHash && <p style={{ margin: "0.5rem 0", wordBreak: "break-all", fontSize: "0.85rem" }}>TX: {txHash.slice(0,10)}...{txHash.slice(-8)}</p>}
              <p style={{ margin: "0.5rem 0", fontSize: "0.9rem" }}>Order sent off to ZKP2P's order book, waiting for fulfillment. View more details here:</p>
              <p style={{ margin: "0.5rem 0" }}><a href={`https://peerlytics.xyz/explorer/deposit/${depositId}`} target="_blank" rel="noopener noreferrer" style={{ color: "#60a5fa", textDecoration: "underline" }}>https://peerlytics.xyz/explorer/deposit/{depositId}</a></p>
              {resumed && <p style={{ color: "#fbbf24" }}>⚠️ Resumed from previous attempt</p>}
            </div>
          )}
        </div>
      )}

      {/* Settlement footer */}
      <div style={{ fontSize: "0.8rem", color: "#888", marginTop: "1rem", textAlign: "center" }}>
        {isLoadingSettlement ? <span>Loading settlement time...</span> : settlementTime ? (
          <span>Average fiat processing time: <strong style={{ color: "#a855f7" }}>{settlementTime}</strong> minutes&nbsp;<a href="https://peerlytics.xyz/protocol/settlement" target="_blank" rel="noopener noreferrer" style={{ color: "#a855f7" }}>(details)</a></span>
        ) : <span>View fiat processing times: <a href="https://peerlytics.xyz/protocol/settlement" target="_blank" rel="noopener noreferrer" style={{ color: "#a855f7" }}>https://peerlytics.xyz/protocol/settlement</a></span>}
      </div>
      <p style={{ fontSize: "0.8rem", color: "#888", marginTop: "1rem", textAlign: "center" }}>Powered by <a href="https://peerlytics.xyz" target="_blank" rel="noopener noreferrer" style={{ color: "#a855f7" }}>Peerlytics</a></p>
    </div>
  );
}