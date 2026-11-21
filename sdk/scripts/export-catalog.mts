// Writes the compiled VOXR catalog as JSON (netlist hex + pins) for the Foundry fork test and deploy script.
import { writeFileSync } from 'node:fs';
import { buildCatalog, catalogBurn, type Address } from '../src/index.js';

const cpu = (process.argv[2] ?? '0x0000000000000000000000000000000000000000') as Address;
const out = process.argv[3] ?? '../contracts/test/fixtures/catalog.json';
const entries = buildCatalog(cpu);
const burn = catalogBurn(entries);
const json = {
  cpuPlaceholder: cpu,
  note: 'REF records point at cpuPlaceholder; the deploy script rewrites them to the real VOXR address before tape-out.',
  burn,
  circuits: entries.map((e) => ({ id: Number(e.id), name: e.name, kind: e.kind, preset: e.preset ?? null, nIn: e.circuit.nIn, nOut: e.circuit.nOut, hex: e.circuit.hex, burn: e.circuit.burn })),
};
writeFileSync(out, JSON.stringify(json, null, 2));
console.log(`wrote ${out}: ${entries.length} circuits, burn ${burn.nand} NAND + ${burn.latch} LATCH`);
