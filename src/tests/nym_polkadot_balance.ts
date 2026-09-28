/*
 * Copyright 2025 Kusama Shield Developers on behalf of the Kusama DAO, see LICENSE in main folder.
 *
 * Browser-run test: query a Polkadot/Kusama AssetHub account balance through the
 * Nym mixnet WebSocket shim.
 *
 * Nym is WASM + a Web Worker, so this CANNOT run under `tsx`/Node. It must be
 * executed in a browser served by Vite. Two ways:
 *
 *   1. Open http://localhost:5173/nym-test.html (see nym-test.html in repo root).
 *   2. Or in the running app's DevTools console:
 *        const m = await import("/src/tests/nym_polkadot_balance.ts");
 *        await m.runNymBalanceTest();
 *
 * It reports: raw Nym WebSocket lifecycle (open/message/close) and a real
 * `api.query.system.account` balance over the shimmed WsProvider.
 */

// Install the WebSocket shim BEFORE @polkadot/api is evaluated, so
// @polkadot/x-ws captures it (same requirement as src/main.tsx).
import "../services/wsShim";

import { ApiPromise, WsProvider } from "@polkadot/api";
import {
  connectNym,
  getPrivacyState,
  isNymWsProxyable,
  openNymWebSocket,
} from "../services/privacyProxy";
import { isPolkadotUsingShim, NymAwareWebSocket } from "../services/wsShim";
import { getCachedMetadata, cacheApiMetadata, whenMetadataCacheReady } from "../transactions/revivePolkadot";

const DEFAULT_WS = "wss://kusama-asset-hub-rpc.polkadot.io";
const DEFAULT_ADDRESS = "5Dxr9EoL7ChvxPJAsQ8gZe1Dfbwh9AEeDmB3KpbCrihLU85u";

export interface NymTestResult {
  privacy: unknown;
  usingShim: boolean;
  nymWsProxyable: boolean;
  metadataKeysAtStart?: string[];
  rawWs: string[];
  shimWs?: string[];
  balance?: { chain: string; block: string; free: string; reserved: string; connectMs: number };
  balanceCached?: { chain: string; block: string; free: string; reserved: string; connectMs: number };
  error?: string;
}

function log(...args: unknown[]) {
  // eslint-disable-next-line no-console
  console.log("[nym-test]", ...args);
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms),
    ),
  ]);
}

/**
 * Raw lifecycle probe: open a mixnet WebSocket and send one JSON-RPC request.
 * This is what isolates "does Nym WSS to the RPC work at all" from
 * "@polkadot/api can use it".
 */
async function testRawNymWebSocket(url: string): Promise<string[]> {
  const events: string[] = [];
  log("raw: opening Nym WS ->", url);
  return new Promise<string[]>((resolve) => {
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      resolve(events);
    };

    openNymWebSocket(url, undefined, {
      onopen: () => {
        events.push("open");
        log("raw: onopen");
      },
      onmessage: (data) => {
        const text =
          typeof data === "string" ? data : new TextDecoder().decode(data);
        events.push(`message:${text.slice(0, 240)}`);
        log("raw: onmessage", text.slice(0, 240));
        // One response is enough for this probe.
        if (text.includes('"result"') || text.includes('"error"')) done();
      },
      onclose: (code, reason) => {
        events.push(`close:${code ?? "?"}:${reason ?? ""}`);
        log("raw: onclose", code, reason);
        done();
      },
      onerror: (err) => {
        events.push(`error:${String(err)}`);
        log("raw: onerror", err);
        done();
      },
    })
      .then((handle) => {
        log("raw: handle ready -> sending system_chain");
        handle.send(
          JSON.stringify({ jsonrpc: "2.0", id: 1, method: "system_chain", params: [] }),
        );
      })
      .catch((err) => {
        events.push(`open-failed:${String(err)}`);
        log("raw: open failed", err);
        done();
      });

    setTimeout(() => {
      if (settled) return;
      events.push("timeout:45s");
      log("raw: timed out");
      done();
    }, 45000);
  });
}

/** Direct probe of the `NymAwareWebSocket` shim that @polkadot/x-ws uses. */
async function testShimWebSocket(url: string): Promise<string[]> {
  const events: string[] = [];
  log("shim: opening NymAwareWebSocket ->", url);
  return new Promise<string[]>((resolve) => {
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      resolve(events);
    };
    let ws: NymAwareWebSocket;
    try {
      ws = new NymAwareWebSocket(url);
    } catch (e) {
      events.push("ctor-error:" + String(e));
      log("shim: ctor error", e);
      return done();
    }
    ws.onopen = () => {
      events.push("open");
      log("shim: onopen -> send system_chain");
      ws.send(
        JSON.stringify({ jsonrpc: "2.0", id: 1, method: "system_chain", params: [] }),
      );
    };
    let msgCount = 0;
    ws.onmessage = (ev: any) => {
      const text =
        typeof ev?.data === "string"
          ? ev.data
          : new TextDecoder().decode(ev?.data);
      msgCount += 1;
      events.push(`msg#${msgCount} len=${text.length} head=${JSON.stringify(text.slice(0, 60))}`);
      log(`shim: onmessage #${msgCount} len=${text.length}`, text.slice(0, 60));
      try {
        const parsed = JSON.parse(text);
        if (parsed.id === 1) done();
      } catch {
        events.push("NON-JSON-CHUNK");
        log("shim: NON-JSON chunk (fragmented frame)");
      }
    };
    ws.onclose = (ev: any) => {
      events.push(`close:${ev?.code ?? "?"}:${ev?.reason ?? ""}`);
      log("shim: onclose", ev?.code, ev?.reason);
      done();
    };
    ws.onerror = (ev: any) => {
      events.push("error:" + JSON.stringify(ev));
      log("shim: onerror", ev);
      done();
    };
    setTimeout(() => {
      if (!settled) {
        events.push("timeout:15s");
        log("shim: timed out");
        done();
      }
    }, 15000);
  });
}

