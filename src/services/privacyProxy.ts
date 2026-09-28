/*
 * Copyright 2025 Kusama Shield Developers on behalf of the Kusama DAO, see LICENSE in main folder.
 *
 * Privacy proxy — routes EVM JSON-RPC requests through Tor (webtor-rs / Snowflake)
 * or the Nym mixnet (@nymproject/mix-fetch) when the user enables a privacy mode.
 *
 * Tor/Nym HTTP clients only speak HTTP(S), which is enough for EVM JSON-RPC.
 * Polkadot uses raw WebSockets, so WSS is handled separately: when Nym is active
 * the global WebSocket is wrapped (see wsShim.ts) and Nym WebSockets are tunnelled
 * through the mixnet via `mixWebSocket`. Tor cannot proxy WSS.
 */

export type PrivacyMode = "off" | "tor" | "nym";
export type PrivacyStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "error";

export interface PrivacyState {
  mode: PrivacyMode;
  status: PrivacyStatus;
  message: string;
}

type Listener = (state: PrivacyState) => void;

let mode: PrivacyMode = "off";
let status: PrivacyStatus = "disconnected";
let message = "";
const listeners = new Set<Listener>();

function emit() {
  const state: PrivacyState = { mode, status, message };
  listeners.forEach((cb) => cb(state));
}

function setState(next: Partial<PrivacyState>) {
  if (next.mode !== undefined) mode = next.mode;
  if (next.status !== undefined) status = next.status;
  if (next.message !== undefined) message = next.message;
  emit();
}

export function onPrivacyChange(cb: Listener): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function getPrivacyState(): PrivacyState {
  return { mode, status, message };
}

export function isPrivacyActive(): boolean {
  return mode !== "off" && status === "connected";
}

/** Nym is the only privacy mode that can tunnel Substrate/Polkadot WebSockets. */
export function isNymActive(): boolean {
  return mode === "nym" && status === "connected";
}

/**
 * Substrate WS init fetches ~1.3 MB of chain metadata, which over the Nym
 * mixnet can take 30–60s+. Widen RPC timeouts while Nym is active.
 */
export const NYM_RPC_TIMEOUT_MS = 180000;

export function rpcTimeoutMs(baseMs: number): number {
  return isNymActive() ? Math.max(baseMs, NYM_RPC_TIMEOUT_MS) : baseMs;
}

// ---------------------------------------------------------------------------
// Tor (webtor-rs WASM, Snowflake bridge)
// ---------------------------------------------------------------------------

let torModule: any = null;
let torClient: any = null;

const TOR_SNOWFLAKE_URL = "wss://snowflake.torproject.net/";

async function loadTorModule(): Promise<any> {
  if (torModule) return torModule;
  const mod = await import("../wasm/webtor-proxy/webtor_wasm.js");
  await mod.default();
  mod.init();
  torModule = mod;
  return mod;
}

export async function connectTor(): Promise<void> {
  if (torClient) {
    setState({ mode: "tor", status: "connected", message: "Tor already connected" });
    return;
  }
  setState({ mode: "tor", status: "connecting", message: "Loading Tor module..." });
  try {
    const mod = await loadTorModule();
    setState({ status: "connecting", message: "Connecting to Tor via Snowflake..." });
    const options = new mod.TorClientOptions(TOR_SNOWFLAKE_URL);
    torClient = await new mod.TorClient(options);
    setState({ status: "connecting", message: "Establishing Tor circuit..." });
    await torClient.waitForCircuit();
    let info = "Tor circuit established";
    try {
      const relays = await torClient.getCircuitRelays();
      if (Array.isArray(relays) && relays.length > 0) {
        info = relays.map((r: any) => `${r.role}: ${r.nickname}`).join(" -> ");
      }
    } catch {
      /* relay info is best-effort */
    }
    setState({ mode: "tor", status: "connected", message: info });
  } catch (err: any) {
    torClient = null;
    setState({
      mode: "off",
      status: "error",
      message: `Tor connection failed: ${err?.message || String(err)}`,
    });
    throw err;
  }
}

async function closeTor(): Promise<void> {
  if (torClient) {
    try {
      await torClient.close();
    } catch {
      /* ignore */
    }
    torClient = null;
  }
}

async function torRequest(url: string, init?: RequestInit): Promise<Response> {
  if (!torClient) throw new Error("Tor client is not connected");
  const method = (init?.method || "GET").toUpperCase();
  const headers = normalizeHeaders(init?.headers);
  const body = init?.body ? await toUint8Array(init.body) : null;
  const resp = await torClient.request(method, url, headers, body, null);
  return new Response(resp.body as unknown as BodyInit, {
    status: resp.status,
    headers: new Headers(resp.headers || {}),
  });
}

// ---------------------------------------------------------------------------
// Nym mixnet (@nymproject/mix-fetch)
// ---------------------------------------------------------------------------

let nymReady = false;

