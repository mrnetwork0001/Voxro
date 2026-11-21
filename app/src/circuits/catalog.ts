/** The compiled VOXR catalog, resolved locally, plus helpers the views use to run and prove it. */
import {
  CURVE_PROFILES,
  INBOX_CONTROLLER,
  SURGE_BPS,
  beat,
  bitsFromInt,
  buildCatalog,
  controllerInputsFor,
  controllerInputsFromInt,
  controllerOutputsFromBits,
  controllerOutputsToInt,
  intFromBits,
  modelInboxController,
  modelSaturatingQueue3,
  modelSurgeCurveDecoder,
  modelVipPassGate,
  proveAgainstModel,
  quotePrice,
  refKey,
  resolveCircuit,
  type Bit,
  type CatalogEntry,
  type ControllerInputs,
  type ControllerOutputs,
  type ControllerPreset,
  type CurveProfile,
  type ProofResult,
  type ResolvedCircuit,
  type TransitionModel,
} from '@voxro/sdk';
import { CATALOG_CPU } from '../config.ts';

export interface CatalogItem extends CatalogEntry {
  resolved: ResolvedCircuit;
}

let cache: CatalogItem[] | null = null;

export function getCatalog(): CatalogItem[] {
  if (cache) return cache;
  const entries = buildCatalog(CATALOG_CPU);
  const resolved = new Map<string, ResolvedCircuit>();
  cache = entries.map((e) => {
    const r = resolveCircuit({ nIn: e.circuit.nIn, nOut: e.circuit.nOut, elements: e.circuit.elements }, { resolve: (cpu, id) => resolved.get(refKey(cpu, id)) });
    resolved.set(refKey(CATALOG_CPU, e.id), r);
    return { ...e, resolved: r };
  });
  return cache;
}

export function getController(preset: ControllerPreset): CatalogItem {
  const item = getCatalog().find((c) => c.kind === 'controller' && c.preset === preset);
  if (!item) throw new Error(`no controller for preset ${preset}`);
  return item;
}

export const PRESET_CIRCUIT_ID: Record<ControllerPreset, number> = { balanced: 4, fortress: 5, gentle: 6, steep: 7, configurable: 8 };

/** One controller beat on the local simulator (identical to the processor's `step()`). */
export function stepController(preset: ControllerPreset, q: number, inputs: ControllerInputs): { out: ControllerOutputs; newQ: number } {
  const c = getController(preset).resolved;
  const r = beat(c, bitsFromInt(q & 7, c.nState), [inputs.active, inputs.dir, inputs.p0, inputs.p1, inputs.allowlisted, inputs.holdsPartner]);
  return { out: controllerOutputsFromBits(r.outputs), newQ: intFromBits(r.newState) };
}

export function modelFor(item: CatalogItem): TransitionModel {
  if (item.kind === 'controller') {
    const preset = item.preset!;
    return (s, i) => {
      const o = modelInboxController(preset, s, controllerInputsFromInt(i));
      return { newState: o.q, output: controllerOutputsToInt(o) };
    };
  }
  switch (item.id) {
    case 1n:
      return (q, i) => {
        const next = modelSaturatingQueue3(q, i & 1, (i >> 1) & 1);
        return { newState: next, output: next };
      };
    case 2n:
      return (_s, i) => {
        const { tier, pause } = modelSurgeCurveDecoder(i & 7, i >> 3);
        return { newState: 0, output: tier | (pause << 2) };
      };
    default:
      return (_s, i) => {
        const r = modelVipPassGate(i & 1, (i >> 1) & 1, (i >> 2) & 3, (i >> 4) & 1);
        return { newState: 0, output: r.effTier | (r.disc << 2) | (r.canSend << 3) };
      };
  }
}

export function proveItem(item: CatalogItem): ProofResult {
  return proveAgainstModel(item.resolved, modelFor(item));
}

export interface ProofSummary {
  total: number;
  ok: boolean;
  elapsedMs: number;
  perCircuit: Array<{ id: bigint; name: string; total: number; ok: boolean; elapsedMs: number }>;
}

