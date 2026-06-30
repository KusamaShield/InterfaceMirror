/*
 * Copyright 2025 Kusama Shield Developers on behalf of the Kusama DAO, see LICENSE in main folder.
 */

import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
//import { NodeGlobalsPolyfillPlugin } from '@esbuild-plugins/node-globals-polyfill';


// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    target: 'esnext',
  },
  worker: {
    format: 'es',
  },
  resolve: {},
  // Cross-Origin-Isolation headers enable SharedArrayBuffer, which lets
  // snarkjs/ffjavascript use multi-threaded WASM for multiexponentiation.
  // Without these, groth16.prove() runs single-threaded (~40s → ~5-10s).
  server: {
    allowedHosts: ['pi'],
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
    proxy: {
      '/api/rpc-proxy': {
        target: 'https://kusama-rpc.laissez-faire.trade',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/rpc-proxy/, ''),
        configure: (proxy, options) => {
          proxy.on('proxyRes', (proxyRes, req, res) => {
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
            res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
          });
        }
      },
      '/api/mail-proxy': {
        target: 'https://mail.thc.org',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/mail-proxy/, ''),
      }
    }
  },
  preview: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  assetsInclude: ['**/*.wasm'],
  optimizeDeps: {
    include: ['dayjs', 'dayjs/plugin/relativeTime', 'dayjs/locale/en'],
  },
})
