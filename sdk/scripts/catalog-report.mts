// Print the Voxro circuit catalog with gate counts and the mainnet transistor budget.
import { buildCatalog, catalogBurn, resolveCircuit, refKey, launchBudget, formatOkb, type ResolvedCircuit, type Address } from '../src/index.js';
const cpu: Address = '0x00000000000000000000000000000000000000aa';
const entries = buildCatalog(cpu);
const cache = new Map<string, ResolvedCircuit>();
const rows = entries.map((e) => {
  const c = resolveCircuit({ nIn: e.circuit.nIn, nOut: e.circuit.nOut, elements: e.circuit.elements }, { resolve: (a, i) => cache.get(refKey(a, i)) });
  cache.set(refKey(cpu, e.id), c);
  return { id: Number(e.id), name: e.name, nIn: c.nIn, nOut: c.nOut, nState: c.nState, gateCount: c.gateCount, burnNAND: e.circuit.burn.nand, burnLATCH: e.circuit.burn.latch, bytes: e.circuit.bytes.length, transitions: (1 << c.nState) * (1 << c.nIn) };
});
console.table(rows);
const burn = catalogBurn(entries);
console.log(`catalog burn: ${burn.nand} NAND + ${burn.latch} LATCH; total transitions: ${rows.reduce((a, r) => a + r.transitions, 0)}`);
const b = launchBudget({ nand: 2000n, latch: 200n, mintPrice: 10_000_000_000_000n, circuits: entries.length, containers: 1, domainMonths: 120 });
for (const l of b.lines) console.log(`  ${l.label.padEnd(52)} ${formatOkb(l.wei)}`);
console.log(`  total up-front ${formatOkb(b.total)} (protocol fees ${formatOkb(b.protocolFees)}, recoverable mint revenue ${formatOkb(b.creatorRecoverable)})`);
