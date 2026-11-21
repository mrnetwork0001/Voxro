import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

// `base: './'` so the same bundle serves from https://voxro.shieldsuite.xyz and from a DeWEB `tape://` container.
// No external CDN, fonts or analytics: everything must be inside the bundle to pass TapeKit's 100% on-chain check.
export default defineConfig({
  base: './',
  plugins: [react()],
  resolve: {
    alias: { '@voxro/sdk': fileURLToPath(new URL('../sdk/src/index.ts', import.meta.url)) },
  },
  build: {
    target: 'es2022',
    assetsInlineLimit: 1 << 20,
    cssCodeSplit: false,
    sourcemap: false,
  },
  server: { fs: { allow: ['..'] } },
});
