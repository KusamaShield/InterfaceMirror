/*
 * Copyright 2025 Kusama Shield Developers on behalf of the Kusama DAO, see LICENSE in main folder.
 *
 * Global WebSocket shim. Installed as the very first app import (see main.tsx)
 * so that `@polkadot/x-ws` captures it before `@polkadot/api` is evaluated.
 *
 * When the Nym privacy mode is active, WebSocket URLs that target Polkadot RPC
 * hosts are tunnelled through the Nym mixnet via `mixWebSocket`. Everything else
 * (WalletConnect relay, smoldot, etc.) is delegated to the native WebSocket.
 */

import {
  isNymWsProxyable,
  openNymWebSocket,
  type NymWebSocketHandle,
} from "./privacyProxy";

const NativeWebSocket: typeof WebSocket =
  typeof globalThis.WebSocket !== "undefined"
    ? globalThis.WebSocket
    : (undefined as unknown as typeof WebSocket);

type Listener = (ev: any) => void;

export class NymAwareWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  readonly CONNECTING = 0;
  readonly OPEN = 1;
  readonly CLOSING = 2;
  readonly CLOSED = 3;

  readonly url: string;
  readonly protocol: string = "";
  readonly extensions: string = "";
  binaryType: BinaryType = "blob";
  bufferedAmount: number = 0;
  readyState: number = NymAwareWebSocket.CONNECTING;

  onopen: ((ev: any) => void) | null = null;
  onmessage: ((ev: any) => void) | null = null;
  onerror: ((ev: any) => void) | null = null;
  onclose: ((ev: any) => void) | null = null;

  private _native: WebSocket | null = null;
  private _nym: NymWebSocketHandle | null = null;
  private _nymOpen = false;
  private _queue: (string | Uint8Array | ArrayBuffer)[] = [];
  private _listeners: Record<string, Set<Listener>> = {};

  constructor(url: string | URL, protocols?: string | string[]) {
    this.url = typeof url === "string" ? url : url.href;

    if (NativeWebSocket && isNymWsProxyable(this.url)) {
      this._connectNym(protocols);
    } else {
      this._connectNative(url, protocols);
    }
  }

  private _connectNative(url: string | URL, protocols?: string | string[]) {
    const ws = new NativeWebSocket(url, protocols as any);
    this._native = ws;
    ws.onopen = (ev) => {
      this.readyState = NymAwareWebSocket.OPEN;
      this._emit("open", ev);
    };
    ws.onmessage = (ev) => {
      this._emit("message", ev);
    };
    ws.onerror = (ev) => {
      this._emit("error", ev);
    };
    ws.onclose = (ev) => {
      this.readyState = NymAwareWebSocket.CLOSED;
      this._emit("close", ev);
    };
  }

  private async _connectNym(protocols?: string | string[]) {
    const protoList = protocols
      ? Array.isArray(protocols)
        ? protocols
        : [protocols]
      : undefined;
    try {
      const socket = await openNymWebSocket(this.url, protoList, {
        onopen: () => {
          this._nymOpen = true;
          this.readyState = NymAwareWebSocket.OPEN;
          this._emit("open", { type: "open" });
          this._flushQueue();
        },
        onmessage: (data) => {
          this._emit("message", { type: "message", data });
        },
        onclose: (code, reason) => {
          this.readyState = NymAwareWebSocket.CLOSED;
          this._emit("close", {
            type: "close",
            code: code ?? 1000,
            reason: reason ?? "",
            wasClean: true,
          });
        },
        onerror: (err: any) => {
          this._emit("error", {
            type: "error",
            message: String(err?.message ?? err),
          });
        },
      });
      this._nym = socket;
      this._flushQueue();
    } catch (err: any) {
      this.readyState = NymAwareWebSocket.CLOSED;
      this._emit("error", { type: "error", message: String(err?.message ?? err) });
      this._emit("close", {
        type: "close",
        code: 1006,
        reason: "nym websocket connect failed",
        wasClean: false,
      });
    }
  }

  private _flushQueue() {
    if (!this._nym || !this._nymOpen || this._queue.length === 0) return;
    const pending = this._queue;
    this._queue = [];
    for (const data of pending) this._nym.send(data);
  }

  send(data: string | ArrayBufferLike | Blob | ArrayBufferView): void {
    if (this._native) {
      this._native.send(data as any);
      return;
    }
    if (data instanceof Blob) {
      data.arrayBuffer().then((buf) => this.send(buf));
      return;
    }
    if (ArrayBuffer.isView(data)) {
      const view = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
      this._sendOrQueue(view);
      return;
    }
    this._sendOrQueue(data as string | ArrayBuffer);
  }

  private _sendOrQueue(data: string | Uint8Array | ArrayBuffer) {
    if (this._nym && this._nymOpen) {
      this._nym.send(data);
    } else {
      this._queue.push(data);
    }
  }

  close(code?: number, reason?: string): void {
    this.readyState = NymAwareWebSocket.CLOSING;
    if (this._native) {
      this._native.close(code, reason);
      return;
    }
    if (this._nym) {
      this._nym.close(code ?? 1000, reason ?? "");
    }
    this.readyState = NymAwareWebSocket.CLOSED;
  }

  addEventListener(type: string, listener: Listener): void {
    if (this._native) {
      this._native.addEventListener(type, listener as EventListener);
      return;
    }
    (this._listeners[type] ||= new Set()).add(listener);
  }

  removeEventListener(type: string, listener: Listener): void {
    if (this._native) {
      this._native.removeEventListener(type, listener as EventListener);
      return;
    }
    this._listeners[type]?.delete(listener);
  }

  dispatchEvent(event: any): boolean {
    if (this._native) return this._native.dispatchEvent(event);
    this._emit(event?.type, event);
    return true;
  }

  private _emit(type: string, ev: any) {
    const handler = (this as any)[`on${type}`];
    if (typeof handler === "function") {
      try {
        handler.call(this, ev);
      } catch (err) {
        console.error(`[wsShim] on${type} handler threw:`, err);
      }
    }
    const listeners = this._listeners[type];
    if (listeners) {
      for (const l of listeners) {
        try {
          l.call(this, ev);
        } catch (err) {
          console.error(`[wsShim] ${type} listener threw:`, err);
        }
      }
    }
  }
}

export function installWebSocketShim(): void {
  if (!NativeWebSocket) return;
  (globalThis as any).WebSocket = NymAwareWebSocket;
  if (typeof window !== "undefined") {
    (window as any).WebSocket = NymAwareWebSocket;
  }
}

/**
 * Verify that `@polkadot/x-ws` captured the shim at module-eval time (it does
 * `export const WebSocket = xglobal.WebSocket`). If this returns false, the
 * shim was installed too late and Polkadot WSS will not be tunnelled.
 */
export async function isPolkadotUsingShim(): Promise<boolean> {
  try {
    const mod: any = await import("@polkadot/x-ws");
    return mod?.WebSocket === NymAwareWebSocket;
  } catch {
    return false;
  }
}

// Install immediately on import so @polkadot/x-ws captures the shim.
installWebSocketShim();

export default NymAwareWebSocket;
