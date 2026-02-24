/*
 * Tor Service - manages Tor circuit lifecycle via webtor-rs WASM module.
 * Uses Snowflake WebRTC to establish Tor circuits and proxies HTTP requests.
 */

// Types for the webtor WASM module (will be available after wasm-pack build)
interface TorClientOptions {
  snowflakeWebRtc(): TorClientOptions;
  withCircuitTimeout(ms: number): TorClientOptions;
  withCreateCircuitEarly(early: boolean): TorClientOptions;
}

interface JsHttpResponse {
  status: number;
  headers: Record<string, string>;
  body: Uint8Array;
  url: string;
  text(): string;
  json(): any;
}

interface JsCircuitStatus {
  total_circuits: number;
  ready_circuits: number;
  creating_circuits: number;
  failed_circuits: number;
  has_ready_circuits: boolean;
  is_healthy: boolean;
}

interface TorClientInstance {
  fetch(url: string): Promise<JsHttpResponse>;
  post(url: string, body: Uint8Array): Promise<JsHttpResponse>;
  postJson(url: string, jsonBody: string): Promise<JsHttpResponse>;
  request(method: string, url: string, headers: Record<string, string>, body: Uint8Array | null, timeoutMs: number | null): Promise<JsHttpResponse>;
  waitForCircuit(): Promise<void>;
  updateCircuit(deadlineMs: number): Promise<void>;
  getCircuitStatus(): Promise<JsCircuitStatus>;
  getCircuitStatusString(): Promise<string>;
  getCircuitRelays(): Promise<Array<{ role: string; nickname: string; address: string; fingerprint: string }> | null>;
  close(): Promise<void>;
  abort(): void;
  isAborted(): boolean;
}

interface WebTorModule {
  default: () => Promise<void>; // init wasm
  init: () => void;
  TorClientOptions: {
    snowflake(): any;
    snowflakeWebRtc(): any;
    new(snowflakeUrl: string): any;
  };
  TorClient: {
    new(options: any): Promise<TorClientInstance>;
  };
  setLogCallback: (fn: (level: string, target: string, message: string) => void) => void;
  setDebugEnabled: (enabled: boolean) => void;
}

export type TorStatus = "disconnected" | "loading_wasm" | "creating_circuit" | "connected" | "error";

export type TorStatusCallback = (status: TorStatus, message?: string) => void;

let torClient: TorClientInstance | null = null;
let currentStatus: TorStatus = "disconnected";
let statusListeners: TorStatusCallback[] = [];
let wasmModule: WebTorModule | null = null;

function notifyStatus(status: TorStatus, message?: string) {
  currentStatus = status;
  for (const listener of statusListeners) {
    listener(status, message);
  }
}

export function onTorStatusChange(callback: TorStatusCallback): () => void {
  statusListeners.push(callback);
  return () => {
    statusListeners = statusListeners.filter((cb) => cb !== callback);
  };
}

export function getTorStatus(): TorStatus {
  return currentStatus;
}

export function isTorConnected(): boolean {
  return currentStatus === "connected" && torClient !== null;
}

async function loadWasmModule(): Promise<WebTorModule> {
  if (wasmModule) return wasmModule;

  // Dynamic import from the webtor-wasm pkg directory (built by wasm-pack)
  const mod = await import(/* @vite-ignore */ "../../webtor-rs/webtor-wasm/pkg/webtor_wasm.js");
  // Initialize the WASM module, pointing to the .wasm in public/
  await mod.default('/webtor_wasm_bg.wasm');
  mod.init();
  wasmModule = mod as unknown as WebTorModule;
  return wasmModule;
}

export async function connectTor(logCallback?: (level: string, target: string, message: string) => void): Promise<void> {
  if (torClient) {
    notifyStatus("connected", "Already connected to Tor");
    return;
  }

  try {
    // Step 1: Load WASM
    notifyStatus("loading_wasm", "Loading Tor WASM module...");
    const mod = await loadWasmModule();

    // Set up log forwarding if callback provided
    if (logCallback) {
      mod.setLogCallback(logCallback);
    }

    // Step 2: Create Tor client with Snowflake WebSocket (direct connection)
    notifyStatus("creating_circuit", "Connecting to Tor network via Snowflake...");
    const options = mod.TorClientOptions.snowflake();
    torClient = await new mod.TorClient(options);

    // Step 3: Wait for circuit to be ready
    notifyStatus("creating_circuit", "Establishing Tor circuit...");
    await torClient.waitForCircuit();

    // Get relay info for display
    const relays = await torClient.getCircuitRelays();
    const relayNames = relays ? relays.map((r) => `${r.role}: ${r.nickname}`).join(" → ") : "";
    notifyStatus("connected", relayNames ? `Circuit: ${relayNames}` : "Tor circuit established");
  } catch (err: any) {
    torClient = null;
    const msg = err?.message || String(err);
    notifyStatus("error", `Tor connection failed: ${msg}`);
    throw err;
  }
}

export async function disconnectTor(): Promise<void> {
  if (torClient) {
    try {
      await torClient.close();
    } catch (_) {
      // Ignore close errors
    }
    torClient = null;
  }
  wasmModule = null;
  notifyStatus("disconnected", "Disconnected from Tor");
}

/**
 * Drop-in replacement for fetch() that routes through Tor when connected.
 * Falls back to regular fetch when Tor is not active.
 */
export async function torFetch(url: string, options?: RequestInit): Promise<Response> {
  if (!torClient || currentStatus !== "connected") {
    return fetch(url, options);
  }

  try {
    const method = (options?.method || "GET").toUpperCase();
    const body = options?.body ? String(options.body) : undefined;

    let torResponse: JsHttpResponse;

    if (method === "POST" && body) {
      // Check if it's JSON (for RPC calls)
      const contentType = options?.headers
        ? (options.headers as Record<string, string>)["Content-Type"] || ""
        : "";

      if (contentType.includes("application/json") || body.startsWith("{")) {
        torResponse = await torClient.postJson(url, body);
      } else {
        const encoder = new TextEncoder();
        torResponse = await torClient.post(url, encoder.encode(body));
      }
    } else {
      torResponse = await torClient.fetch(url);
    }

    // Convert to standard Response object
    const responseBody = torResponse.text();
    return new Response(responseBody, {
      status: torResponse.status,
      headers: torResponse.headers as unknown as HeadersInit,
    });
  } catch (err) {
    console.error("[Tor] Request failed, falling back to direct:", err);
    // Fallback to direct fetch on Tor error
    return fetch(url, options);
  }
}

/**
 * Get current circuit status info
 */
export async function getCircuitInfo(): Promise<string | null> {
  if (!torClient) return null;
  try {
    return await torClient.getCircuitStatusString();
  } catch {
    return null;
  }
}
