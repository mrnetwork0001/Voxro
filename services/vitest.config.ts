import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
export default defineConfig({ resolve: { alias: { '@voxro/sdk': fileURLToPath(new URL('../sdk/src/index.ts', import.meta.url)) } } });
