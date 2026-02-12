/*
 * Copyright 2025 Kusama Shield Developers on behalf of the Kusama DAO, see LICENSE in main folder.
 *
 * Client-side wrapper for the snarkjs Web Worker.
 * Uses Comlink.wrap() with Vite's native worker support.
 */

import * as Comlink from "comlink";
import type { SnarkWorkerApi } from "./snarkjs-worker";

const rawWorker = new Worker(
  new URL("./snarkjs-worker", import.meta.url),
  { type: "module" },
);

const worker = Comlink.wrap<SnarkWorkerApi>(rawWorker);

export default worker;