export async function connectNym(): Promise<void> {
  if (nymReady) {
    setState({ mode: "nym", status: "connected", message: "Nym already connected" });
    return;
  }
  setState({ mode: "nym", status: "connecting", message: "Connecting to Nym mixnet..." });
  try {
    const { setupMixTunnel } = await import("@nymproject/mix-fetch");
    await setupMixTunnel({});
    nymReady = true;
    setState({ mode: "nym", status: "connected", message: "Nym mixnet tunnel established" });
  } catch (err: any) {
    nymReady = false;
    setState({
      mode: "off",
      status: "error",
      message: `Nym connection failed: ${err?.message || String(err)}`,
    });
    throw err;
  }
}

async function closeNym(): Promise<void> {
  // NOTE: the Nym tunnel is a singleton and, per the SDK, becomes unusable
  // after `disconnectMixTunnel()` until a full page reload. We therefore only
  // mark it inactive here and leave the tunnel up so it can be re-enabled.
  nymReady = false;
}

async function nymRequest(url: string, init?: RequestInit): Promise<Response> {
  const { mixFetch } = await import("@nymproject/mix-fetch");
  return mixFetch(url, init);
}

export interface NymWebSocketHandlers {
  onopen?: () => void;
  onmessage?: (data: string | Uint8Array) => void;
  onclose?: (code?: number, reason?: string) => void;
  onerror?: (err: unknown) => void;
}

export interface NymWebSocketHandle {
  send: (data: string | Uint8Array | ArrayBuffer) => void;
  close: (code?: number, reason?: string) => void;
}

/**
 * Open a WebSocket through the Nym mixnet. Requires the tunnel to be set up
 * (see `enableNym`). Resolves once the worker handle is allocated; events are
 * delivered through the supplied handlers.
 */
