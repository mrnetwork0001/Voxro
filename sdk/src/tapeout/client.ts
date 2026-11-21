/** Read-only chain access for processors and circuits (viem). */
import type { Hex, PublicClient } from 'viem';
import { circuitsAbi, factoryAbi } from './abi.js';
import { XLAYER } from './addresses.js';
import {
  IllFormedError,
  OP_REF,
  decodeNetlist,
  refKey,
  resolveCircuit,
  type Address,
  type CircuitShape,
  type ResolvedCircuit,
} from './netlist.js';
import { bytesToHex, hexToBytes } from './pack.js';

export interface CircuitCache {
  circuits: Map<string, ResolvedCircuit>;
  cpus: Map<string, boolean>;
}

export const createCircuitCache = (): CircuitCache => ({ circuits: new Map(), cpus: new Map() });

export async function readCircuitShape(client: PublicClient, cpu: Address, id: bigint): Promise<CircuitShape> {
  const [nIn, nOut, nState, gateCount] = await client.readContract({ address: cpu, abi: circuitsAbi, functionName: 'circuitInfo', args: [id] });
  return { nIn, nOut, nState, gateCount };
}

export async function readNetlistBytes(client: PublicClient, cpu: Address, id: bigint): Promise<Uint8Array> {
  return hexToBytes(await client.readContract({ address: cpu, abi: circuitsAbi, functionName: 'netlist', args: [id] }));
}

export async function isRegisteredCpu(client: PublicClient, cpu: Address, factory: Address = XLAYER.factory, cache?: CircuitCache): Promise<boolean> {
  const k = cpu.toLowerCase();
  const hit = cache?.cpus.get(k);
  if (hit !== undefined) return hit;
  const ok = await client.readContract({ address: factory, abi: factoryAbi, functionName: 'isCPU', args: [cpu] });
  cache?.cpus.set(k, ok);
  return ok;
}

/**
 * Load a circuit and its whole REF closure from chain, check it against TAP-02 locally, and
 * cross-check the computed `nState` / `gateCount` with `circuitInfo`. A mismatch would mean the
 * local evaluator and the chain disagree on semantics, so it is an error, not a warning.
 */
export async function loadCircuit(
  client: PublicClient,
  cpu: Address,
  id: bigint,
  opts: { cache?: CircuitCache; factory?: Address } = {},
): Promise<ResolvedCircuit> {
  const cache = opts.cache ?? createCircuitCache();
  const factory = opts.factory ?? XLAYER.factory;
  const key = refKey(cpu, id);
  const hit = cache.circuits.get(key);
  if (hit) return hit;

  const [shape, bytes] = await Promise.all([readCircuitShape(client, cpu, id), readNetlistBytes(client, cpu, id)]);
  const elements = decodeNetlist(bytes);
  for (const e of elements) {
    if (e.op !== OP_REF) continue;
    if (!(await isRegisteredCpu(client, e.cpu, factory, cache))) throw new IllFormedError('REF: target not a registered CPU', e.cpu);
    await loadCircuit(client, e.cpu, e.id, { cache, factory });
  }
  const circuit = resolveCircuit(
    { nIn: shape.nIn, nOut: shape.nOut, elements },
    { resolve: (c, i) => cache.circuits.get(refKey(c, i)), isCPU: (c) => cache.cpus.get(c.toLowerCase()) ?? false },
  );
  if (circuit.nState !== shape.nState || circuit.gateCount !== shape.gateCount) {
    throw new Error(
      `circuitInfo mismatch for ${cpu}#${id}: chain (nState=${shape.nState}, gateCount=${shape.gateCount}) vs local (nState=${circuit.nState}, gateCount=${circuit.gateCount})`,
    );
  }
  cache.circuits.set(key, circuit);
  return circuit;
}

export async function chainStep(client: PublicClient, cpu: Address, id: bigint, state: Uint8Array, inputs: Uint8Array) {
  const [newState, outputs] = await client.readContract({
    address: cpu,
    abi: circuitsAbi,
    functionName: 'step',
    args: [id, bytesToHex(state), bytesToHex(inputs)],
  });
  return { newState: hexToBytes(newState), outputs: hexToBytes(outputs) };
}

export async function chainEval(client: PublicClient, cpu: Address, id: bigint, inputs: Uint8Array): Promise<Uint8Array> {
  const out: Hex = await client.readContract({ address: cpu, abi: circuitsAbi, functionName: 'eval', args: [id, bytesToHex(inputs)] });
  return hexToBytes(out);
}

/** Every processor's circuits address, in factory order (index = processor number). */
export async function listProcessors(client: PublicClient, factory: Address = XLAYER.factory, multicallAddress: Address = XLAYER.multicall3): Promise<Address[]> {
  const count = await client.readContract({ address: factory, abi: factoryAbi, functionName: 'cpuCount' });
  const n = Number(count);
  const out: Address[] = [];
  const chunk = 200;
  for (let start = 0; start < n; start += chunk) {
    const idx = Array.from({ length: Math.min(chunk, n - start) }, (_, k) => BigInt(start + k));
    const res = await client.multicall({
      allowFailure: false,
      multicallAddress,
      contracts: idx.map((i) => ({ address: factory, abi: factoryAbi, functionName: 'cpuAt' as const, args: [i] as const })),
    });
    for (const a of res) out.push(a as Address);
  }
  return out;
}
