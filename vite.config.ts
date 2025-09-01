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
})
