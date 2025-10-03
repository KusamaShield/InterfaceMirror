/*
 * Copyright 2025 Kusama Shield Developers on behalf of the Kusama DAO, see LICENSE in main folder.
 */

import { initThreadPool, test_proofo, generate_proof_data } from '../pkg/generate_zk_wasm';

// Initialize the worker
async function init() {
    const th = navigator.hardwareConcurrency;
    console.log(`loading number of threads: `, th);
  await initThreadPool(navigator.hardwareConcurrency);
  return {
    test_proofo,
    generate_proof_data
  };
}

// Expose the init function to Comlink
const worker = {
  init
};

// Export for Comlink
export default worker;