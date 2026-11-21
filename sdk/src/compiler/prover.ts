/**
 * Exhaustive transition prover. For a circuit with small state and input widths it evaluates
 * every (state, input) pair locally, optionally compares each against a reference model, and
 * can replay every pair through the processor's `step()` on chain (Multicall3-batched).
 */
import type { PublicClient } from 'viem';
import { circuitsAbi } from '../tapeout/abi.js';
import { XLAYER } from '../tapeout/addresses.js';
import type { Address, ResolvedCircuit } from '../tapeout/netlist.js';
import { bitsFromInt, bytesToHex, hexToBytes, intFromBits, packBits, unpackBits } from '../tapeout/pack.js';
import { beat } from '../tapeout/sim.js';

export interface Transition {
  state: number;
  input: number;
  newState: number;
  output: number;
}

export interface EnumerateLimits {
  maxStateBits?: number;
  maxInputBits?: number;
}

export function enumerateTransitions(c: ResolvedCircuit, limits: EnumerateLimits = {}): Transition[] {
  const maxS = limits.maxStateBits ?? 12;
  const maxI = limits.maxInputBits ?? 12;
  if (c.nState > maxS || c.nIn > maxI) throw new RangeError(`circuit too large for exhaustive enumeration (nState=${c.nState}, nIn=${c.nIn})`);
  if (c.nOut > 31) throw new RangeError('prover packs outputs into a 31-bit integer');
  const out: Transition[] = [];
  const states = 1 << c.nState;
  const inputs = 1 << c.nIn;
  for (let s = 0; s < states; s++) {
    const sb = bitsFromInt(s, c.nState);
    for (let i = 0; i < inputs; i++) {
      const r = beat(c, sb, bitsFromInt(i, c.nIn));
      out.push({ state: s, input: i, newState: intFromBits(r.newState), output: intFromBits(r.outputs) });
    }
  }
  return out;
}

export type TransitionModel = (state: number, input: number) => { newState: number; output: number };

export interface Mismatch extends Transition {
  expectedNewState: number;
  expectedOutput: number;
}

export interface ProofResult {
  ok: boolean;
  total: number;
  mismatches: Mismatch[];
  elapsedMs: number;
  transitions: Transition[];
}

/** Compare every transition of the circuit with a reference model. */
export function proveAgainstModel(c: ResolvedCircuit, model: TransitionModel, limits?: EnumerateLimits): ProofResult {
  const t0 = performance.now();
  const transitions = enumerateTransitions(c, limits);
  const mismatches: Mismatch[] = [];
  for (const t of transitions) {
    const m = model(t.state, t.input);
    if (m.newState !== t.newState || m.output !== t.output) mismatches.push({ ...t, expectedNewState: m.newState, expectedOutput: m.output });
  }
  return { ok: mismatches.length === 0, total: transitions.length, mismatches, elapsedMs: performance.now() - t0, transitions };
}

/** Replay every transition through `step()` on chain and compare bit for bit. */
export async function proveAgainstChain(
  client: PublicClient,
  cpu: Address,
  id: bigint,
  c: ResolvedCircuit,
  opts: { chunk?: number; multicallAddress?: Address; limits?: EnumerateLimits } = {},
): Promise<ProofResult> {
  const t0 = performance.now();
  const transitions = enumerateTransitions(c, opts.limits);
  const chunk = opts.chunk ?? 128;
  const mismatches: Mismatch[] = [];
  for (let i = 0; i < transitions.length; i += chunk) {
    const slice = transitions.slice(i, i + chunk);
    const results = await client.multicall({
      allowFailure: false,
      multicallAddress: opts.multicallAddress ?? XLAYER.multicall3,
      contracts: slice.map((t) => ({
        address: cpu,
        abi: circuitsAbi,
        functionName: 'step' as const,
        args: [id, bytesToHex(packBits(bitsFromInt(t.state, c.nState))), bytesToHex(packBits(bitsFromInt(t.input, c.nIn)))] as const,
      })),
    });
    results.forEach((r, k) => {
      const [ns, out] = r as readonly [`0x${string}`, `0x${string}`];
      const t = slice[k]!;
      const chainNewState = intFromBits(unpackBits(hexToBytes(ns), c.nState));
      const chainOutput = intFromBits(unpackBits(hexToBytes(out), c.nOut));
      if (chainNewState !== t.newState || chainOutput !== t.output) {
        mismatches.push({ ...t, expectedNewState: chainNewState, expectedOutput: chainOutput });
      }
    });
  }
  return { ok: mismatches.length === 0, total: transitions.length, mismatches, elapsedMs: performance.now() - t0, transitions };
}
