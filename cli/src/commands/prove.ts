import {
  OP_REF,
  XLAYER,
  beat,
  bitsFromInt,
  bytesToHex,
  chainEval,
  chainStep,
  circuitsAbi,
  enumerateTransitions,
  formatNetlist,
  hexToBytes,
  intFromBits,
  loadCircuit,
  packBits,
  unpackBits,
  type Address,
  type ResolvedCircuit,
} from '@voxro/sdk';
import { CliError, bold, client, dim, fmtMs, green, num, parseRef, progress, red, resolveCpu, str, table, type Flags } from '../util.js';

function describe(c: ResolvedCircuit, cpu: Address, id: bigint): string[] {
  const out = [`${bold(`#${id} @ ${cpu}`)}`, `  pins      nIn=${c.nIn} nOut=${c.nOut} nState=${c.nState}  gateCount=${c.gateCount}  signals=${c.nSignals}`];
  const refs = c.elements.filter((e) => e.op === OP_REF);
  if (refs.length) {
    out.push(`  REF       ${refs.map((r) => (r.op === OP_REF ? `${r.cpu === cpu ? '' : r.cpu + ':'}#${r.id}(${r.ins.length}→${r.nOuts})` : '')).join('  ')}`);
    out.push(`  closure   ${[...c.subs.keys()].join(', ') || '(none)'}`);
  }
  return out;
}

export async function prove(f: Flags): Promise<void> {
  const refStr = f._[1];
  if (!refStr) throw new CliError('usage: voxro prove <#id@2.cpu> [--table] [--json] [--chunk 128] [--max-bits 12]');
  const pc = client(f);
  const ref = parseRef(refStr);
  const cpu = await resolveCpu(pc, ref);
  const t0 = performance.now();
  const c = await loadCircuit(pc, cpu, ref.id);
  const loadMs = performance.now() - t0;
  const maxBits = num(f, 'max-bits', 12);
  const bits = c.nState + c.nIn;
  if (!f.json) {
    describe(c, cpu, ref.id).forEach((l) => console.log(l));
    console.log(dim(`  loaded in ${fmtMs(loadMs)}; local resolver agrees with circuitInfo`));
  }
  if (bits > maxBits) {
    const msg = `circuit has ${bits} state+input bits (> ${maxBits}); exhaustive replay skipped (raise --max-bits)`;
    if (f.json) console.log(JSON.stringify({ cpu, id: ref.id.toString(), shape: { nIn: c.nIn, nOut: c.nOut, nState: c.nState, gateCount: c.gateCount }, skipped: msg }));
    else console.log(`  ${msg}`);
    return;
  }
  const transitions = enumerateTransitions(c, { maxStateBits: maxBits, maxInputBits: maxBits });
  const chunk = num(f, 'chunk', 128);
  const mismatches: Array<{ state: number; input: number; local: [number, number]; chain: [number, number] }> = [];
  const t1 = performance.now();
  for (let i = 0; i < transitions.length; i += chunk) {
    const slice = transitions.slice(i, i + chunk);
    const results = await pc.multicall({
      allowFailure: false,
      multicallAddress: XLAYER.multicall3,
      contracts: slice.map((t) => ({ address: cpu, abi: circuitsAbi, functionName: 'step' as const, args: [ref.id, bytesToHex(packBits(bitsFromInt(t.state, c.nState))), bytesToHex(packBits(bitsFromInt(t.input, c.nIn)))] as const })),
    });
    results.forEach((r, k) => {
      const [ns, o] = r as readonly [`0x${string}`, `0x${string}`];
      const t = slice[k]!;
      const cs = intFromBits(unpackBits(hexToBytes(ns), c.nState));
      const co = intFromBits(unpackBits(hexToBytes(o), c.nOut));
      if (cs !== t.newState || co !== t.output) mismatches.push({ state: t.state, input: t.input, local: [t.newState, t.output], chain: [cs, co] });
    });
    if (!f.json && process.stdout.isTTY) process.stdout.write(`\r  replay    ${progress(Math.min(i + chunk, transitions.length), transitions.length)}`);
  }
  const replayMs = performance.now() - t1;
  if (!f.json && process.stdout.isTTY) process.stdout.write('\n');
  const ok = mismatches.length === 0;
  if (f.json) {
    console.log(JSON.stringify({ cpu, id: ref.id.toString(), shape: { nIn: c.nIn, nOut: c.nOut, nState: c.nState, gateCount: c.gateCount }, transitions: transitions.length, ok, mismatches, replayMs, ...(f.table ? { table: transitions } : {}) }, null, 2));
    return;
  }
  console.log(`  result    ${ok ? green(`${transitions.length}/${transitions.length} transitions match step() on chain`) : red(`${mismatches.length} mismatches`)} ${dim(`(${fmtMs(replayMs)}, ${Math.ceil(transitions.length / chunk)} multicalls)`)}`);
  for (const m of mismatches.slice(0, 10)) console.log(red(`    state=${m.state} input=${m.input} local=${m.local.join('/')} chain=${m.chain.join('/')}`));
  if (f.table) {
    console.log('');
    console.log(table(transitions.map((t) => ({ state: t.state, 'state bits': bitsFromInt(t.state, c.nState).join(''), input: t.input, 'input bits': bitsFromInt(t.input, c.nIn).join(''), "state'": t.newState, output: t.output, 'output bits': bitsFromInt(t.output, c.nOut).join('') }))));
  }
  if (f.netlist) console.log('\n' + formatNetlist(c));
}

function parseBits(s: string | undefined, n: number, what: string): number[] {
  if (n === 0 && (!s || s === '0x' || s === '')) return [];
  if (!s) throw new CliError(`--${what} is required (${n} bits as 0x hex, LSB-first, or a bit string like 0110)`);
  if (/^0x/i.test(s)) return unpackBits(hexToBytes(s), n);
  if (/^[01]+$/.test(s)) {
    if (s.length !== n) throw new CliError(`--${what}: expected ${n} bits, got ${s.length}`);
    return [...s].map(Number);
  }
  throw new CliError(`--${what}: not hex or bits`);
}

export async function step(f: Flags, mode: 'step' | 'eval'): Promise<void> {
  const refStr = f._[1];
  if (!refStr) throw new CliError(`usage: voxro ${mode} <#id@2.cpu> ${mode === 'step' ? '--state 0x.. ' : ''}--inputs 0x..`);
  const pc = client(f);
  const ref = parseRef(refStr);
  const cpu = await resolveCpu(pc, ref);
  const c = await loadCircuit(pc, cpu, ref.id);
  const inputs = parseBits(str(f, 'inputs'), c.nIn, 'inputs');
  const state = mode === 'step' ? parseBits(str(f, 'state'), c.nState, 'state') : new Array(c.nState).fill(0);
  const local = beat(c, state, inputs);
  let chainOut: number[];
  let chainState: number[] | null = null;
  if (mode === 'eval') {
    if (c.nState) throw new CliError('circuit has LATCH state: use `voxro step`');
    chainOut = unpackBits(await chainEval(pc, cpu, ref.id, packBits(inputs)), c.nOut);
  } else {
    const r = await chainStep(pc, cpu, ref.id, packBits(state), packBits(inputs));
    chainOut = unpackBits(r.outputs, c.nOut);
    chainState = unpackBits(r.newState, c.nState);
  }
  const same = chainOut.join('') === local.outputs.join('') && (chainState === null || chainState.join('') === local.newState.join(''));
  const row = (label: string, s: number[] | null, o: number[]) => `  ${label.padEnd(8)} ${s ? `state' ${s.join('')} (${intFromBits(s)})  ` : ''}outputs ${o.join('')} (${intFromBits(o)})`;
  console.log(bold(`#${ref.id} @ ${cpu}`) + dim(`  inputs ${inputs.join('')}${c.nState ? ` state ${state.join('')}` : ''}  (LSB-first)`));
  console.log(row('local', mode === 'step' ? local.newState : null, local.outputs));
  console.log(row('chain', chainState, chainOut));
  console.log(same ? green('  identical') : red('  MISMATCH'));
  if (!same) process.exitCode = 1;
}
