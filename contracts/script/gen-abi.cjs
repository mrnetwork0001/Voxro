// Regenerates sdk/src/escrow/abi.ts from the Foundry artifacts (run: pnpm --filter @voxro/sdk abi).
const fs = require('fs');
const path = require('path');
const out = path.join(__dirname, '..', 'out');
const read = (f) => JSON.parse(fs.readFileSync(path.join(out, f), 'utf8')).abi;
const e = read('VoxroEscrow.sol/VoxroEscrow.json');
const l = read('VoxroLens.sol/VoxroLens.json');
const v = read('Erc721HolderVip.sol/Erc721HolderVip.json');
const c = read('TapeOutCommunityVip.sol/TapeOutCommunityVip.json');
const hdr = '/** Generated from Foundry artifacts (contracts/out); regenerate with `pnpm --filter @voxro/sdk abi`. */\n';
fs.writeFileSync(path.join(__dirname, '..', '..', 'sdk', 'src', 'escrow', 'abi.ts'), `${hdr}export const voxroEscrowAbi = ${JSON.stringify(e)} as const;\n\nexport const voxroLensAbi = ${JSON.stringify(l)} as const;\n\nexport const erc721HolderVipAbi = ${JSON.stringify(v)} as const;\n\nexport const tapeOutCommunityVipAbi = ${JSON.stringify(c)} as const;\n`);
console.log('abi.ts regenerated:', e.filter((x) => x.type === 'function').length, 'escrow functions');
