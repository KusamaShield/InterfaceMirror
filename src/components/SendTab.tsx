/*
 * Copyright 2025 Kusama Shield Developers on behalf of the Kusama DAO, see LICENSE in main folder.
 *
 * Send tab — private transfer to another user via the Flask proxy
 * (https://proxyswap.laissez-faire.trade).
 *
 * Routing (combines swap + shield):
 *  - same native token (DOT→DOT / KSM→KSM): deposit into the pool, then withdraw
 *    through the forwarder (deposit_withdraw).
 *  - source not DOT/KSM: swap source→DOT, deposit DOT, enqueue the withdrawal
 *    (swap_deposit_withdraw). Withdrawals are batched by the proxy so deposits
 *    landing within BATCH_WAIT_SECONDS (120s) are withdrawn together, which makes
 *    traffic correlation harder.
 *  - native → other token: deposit native into the pool, then withdraw + swap +
 *    forward to the destination (withdraw_swap_forward).
 *
 * The estimated arrival amount comes from the proxy /exchange_rate endpoint.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "react-toastify";

import { parseDotAmount } from "../transactions/revivePolkadot";

// Flask proxy (prod: https://proxyswap.laissez-faire.trade). For local backend
// work, point this at /home/pi/zk/swap/proxy/start_local_flask_proxy.sh
// (http://pi:5000) temporarily.
const SWAP_API_BASE = "https://proxyswap.laissez-faire.trade";

const NATIVE_BY_NETWORK: Record<string, string> = {
  polkadot: "DOT",
  kusama: "KSM",
};

// Gas units for a same-token (native) send: deposit + withdraw.
const GAS_UNITS: Record<string, { deposit: bigint; withdraw: bigint }> = {
  polkadot: { deposit: 50000n, withdraw: 100000n },
  kusama: { deposit: 200000n, withdraw: 400000n },
  westend_assethub: { deposit: 150000n, withdraw: 300000n },
  paseo_assethub: { deposit: 20000n, withdraw: 40000n },
};

const FALLBACK_TOKENS = [
  "DOT",
  "KSM",
  "LTC",
  "XMR",
  "BTC",
  "ETH",
  "USDT",
  "USDC",
  "SOL",
  "SUI",
  "ADA",
  "BNB",
];

// Logos for tickers that may not be present in the app's currency list.
const FALLBACK_LOGOS: Record<string, string> = {
  DOT: "/coin_logos/images/dot.svg",
  KSM: "/coin_logos/images/kusama.svg",
  USDT: "/coin_logos/images/usdt.svg",
  USDC: "/coin_logos/images/usdceth.svg",
  ETH: "/coin_logos/images/eth_dark.svg",
  BTC: "/coin_logos/images/btc.svg",
  LTC: "/coin_logos/images/ltc.svg",
  SOL: "/coin_logos/images/sol.svg",
  SUI: "/coin_logos/images/sui.svg",
  XMR: "/coin_logos/images/xmr.svg",
  ADA: "/coin_logos/images/ada_dark.svg",
  BNB: "/coin_logos/images/bnbopbnb.svg",
};

interface CurrencyMeta {
  symbol: string;
  name: string;
  logo: string;
}

interface SendTabProps {
  selectedNetwork: string;
  isMainnet: boolean;
  evmAddress: string | null;
  polkadotAddress: string | null;
  currencies: CurrencyMeta[];
  rpcEndpoint: string;
  onConnectRequest: () => void;
  onShieldForSend: (amount: string, token: string) => Promise<string>;
}

function TokenDropdown({
  value,
  onChange,
  tokens,
}: {
  value: string;
  onChange: (symbol: string) => void;
  tokens: CurrencyMeta[];
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selected = tokens.find((t) => t.symbol === value);

  return (
    <div className="token-select" ref={ref}>
      <button
        type="button"
        className={`token-select-trigger ${open ? "open" : ""}`}
        onClick={() => setOpen((o) => !o)}
      >
        {selected?.logo && (
          <img
            src={selected.logo}
            alt={selected.symbol}
            className="token-select-logo"
          />
        )}
        <span className="token-select-sym">{value}</span>
        <span className="token-select-arrow">▼</span>
      </button>
      {open && (
        <div className="token-select-menu">
          {tokens.map((t) => (
            <div
              key={t.symbol}
              className={`token-select-option ${t.symbol === value ? "selected" : ""}`}
              onClick={() => {
                onChange(t.symbol);
                setOpen(false);
              }}
            >
              {t.logo && (
                <img
                  src={t.logo}
                  alt={t.symbol}
                  className="token-select-logo"
                />
              )}
              <span className="token-select-sym">{t.symbol}</span>
              <span className="token-select-name">{t.name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function SendTab({
  selectedNetwork,
  isMainnet,
  evmAddress,
  polkadotAddress,
  currencies,
  rpcEndpoint,
  onConnectRequest,
  onShieldForSend,
}: SendTabProps) {
  const nativeToken = NATIVE_BY_NETWORK[selectedNetwork] || "DOT";

  const [tokens, setTokens] = useState<string[]>(FALLBACK_TOKENS);
  const [fromToken, setFromToken] = useState<string>(nativeToken);
  const [toToken, setToToken] = useState<string>(nativeToken);
  const [amount, setAmount] = useState<string>("");
  const [recipient, setRecipient] = useState<string>("");
  const [estimate, setEstimate] = useState<{
    toAmount: string;
    rate: string;
    usd?: string;
  } | null>(null);
  const [isEstimating, setIsEstimating] = useState(false);
  const [gasFee, setGasFee] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [withdrawalId, setWithdrawalId] = useState<string | null>(null);
  const [batchStatus, setBatchStatus] = useState<any>(null);

  // Keep the native token in sync when the network changes.
  useEffect(() => {
    setFromToken(nativeToken);
    setToToken(nativeToken);
    setEstimate(null);
  }, [nativeToken]);

  // Load the token list the proxy can swap.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${SWAP_API_BASE}/swap-tokens`);
        const data = await res.json();
        const list: string[] = Array.isArray(data?.tokens) ? data.tokens : [];
        if (!cancelled && list.length > 0) {
          const merged = Array.from(new Set([...FALLBACK_TOKENS, ...list]));
          setTokens(merged);
        }
      } catch {
        /* keep fallback list */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Token metadata (logo + name) for the dropdowns.
  const tokenMeta: CurrencyMeta[] = useMemo(() => {
    const bySymbol = new Map<string, CurrencyMeta>();
    for (const c of currencies || []) {
      if (c?.symbol) bySymbol.set(c.symbol.toUpperCase(), c);
    }
    return tokens.map((sym) => {
      const key = sym.toUpperCase();
      const meta = bySymbol.get(key);
      return {
        symbol: sym,
        name: meta?.name || sym,
        logo: meta?.logo || FALLBACK_LOGOS[key] || "",
      };
    });
  }, [tokens, currencies]);

  // Send is restricted for now: only the network's native token can be sent
  // (DOT on Polkadot, KSM on Kusama). On Polkadot you may send to any token
  // except KSM; on Kusama only KSM→KSM. Cross-chain DOT↔KSM and KSM→other are
  // disabled until the asset-conversion + XCM path is wired up.
  const KUSAMA_LIVE_MESSAGE =
    "KSM > KSM, direction is currently live on Kusama Assethub";
  const POLKADOT_KSM_MESSAGE =
    "KSM support on Polkadot is coming soon, check back in a few days";

  const isPairAllowed = useCallback(
    (from: string, to: string) =>
      from === nativeToken &&
      (nativeToken === "KSM" ? to === "KSM" : to !== "KSM"),
    [nativeToken],
  );

  // The token lists stay complete enough that a user trying a disabled
  // direction gets an explicit toast instead of silently-empty options.
  const sourceTokens = useMemo(() => {
    if (selectedNetwork === "kusama") return tokenMeta;
    // Polkadot source is DOT; KSM stays selectable so we can show the
    // "coming soon" toast.
    return tokenMeta.filter((t) => t.symbol === "DOT" || t.symbol === "KSM");
  }, [tokenMeta, selectedNetwork]);

  const destTokens = tokenMeta;

  const handleTokenChange = (symbol: string, side: "from" | "to") => {
    if (selectedNetwork === "kusama") {
      if (symbol !== "KSM") {
        toast.warn(KUSAMA_LIVE_MESSAGE);
        return;
      }
    } else if (symbol === "KSM") {
      toast.error(POLKADOT_KSM_MESSAGE);
      return;
    }
    if (side === "from") setFromToken(symbol);
    else setToToken(symbol);
  };

  // Estimated arrival amount from the proxy exchange rate.
  const fetchEstimate = useCallback(async () => {
    if (!amount || !fromToken || !toToken) return;
    setIsEstimating(true);
    try {
      const fromCcy = fromToken === "DOT" ? "DOTAH" : fromToken;
      const toCcy = toToken === "DOT" ? "DOTAH" : toToken;
      const res = await fetch(`${SWAP_API_BASE}/exchange_rate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fromCcy,
          toCcy,
          amount: parseFloat(amount),
        }),
      });
      const data = await res.json();
      const api = data?.response;
      if (data?.status === "good" && api?.code === 0) {
        setEstimate({
          toAmount: api.data.to.amount,
          rate: api.data.to.rate,
          usd: api.data.to.usd,
        });
      } else if (fromToken === toToken) {
        setEstimate({ toAmount: amount, rate: "1" });
      } else {
        setEstimate(null);
      }
    } catch {
      setEstimate(
        fromToken === toToken ? { toAmount: amount, rate: "1" } : null,
      );
    } finally {
      setIsEstimating(false);
    }
  }, [amount, fromToken, toToken]);

  useEffect(() => {
    const t = setTimeout(fetchEstimate, 400);
    return () => clearTimeout(t);
  }, [fetchEstimate]);

  // Same-token native send: fee = deposit + withdraw gas costs.
  useEffect(() => {
    const isSameNative =
      fromToken === toToken && (fromToken === "DOT" || fromToken === "KSM");
    if (!isSameNative || !rpcEndpoint) {
      setGasFee(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const resp = await fetch(rpcEndpoint, {
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
        const gasPrice = BigInt(json.result);
        const units = GAS_UNITS[selectedNetwork] || {
          deposit: 200000n,
          withdraw: 400000n,
        };
        const total = (units.deposit + units.withdraw) * gasPrice;
        const whole = total / 10n ** 18n;
        const frac = (total % 10n ** 18n)
          .toString()
          .padStart(18, "0")
          .replace(/0+$/, "");
        if (!cancelled) setGasFee(frac ? `${whole}.${frac}` : `${whole}`);
      } catch {
        if (!cancelled) setGasFee(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fromToken, toToken, selectedNetwork, rpcEndpoint]);

  const route = useMemo(() => {
    if (fromToken === toToken) return "deposit_withdraw";
    if (fromToken !== "DOT" && fromToken !== "KSM")
      return "swap_deposit_withdraw";
    return "withdraw_swap_forward";
  }, [fromToken, toToken]);

  // Poll the proxy for the queued withdrawal status.
  useEffect(() => {
    if (!withdrawalId) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await fetch(
          `${SWAP_API_BASE}/shielded-status/${withdrawalId}`,
        );
        const data = await res.json();
        if (!cancelled) setBatchStatus(data);
      } catch {
        /* ignore */
      }
    };
    poll();
    const id = setInterval(poll, 5000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [withdrawalId]);

  const handleUseMyAddress = () => {
    const addr = polkadotAddress || evmAddress;
    if (!addr) {
      toast.error("Connect a wallet first");
      onConnectRequest();
      return;
    }
    setRecipient(addr);
  };

  const handleSend = async () => {
    if (!isMainnet) {
      toast.error("Send is only available on mainnet");
      return;
    }
    if (!amount || parseFloat(amount) <= 0) {
      toast.error("Enter an amount");
      return;
    }
    if (!recipient.trim()) {
      toast.error("Enter a recipient address");
      return;
    }
    if (!polkadotAddress && !evmAddress) {
      toast.error("Connect a wallet first");
      onConnectRequest();
      return;
    }
    if (!isPairAllowed(fromToken, toToken)) {
      toast.error(
        selectedNetwork === "kusama"
          ? KUSAMA_LIVE_MESSAGE
          : POLKADOT_KSM_MESSAGE,
      );
      return;
    }

    setIsSending(true);
    setWithdrawalId(null);
    setBatchStatus(null);
    try {
      const destinationAddress = recipient.trim();
      let body: Record<string, any>;
      if (route === "deposit_withdraw") {
        // Same-token: deposit into the pool from the connected wallet first
        // (same flow as the Shield tab), then queue only the withdrawal so the
        // proxy can broadcast it in a privacy batch.
        toast.info(`Shielding ${amount} ${fromToken}...`, {
          position: "top-right",
          autoClose: 6000,
          theme: "dark",
        });
        const secret = await onShieldForSend(amount, fromToken);
        // Use the same parseDotAmount the shield handlers use so the commitment
        // amount matches the deposited leaf exactly (avoid float drift).
        const { amountWei } = parseDotAmount(amount, selectedNetwork);
        body = {
          action: "queue_withdraw",
          source_network: selectedNetwork,
          destination_address: destinationAddress,
          secret,
          amount_wei: amountWei.toString(),
          asset_id: 0,
        };
      } else {
        body = {
          action: route,
          source_network: selectedNetwork,
          amount: parseFloat(amount),
          destination_address: destinationAddress,
          from_token: fromToken,
          to_token: toToken,
          destination_network:
            toToken === "DOT"
              ? "polkadot"
              : toToken === "KSM"
                ? "kusama"
                : selectedNetwork,
        };
      }

      toast.info(`Preparing private send (${route})...`, {
        position: "top-right",
        autoClose: 6000,
        theme: "dark",
      });

      const res = await fetch(`${SWAP_API_BASE}/shielded-swap`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();

      if (data?.error) {
        throw new Error(data.error);
      }
      const wid =
        data?.withdrawal_id || data?.stages?.withdraw?.withdrawal_id || null;
      setWithdrawalId(wid);
      setBatchStatus(wid ? { status: "queued" } : null);
      setAmount("");
      setRecipient("");
      toast.info(
        "Shielded transaction sent, it will take up to 3 minutes for it to be processed",
        {
          position: "top-right",
          autoClose: 8000,
          theme: "dark",
        },
      );
    } catch (err: any) {
      console.error("Send failed:", err);
      toast.error(`Send failed: ${err?.message || String(err)}`, {
        position: "top-right",
        autoClose: 8000,
        theme: "dark",
      });
    } finally {
      setIsSending(false);
    }
  };

  const isSameNative =
    fromToken === toToken && (fromToken === "DOT" || fromToken === "KSM");
  const youGet =
    isSameNative && gasFee && amount
      ? Math.max(0, parseFloat(amount) - parseFloat(gasFee)).toFixed(6)
      : estimate?.toAmount;

  return (
    <div className="send-tab">
      <p className="send-intro">
        Send privately to any address. Unstoppable privacy for less then 0.6% tx
        fee
      </p>

      <div className="send-row">
        <label>You send</label>
        <div className="send-inline">
          <input
            type="number"
            min="0"
            step="0.0001"
            placeholder="0.0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          <TokenDropdown
            value={fromToken}
            onChange={(s) => handleTokenChange(s, "from")}
            tokens={sourceTokens}
          />
        </div>
      </div>

      <div className="send-row">
        <label>Recipient gets</label>
        <div className="send-inline">
          <input
            type="text"
            placeholder={`Recipient address (${toToken})`}
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
            className="send-recipient"
          />
          <button
            type="button"
            className="send-my-address"
            onClick={handleUseMyAddress}
            title="Use my connected wallet address"
          >
            My address
          </button>
          <TokenDropdown
            value={toToken}
            onChange={(s) => handleTokenChange(s, "to")}
            tokens={destTokens}
          />
        </div>
      </div>

      {isSameNative && (
        <p className="send-note">
          {fromToken} is shielded automatically from your wallet, then the
          withdrawal is queued so it goes out with other transfers (privacy
          batching).
        </p>
      )}

      <div className="send-meta">
        {isEstimating && <span>estimating...</span>}
        {!isEstimating && youGet && (
          <span>
            You get: ~{youGet} {toToken}
          </span>
        )}
        {isSameNative && gasFee && (
          <span>
            Fee: {gasFee} {fromToken} (deposit + withdraw gas)
          </span>
        )}
        {!isSameNative && estimate?.rate && <span>Rate: {estimate.rate}</span>}
        {!isSameNative && estimate?.usd && <span>≈ ${estimate.usd}</span>}
      </div>

      <button
        className={`swap-button ${isSending ? "loading" : ""}`}
        onClick={handleSend}
        disabled={isSending}
      >
        {isSending ? "Sending..." : `Send ${fromToken}`}
      </button>

      {route !== "deposit_withdraw" && (
        <p className="send-note">
          {route === "swap_deposit_withdraw"
            ? `Your ${fromToken} is swapped to ${nativeToken}, shielded, and the withdrawal is queued so it goes out with other transfers (privacy batching).`
            : `${nativeToken} is shielded, then withdrawn, swapped to ${toToken} and forwarded to the recipient.`}
        </p>
      )}

      {batchStatus && (
        <div className="send-batch-status">
          Batch status: <strong>{batchStatus.status}</strong>
          {batchStatus.batch_wait_seconds
            ? ` · window ${batchStatus.batch_wait_seconds}s`
            : ""}
          {batchStatus.tx_hash ? ` · tx ${batchStatus.tx_hash}` : ""}
        </div>
      )}
    </div>
  );
}
