// Bundles each service into one self-contained ESM file under dist/ (no node_modules needed on the server).
import { build } from 'esbuild';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const sdk = fileURLToPath(new URL('../sdk/src/index.ts', import.meta.url));
for (const entry of ['telegram', 'mcp', 'gateway'].filter((e) => existsSync(`src/${e}.ts`))) {
  await build({
    entryPoints: [`src/${entry}.ts`],
    outfile: `dist/voxro-${entry}.mjs`,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node20',
    alias: { '@voxro/sdk': sdk },
    banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
    logLevel: 'warning',
  });
  console.log(`dist/voxro-${entry}.mjs`);
}
