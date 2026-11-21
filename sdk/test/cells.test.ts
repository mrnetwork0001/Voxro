import { describe, expect, it } from 'vitest';
import {
  CONTROLLER_PRESETS,
  INBOX_CONTROLLER,
  SATURATING_QUEUE3,
  SURGE_CURVE_DECODER,
  VIP_PASS_GATE,
  buildCatalog,
  buildInboxController,
  buildSaturatingQueue3,
  buildSurgeCurveDecoder,
  buildVipPassGate,
  catalogBurn,
  controllerInputsFromInt,
  controllerOutputsToInt,
  formatNetlist,
  modelInboxController,
  modelSaturatingQueue3,
  modelSurgeCurveDecoder,
  modelVipPassGate,
  proveAgainstModel,
  quotePrice,
  refKey,
  resolveCircuit,
  type Address,
  type BuiltCircuit,
  type ResolvedCircuit,
} from '../src/index.js';

const CPU: Address = '0x00000000000000000000000000000000000000aa';
const local = (b: BuiltCircuit, opts?: Parameters<typeof resolveCircuit>[1]) => resolveCircuit({ nIn: b.nIn, nOut: b.nOut, elements: b.elements }, opts);

describe('SaturatingQueue3 (#1)', () => {
  const built = buildSaturatingQueue3();
  const c = local(built);
  it('has the specified pins, 3 state bits and no alignment buffers', () => {
    expect([c.nIn, c.nOut, c.nState]).toEqual([SATURATING_QUEUE3.nIn, SATURATING_QUEUE3.nOut, SATURATING_QUEUE3.nState]);
    expect(built.alignmentBuffers).toBe(0);
    expect(built.burn.latch).toBe(3);
  });
  it('all 32 transitions match the model (output = next depth = new state)', () => {
    const r = proveAgainstModel(c, (q, input) => {
      const next = modelSaturatingQueue3(q, input & 1, (input >> 1) & 1);
      return { newState: next, output: next };
    });
    expect(r.total).toBe(32);
    expect(r.mismatches).toEqual([]);
  });
});

describe('SurgeCurveDecoder (#2)', () => {
  const built = buildSurgeCurveDecoder();
  const c = local(built);
  it('is combinational with the specified pins', () => {
    expect([c.nIn, c.nOut, c.nState]).toEqual([SURGE_CURVE_DECODER.nIn, SURGE_CURVE_DECODER.nOut, 0]);
    expect(built.alignmentBuffers).toBe(0);
  });
  it('all 32 input combinations match the curve tables', () => {
    const r = proveAgainstModel(c, (_s, input) => {
      const { tier, pause } = modelSurgeCurveDecoder(input & 7, input >> 3);
      return { newState: 0, output: tier | (pause << 2) };
    });
    expect(r.total).toBe(32);
    expect(r.mismatches).toEqual([]);
  });
});

describe('VipPassGate (#3)', () => {
  const built = buildVipPassGate();
  const c = local(built);
  it('is combinational with the specified pins', () => {
    expect([c.nIn, c.nOut, c.nState]).toEqual([VIP_PASS_GATE.nIn, VIP_PASS_GATE.nOut, 0]);
    expect(built.alignmentBuffers).toBe(0);
  });
  it('all 32 input combinations match the model', () => {
    const r = proveAgainstModel(c, (_s, input) => {
      const { effTier, disc, canSend } = modelVipPassGate(input & 1, (input >> 1) & 1, (input >> 2) & 3, (input >> 4) & 1);
      return { newState: 0, output: effTier | (disc << 2) | (canSend << 3) };
    });
    expect(r.total).toBe(32);
    expect(r.mismatches).toEqual([]);
  });
});

