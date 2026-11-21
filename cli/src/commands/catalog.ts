import { buildCatalog, catalogBurn, formatOkb, launchBudget, refKey, resolveCircuit, type Address, type ResolvedCircuit } from '@voxro/sdk';
import { bold, dim, str, table, type Flags } from '../util.js';

export function catalog(f: Flags): void {
  const cpu = (str(f, 'cpu') ?? '0x00000000000000000000000000000000000000aa') as Address;
  const entries = buildCatalog(cpu);
  const cache = new Map<string, ResolvedCircuit>();
  const rows = entries.map((e) => {
    const c = resolveCircuit({ nIn: e.circuit.nIn, nOut: e.circuit.nOut, elements: e.circuit.elements }, { resolve: (a, i) => cache.get(refKey(a, i)) });
    cache.set(refKey(cpu, e.id), c);
    return { id: Number(e.id), name: e.name, kind: e.kind, pins: `${c.nIn}/${c.nOut}/${c.nState}`, gateCount: c.gateCount, burn: `${e.circuit.burn.nand}N ${e.circuit.burn.latch}L`, bytes: e.circuit.bytes.length, transitions: (1 << c.nState) * (1 << c.nIn) };
  });
  if (f.json) {
    console.log(JSON.stringify({ cpu, rows, burn: catalogBurn(entries) }, null, 2));
    return;
  }
  console.log(bold('VOXR launch catalog') + dim(` (REF target ${cpu})`));
  console.log(table(rows));
  const burn = catalogBurn(entries);
  console.log(`\ncatalog burn: ${bold(`${burn.nand} NAND + ${burn.latch} LATCH`)} · transitions: ${rows.reduce((a, r) => a + r.transitions, 0)}`);
  const b = launchBudget({ nand: 2000n, latch: 200n, mintPrice: 10_000_000_000_000n, circuits: entries.length, containers: 1, domainMonths: 120 });
  console.log(bold('\nLaunch budget') + dim(' (2000 NAND + 200 LATCH @ 0.00001 OKB, 8 tape-outs, 1 container)'));
  for (const l of b.lines) console.log(`  ${l.label.padEnd(52)} ${formatOkb(l.wei)}`);
  console.log(`  ${'total up-front'.padEnd(52)} ${bold(formatOkb(b.total))}  (protocol ${formatOkb(b.protocolFees)}, recoverable ${formatOkb(b.creatorRecoverable)})`);
}