export async function openNymWebSocket(
  url: string,
  protocols: string[] | undefined,
  handlers: NymWebSocketHandlers,
): Promise<NymWebSocketHandle> {
  const { getMixTunnel, proxy } = await import("@nymproject/mix-tunnel");
  const tunnel: any = await getMixTunnel();

  const onEvent = (handleId: number, type: string, data: unknown) => {
    switch (type) {
      case "open":
        handlers.onopen?.();
        break;
      case "text":
        handlers.onmessage?.(data as string);
        break;
      case "binary":
        handlers.onmessage?.(data as Uint8Array);
        break;
      case "close": {
        const ev: any = data;
        handlers.onclose?.(
          typeof ev === "number" ? ev : ev?.code,
          typeof ev === "object" && ev ? ev?.reason : undefined,
        );
        break;
      }
      case "error":
        handlers.onerror?.(data);
        break;
    }
  };

  const handleId = await tunnel.mixWebSocket(url, protocols, proxy(onEvent));

  return {
    send: (data) => {
      try {
        const p = tunnel.wsSend(handleId, data);
        if (p && typeof p.catch === "function") {
          p.catch((err: unknown) => handlers.onerror?.(err));
        }
      } catch (err) {
        handlers.onerror?.(err);
      }
    },
    close: (code = 1000, reason = "") => {
      try {
        const p = tunnel.wsClose(handleId, code, reason);
        if (p && typeof p.catch === "function") p.catch(() => undefined);
      } catch {
        /* ignore */
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Mode control
// ---------------------------------------------------------------------------

export async function enableTor(): Promise<void> {
  if (mode === "nym") await closeNym();
  await connectTor();
}

export async function enableNym(): Promise<void> {
  if (mode === "tor") await closeTor();
  await connectNym();
}

export async function disablePrivacy(): Promise<void> {
  await closeTor();
  await closeNym();
  setState({ mode: "off", status: "disconnected", message: "Disconnected" });
}

// ---------------------------------------------------------------------------
// Request routing + global fetch interception
// ---------------------------------------------------------------------------

// Known EVM RPC hosts used across the app (App.tsx NETWORKS + wagmi chains).
const RPC_HOST_HINTS = [
  "laissez-faire.trade",
  "eth-rpc.polkadot.io",
  "eth-rpc-kusama.polkadot.io",
  "polkadot-assethub-rpc",
  "kusama-rpc",
  "dotters.network",
  "public.curie.radiumblock.co",
  "evm.shibuya.astar.network",
  "mainnet.base.org",
  "rpc.moonriver.moonbeam.network",
  "westend-asset-hub-eth-rpc",
  "polkadothub-rpc.com",
];

function bodyLooksLikeJsonRpc(body: BodyInit | null | undefined): boolean {
  if (body == null) return false;
  if (typeof body === "string") return body.includes('"jsonrpc"');
  if (body instanceof Uint8Array) {
    try {
      return new TextDecoder().decode(body).includes('"jsonrpc"');
    } catch {
      return false;
    }
  }
  if (body instanceof ArrayBuffer) {
    try {
      return new TextDecoder().decode(new Uint8Array(body)).includes('"jsonrpc"');
    } catch {
      return false;
    }
  }
  return false;
}

function isProxyableRequest(input: RequestInfo | URL, init?: RequestInit): boolean {
  const url =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input.url;
  if (!url || !/^https?:\/\//i.test(url)) return false;
  // Never proxy our own backend endpoints (proxy/swap/mail) — those are not RPC.
  if (url.includes("/api/")) return false;
  if (RPC_HOST_HINTS.some((h) => url.includes(h))) return true;
  // Any JSON-RPC payload, regardless of host (covers custom/self-hosted RPC).
  return bodyLooksLikeJsonRpc(init?.body);
}

// Known Polkadot/Substrate WebSocket RPC hosts (App.tsx NETWORKS wsEndpoints
// + @polkadot/api failover lists + revivePolkadot POLKADOT_WS_RPCS).
const RPC_WS_HOST_HINTS = [
  "laissez-faire.trade",
  "dwellir.com",
  "polkadot.io",
  "gatotech.network",
  "helixstreet.io",
  "luckyfriday.io",
  "onfinality.io",
  "stakeworld.io",
  "dotters.network",
  "blastapi.io",
  "ibp.network",
  "statemint",
];

/**
 * Whether a WebSocket URL should be tunnelled through Nym. Only used while the
 * Nym privacy mode is active; Tor cannot proxy WebSockets.
 */
export function isNymWsProxyable(url: string): boolean {
  if (mode !== "nym" || status !== "connected") return false;
  if (!/^wss?:\/\//i.test(url)) return false;
  return RPC_WS_HOST_HINTS.some((h) => url.includes(h));
}

/**
 * Build a RequestInit that is safe to hand to the Tor/Nym workers.
 *
 * `fetch` callers (notably ethers' JsonRpcProvider) pass a `Headers` instance
 * and an `AbortSignal`. Neither is structured-cloneable, so forwarding them to
 * a worker via postMessage throws `DataCloneError: ... could not be cloned`.
 * Flatten headers to a plain object, drop the signal, and keep only body types
 * the worker can clone.
 */
async function buildCloneableInit(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<RequestInit> {
  const source: RequestInit = { ...init };
  if (input instanceof Request) {
    source.method = source.method || input.method;
    if (!source.headers && input.headers) source.headers = input.headers;
    if (source.body == null) {
      try {
        const text = await input.clone().text();
        if (text) source.body = text;
      } catch {
        /* body not readable (already consumed/streamed) */
      }
    }
  }

  const out: RequestInit = {};
  if (source.method) out.method = source.method;

  const headers = normalizeHeaders(source.headers);
  if (Object.keys(headers).length > 0) out.headers = headers;

  const body = source.body;
  if (body != null) {
    if (
      typeof body === "string" ||
      body instanceof Uint8Array ||
      body instanceof ArrayBuffer ||
      body instanceof Blob
    ) {
      out.body = body;
    } else if (ArrayBuffer.isView(body)) {
      out.body = new Uint8Array(body.buffer, body.byteOffset, body.byteLength);
    } else {
      out.body = String(body);
    }
  }

  // AbortSignal is intentionally omitted — mix-tunnel/webtor cannot clone it.
  return out;
}

async function proxyRequest(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input.url;
  const merged = await buildCloneableInit(input, init);
  if (mode === "tor") return torRequest(url, merged);
  if (mode === "nym") return nymRequest(url, merged);
  throw new Error("No privacy mode active");
}

let interceptorInstalled = false;
let intercepting = false;

export function installFetchInterceptor(): void {
  if (interceptorInstalled) return;
  interceptorInstalled = true;
  const originalFetch = globalThis.fetch.bind(globalThis);
  globalThis.fetch = async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    if (!intercepting && isPrivacyActive() && isProxyableRequest(input, init)) {
      intercepting = true;
      try {
        return await proxyRequest(input, init);
      } catch (err) {
        console.error("[privacyProxy] proxied request failed:", err);
        throw err;
      } finally {
        intercepting = false;
      }
    }
    return originalFetch(input, init);
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalizeHeaders(headers?: HeadersInit): Record<string, string> {
  const out: Record<string, string> = {};
  if (!headers) return out;
  if (headers instanceof Headers) {
    headers.forEach((v, k) => {
      out[k] = v;
    });
  } else if (Array.isArray(headers)) {
    for (const [k, v] of headers) out[k] = v;
  } else {
    Object.assign(out, headers);
  }
  return out;
}

async function toUint8Array(body: BodyInit): Promise<Uint8Array> {
  if (typeof body === "string") return new TextEncoder().encode(body);
  if (body instanceof Uint8Array) return body;
  if (body instanceof ArrayBuffer) return new Uint8Array(body);
  if (ArrayBuffer.isView(body)) {
    return new Uint8Array(body.buffer, body.byteOffset, body.byteLength);
  }
  if (body instanceof Blob) return new Uint8Array(await body.arrayBuffer());
  return new TextEncoder().encode(String(body));
}