let proofCache: ProofSummary | null = null;
export function proveAll(): ProofSummary {
  if (proofCache) return proofCache;
  const per = getCatalog().map((item) => {
    const r = proveItem(item);
    return { id: item.id, name: item.name, total: r.total, ok: r.ok, elapsedMs: r.elapsedMs };
  });
  proofCache = { total: per.reduce((a, p) => a + p.total, 0), ok: per.every((p) => p.ok), elapsedMs: per.reduce((a, p) => a + p.elapsedMs, 0), perCircuit: per };
  return proofCache;
}

export interface TableRow {
  q: number;
  input: ControllerInputs;
  out: ControllerOutputs;
}

export function controllerTable(preset: ControllerPreset): TableRow[] {
  const c = getController(preset).resolved;
  const rows: TableRow[] = [];
  for (let q = 0; q < 1 << c.nState; q++) {
    for (let i = 0; i < 1 << c.nIn; i++) {
      const input = controllerInputsFromInt(i);
      const r = beat(c, bitsFromInt(q, c.nState), bitsFromInt(i, c.nIn));
      rows.push({ q, input, out: controllerOutputsFromBits(r.outputs) });
    }
  }
  return rows;
}

export interface Rung {
  q: number;
  nextQ: number;
  tier: number;
  price: bigint;
  canSend: boolean;
  vip: boolean;
}

/** Quote at every queue depth for one sender profile (dir = 1). */
export function priceLadder(preset: ControllerPreset, basePrice: bigint, flags: { allowlisted: boolean; holdsPartner: boolean }, curve: CurveProfile = 'balanced'): Rung[] {
  const inputs = controllerInputsFor({ enqueue: true, ...(preset === 'configurable' ? { profile: curve } : {}), ...flags });
  return Array.from({ length: 8 }, (_, q) => {
    const { out, newQ } = stepController(preset, q, inputs);
    return { q, nextQ: newQ, tier: out.effTier, price: quotePrice(basePrice, out), canSend: Boolean(out.canSend), vip: Boolean(out.vipDiscount50) };
  });
}

export interface TrafficEvent {
  kind: 'send' | 'reply' | 'refund';
  allowlisted?: boolean;
  holdsPartner?: boolean;
}

export interface TrafficPoint {
  i: number;
  event: TrafficEvent;
  q: number;
  tier: number;
  price: bigint;
  canSend: boolean;
}

export const DEFAULT_TRAFFIC: TrafficEvent[] = [
  ...Array.from({ length: 6 }, () => ({ kind: 'send' }) as TrafficEvent),
  { kind: 'reply' },
  { kind: 'reply' },
  { kind: 'send' },
  { kind: 'send', holdsPartner: true },
  { kind: 'send' },
  { kind: 'reply' },
  { kind: 'refund' },
  { kind: 'reply' },
  { kind: 'reply' },
];

export function simulateTraffic(preset: ControllerPreset, basePrice: bigint, events: TrafficEvent[], curve: CurveProfile = 'balanced'): TrafficPoint[] {
  let q = 0;
  return events.map((event, i) => {
    const inputs = controllerInputsFor({ enqueue: event.kind === 'send', ...(preset === 'configurable' ? { profile: curve } : {}), allowlisted: event.allowlisted ?? false, holdsPartner: event.holdsPartner ?? false });
    const { out, newQ } = stepController(preset, q, inputs);
    if (event.kind !== 'send' || out.canSend) q = newQ;
    return { i, event, q, tier: out.effTier, price: quotePrice(basePrice, out), canSend: Boolean(out.canSend) };
  });
}

export const TIER_MULT = ['1.0×', '1.5×', '2.5×', '4.0×'] as const;
export const tierBps = (tier: number) => SURGE_BPS[tier as 0 | 1 | 2 | 3] ?? 10_000n;
export { CURVE_PROFILES, INBOX_CONTROLLER };
export type { Bit };