describe('InboxController (#4..#8) REF composition', () => {
  const cells = new Map<string, ResolvedCircuit>([
    [refKey(CPU, 1n), local(buildSaturatingQueue3())],
    [refKey(CPU, 2n), local(buildSurgeCurveDecoder())],
    [refKey(CPU, 3n), local(buildVipPassGate())],
  ]);
  const opts = { resolve: (cpu: Address, id: bigint) => cells.get(refKey(cpu, id)), isCPU: (cpu: Address) => cpu.toLowerCase() === CPU };
  const refs = { cpu: CPU, saturatingQueue3: 1n, surgeCurveDecoder: 2n, vipPassGate: 3n };

  for (const preset of CONTROLLER_PRESETS) {
    it(`${preset}: 6 inputs, 7 outputs, 3 state bits, burns exactly 6 NAND and 0 LATCH, 512 transitions prove`, () => {
      const built = buildInboxController(preset, refs);
      expect(built.burn).toEqual({ nand: 6, latch: 0 });
      expect(built.alignmentBuffers).toBe(0);
      const c = local(built, opts);
      expect([c.nIn, c.nOut, c.nState]).toEqual([INBOX_CONTROLLER.nIn, INBOX_CONTROLLER.nOut, INBOX_CONTROLLER.nState]);
      const r = proveAgainstModel(c, (q, input) => {
        const o = modelInboxController(preset, q, controllerInputsFromInt(input));
        return { newState: o.q, output: controllerOutputsToInt(o) };
      });
      expect(r.total).toBe(512);
      expect(r.mismatches).toEqual([]);
      expect(r.elapsedMs).toBeLessThan(250);
    });
  }

  it('rejects a controller whose REF pins do not match the cells', () => {
    const built = buildInboxController('balanced', { ...refs, vipPassGate: 2n });
    expect(() => local(built, opts)).toThrow(/REF: pin mismatch/);
  });

  it('demo walk-through on the Balanced preset: 10 → 15 → 15 → 25 → 25 USD₮0 (quoted on post-enqueue depth), VIP halves it, allowlist zeroes surge', () => {
    const base = 10_000_000n; // 10 USD₮0 (6 decimals)
    const enqueue = { active: 1, dir: 1, p0: 0, p1: 0, allowlisted: 0, holdsPartner: 0 } as const;
    const prices: bigint[] = [];
    let q = 0;
    for (let i = 0; i < 5; i++) {
      const o = modelInboxController('balanced', q, enqueue);
      prices.push(quotePrice(base, o));
      q = o.q;
    }
    expect(prices).toEqual([10_000_000n, 15_000_000n, 15_000_000n, 25_000_000n, 25_000_000n]);
    const vip = modelInboxController('balanced', 5, { ...enqueue, holdsPartner: 1 }); // Q' = 6 → tier 3 → holder: tier 2, 50% off
    expect(quotePrice(base, vip)).toBe(12_500_000n);
    const allow = modelInboxController('balanced', 5, { ...enqueue, allowlisted: 1 });
    expect(quotePrice(base, allow)).toBe(10_000_000n);
  });

  it('Fortress pauses cold senders at Q = 7 but never VIPs', () => {
    const cold = modelInboxController('fortress', 7, { active: 1, dir: 1, p0: 0, p1: 0, allowlisted: 0, holdsPartner: 0 });
    expect(cold.canSend).toBe(0);
    const holder = modelInboxController('fortress', 7, { active: 1, dir: 1, p0: 0, p1: 0, allowlisted: 0, holdsPartner: 1 });
    expect(holder.canSend).toBe(1);
    const settled = modelInboxController('fortress', 7, { active: 1, dir: 0, p0: 0, p1: 0, allowlisted: 0, holdsPartner: 0 });
    expect(settled.q).toBe(6);
  });
});

describe('catalog', () => {
  it('builds 8 circuits and reports the transistor budget', () => {
    const entries = buildCatalog(CPU);
    expect(entries.map((e) => e.id)).toEqual([1n, 2n, 3n, 4n, 5n, 6n, 7n, 8n]);
    const burn = catalogBurn(entries);
    const table = entries.map((e) => ({ id: Number(e.id), name: e.name, nIn: e.circuit.nIn, nOut: e.circuit.nOut, nand: e.circuit.burn.nand, latch: e.circuit.burn.latch, bytes: e.circuit.bytes.length }));
    console.table(table);
    console.log(`catalog burn: ${burn.nand} NAND + ${burn.latch} LATCH`);
    console.log('\n' + formatNetlist(entries[3]!.circuit));
    expect(burn.latch).toBe(3);
    expect(burn.nand).toBeLessThan(300);
  });
});
