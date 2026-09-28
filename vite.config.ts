/*
 * Copyright 2025 Kusama Shield Developers on behalf of the Kusama DAO, see LICENSE in main folder.
 */

import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'
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
  resolve: {
    alias: [
      {
        find: /^@phosphor-icons\/webcomponents\/.*/,
        replacement: fileURLToPath(new URL('./src/phosphor-stub.ts', import.meta.url)),
      },
    ],
  },
  // Note: COOP/COEP headers enable SharedArrayBuffer for multi-threaded WASM
  // But they can cause issues with some wallet SDKs (Coinbase, WalletConnect)
  // For production, consider using a reverse proxy or separate domains
  server: {
    allowedHosts: ['pi'],
    headers: {
      // 'Cross-Origin-Opener-Policy': 'same-origin',
      // 'Cross-Origin-Embedder-Policy': 'require-corp',
    },
    proxy: {
      // Local Flask proxy for testing. Switch back to
      // https://proxyswap.laissez-faire.trade before deploying.
      '/api/rpc-proxy': {
        target: 'http://pi:5000',
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
      '/api/swap': {
        target: 'http://pi:5000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/swap/, ''),
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
      // 'Cross-Origin-Opener-Policy': 'same-origin',
      // 'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  assetsInclude: ['**/*.wasm'],
  optimizeDeps: {
    include: ['dayjs', 'dayjs/plugin/relativeTime', 'dayjs/locale/en'],
  },
})
