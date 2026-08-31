/*
 * Copyright 2025 Kusama Shield Developers on behalf of the Kusama DAO, see LICENSE in main folder.
 *
 * Client-side wrapper for the snarkjs Web Worker.
 * Uses Comlink.wrap() with Vite's native worker support.
 *
 * The worker is created LAZILY on first use (not at import time) so that
 * importing this module does not spawn a worker or pull in the full snarkjs
 * bundle at app startup. The heavy worker is only initialized when a proof
 * is actually generated.
 */

import * as Comlink from "comlink";
import type { SnarkWorkerApi } from "./snarkjs-worker";

let workerPromise: Promise<SnarkWorkerApi> | null = null;

function getWorker(): Promise<SnarkWorkerApi> {
  if (!workerPromise) {
    workerPromise = (async () => {
      const rawWorker = new Worker(
        new URL("./snarkjs-worker", import.meta.url),
        { type: "module" },
      );
      return Comlink.wrap<SnarkWorkerApi>(rawWorker);
    })();
  }
  return workerPromise;
}

/**
 * Lazily-created proxy that transparently initializes the worker on first
 * method call. Call sites keep using `worker.someMethod(...)` unchanged.
 */
const worker = new Proxy({} as SnarkWorkerApi, {
  get(_target, prop) {
    return async (...args: any[]) => {
      const w = await getWorker();
      return (w as any)[prop](...args);
    };
  },
});

export default worker;
