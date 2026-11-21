import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const deploymentPath = fileURLToPath(new URL('../contracts/deployments/xlayer.json', import.meta.url));
const deployment: Record<string, unknown> = existsSync(deploymentPath) ? JSON.parse(readFileSync(deploymentPath, 'utf8')) : {};

export default defineConfig({
  define: { __VOXRO_DEPLOYMENT__: JSON.stringify(deployment) },
  resolve: { alias: { '@voxro/sdk': fileURLToPath(new URL('../sdk/src/index.ts', import.meta.url)) } },
  test: { include: ['test/**/*.test.ts'], environment: 'node', setupFiles: ['test/setup.ts'] },
});
