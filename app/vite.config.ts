import react from '@vitejs/plugin-react';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

/**
 * Mainnet addresses come from `contracts/deployments/xlayer.json`, written by `script/Deploy.s.sol`
 * when the contracts are broadcast to X Layer. `VITE_*` env vars override it (Anvil fork rehearsals).
 * If neither is present the app ships in "not deployed" mode: live reads only, every write disabled.
 */
const deploymentPath = fileURLToPath(new URL('../contracts/deployments/xlayer.json', import.meta.url));
const deployment: Record<string, unknown> = existsSync(deploymentPath) ? JSON.parse(readFileSync(deploymentPath, 'utf8')) : {};

// `base: './'` so the same bundle serves from https://voxro.shieldsuite.xyz and from a DeWEB `tape://` container.
// No external CDN, fonts or analytics: everything must be inside the bundle to pass TapeKit's 100% on-chain check.
export default defineConfig({
  base: './',
  plugins: [react()],
  define: { __VOXRO_DEPLOYMENT__: JSON.stringify(deployment) },
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
