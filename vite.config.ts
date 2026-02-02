/*
 * Copyright 2025 Kusama Shield Developers on behalf of the Kusama DAO, see LICENSE in main folder.
 */

import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { comlink } from "vite-plugin-comlink";
//import { NodeGlobalsPolyfillPlugin } from '@esbuild-plugins/node-globals-polyfill';


// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), comlink()],
  build: {
    target: 'esnext',
  },
  assetsInclude: ['**/*.wasm'],
  worker: {
    format: 'es'
  }
})