/** Log every frame the shim sends/receives, to trace the @polkadot/api init. */
function installWireLogging(): void {
  const proto: any = NymAwareWebSocket.prototype;
  if (proto.__wireLogged) return;
  proto.__wireLogged = true;
  const origSend = proto.send;
  proto.send = function (d: any) {
    try {
      const s = typeof d === "string" ? d : new TextDecoder().decode(d);
      log("OUT", s.slice(0, 160));
    } catch {
      log("OUT <binary>");
    }
    return origSend.call(this, d);
  };
  const origEmit = proto._emit;
  proto._emit = function (type: string, ev: any) {
    if (type === "message") {
      try {
        const s =
          typeof ev?.data === "string" ? ev.data : new TextDecoder().decode(ev?.data);
        log(`IN len=${s.length}`, s.slice(0, 160));
      } catch {
        log("IN <binary>");
      }
    } else if (type === "open" || type === "close" || type === "error") {
      log("EVT", type, ev?.code ?? "");
    }
    return origEmit.call(this, type, ev);
  };
}

/** Real @polkadot/api query over the (Nym-shimmed) WsProvider. */
async function testPolkadotApi(url: string, address: string, useCache = false) {
  log(
    "api: constructing WsProvider ->",
    url,
    "| isNymWsProxyable:",
    isNymWsProxyable(url),
    "| useCache:",
    useCache,
  );
  installWireLogging();
  const provider = new WsProvider(url);
  provider.on("connected", () => log("api: provider connected"));
  provider.on("disconnected", () => log("api: provider disconnected"));
  provider.on("error", (e: any) => log("api: provider error", e?.message || e));
  const t0 = Date.now();
  const api = await withTimeout(
    ApiPromise.create({
      provider,
      noInitWarn: true,
      metadata: useCache ? getCachedMetadata() : undefined,
    } as any),
    180000,
    "ApiPromise.create",
  );
  const connectMs = Date.now() - t0;
  cacheApiMetadata(api);
  try {
    const [chain, header, account] = await Promise.all([
      api.rpc.system.chain(),
      api.rpc.chain.getHeader(),
      api.query.system.account(address),
    ]);
    const data = (account as any).data;
    const result = {
      chain: chain.toString(),
      block: header.number.toString(),
      free: data.free.toString(),
      reserved: data.reserved.toString(),
      connectMs,
    };
    log(`api: OK (connect ${connectMs}ms)`, result);
    return result;
  } finally {
    await api.disconnect().catch(() => undefined);
  }
}

export async function runNymBalanceTest(
  wsUrl: string = DEFAULT_WS,
  address: string = DEFAULT_ADDRESS,
): Promise<NymTestResult> {
  const result: NymTestResult = {
    privacy: undefined,
    usingShim: false,
    nymWsProxyable: false,
    rawWs: [],
  };
  try {
    log("connecting to Nym mixnet...");
    await whenMetadataCacheReady();
    result.metadataKeysAtStart = Object.keys(getCachedMetadata());
    log("metadata cache at start:", result.metadataKeysAtStart);
    await withTimeout(connectNym(), 90000, "connectNym");
    result.privacy = getPrivacyState();
    result.usingShim = await isPolkadotUsingShim();
    result.nymWsProxyable = isNymWsProxyable(wsUrl);
    log("privacy state:", result.privacy, "| x-ws using shim:", result.usingShim);

    result.rawWs = await testRawNymWebSocket(wsUrl);
    result.shimWs = await testShimWebSocket(wsUrl);
    result.balance = await testPolkadotApi(wsUrl, address, false);
    // Second connect with the cached metadata should skip the ~1.3 MB fetch.
    result.balanceCached = await testPolkadotApi(wsUrl, address, true);
  } catch (err: any) {
    result.error = err?.message || String(err);
    log("ERROR:", result.error);
  }
  log("RESULT", JSON.stringify(result));
  return result;
}

declare global {
  interface Window {
    __NYM_TEST_RESULT__?: NymTestResult;
    __NYM_TEST_DONE__?: boolean;
  }
}

export default runNymBalanceTest;