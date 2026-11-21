import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  IllFormedError,
  bytesToHex,
  decodeNetlist,
  encodeNetlist,
  evalBytes,
  hexToBytes,
  refKey,
  resolveCircuit,
  stepBytes,
  type Address,
  type ResolvedCircuit,
} from '../src/tapeout/index.js';

interface RefVector { cpu: string; id: number; nIn: number; nOut: number; netlist: string }
interface ValidVector {
  name: string; nIn: number; nOut: number; nState: number; netlist: string; refs: RefVector[];
  truthTable?: Array<{ inputs: string; outputs: string }>;
  beats?: Array<{ state: string; inputs: string; newState: string; outputs: string }>;
}
interface IllFormedVector { name: string; nIn: number; nOut: number; netlist: string; reason: string; refs: RefVector[] }
interface Vectors {
  format: string;
  valid: ValidVector[];
  illFormed: IllFormedVector[];
  packingEdgeCases: { circuit: string; cases: Array<{ case: string; inputs: string; outputs: string }> };
}

const vectors = JSON.parse(readFileSync(new URL('./vendor/tap-02/vectors.json', import.meta.url), 'utf8')) as Vectors;
const plain = (b: Uint8Array) => bytesToHex(b).slice(2);

function optionsFor(refs: RefVector[]) {
  const map = new Map<string, ResolvedCircuit>();
  for (const r of refs) map.set(refKey(r.cpu, BigInt(r.id)), resolveCircuit({ nIn: r.nIn, nOut: r.nOut, elements: decodeNetlist(hexToBytes(r.netlist)) }));
  const cpus = new Set(refs.map((r) => r.cpu.toLowerCase()));
  return { resolve: (cpu: Address, id: bigint) => map.get(refKey(cpu, id)), isCPU: (cpu: Address) => cpus.has(cpu.toLowerCase()) };
}

/** Reason our resolver must give, matching the chain's revert string (TAP-02 §3). */
const EXPECTED_REASON: Record<string, string> = {
  unknown_opcode: 'bad opcode',
  truncated_record: 'truncated record',
  nand_forward_reference: 'NAND: future signal',
  nOut_zero: 'no outputs',
  output_is_an_input: 'too few signals for outputs',
  more_outputs_than_elements: 'too few signals for outputs',
  ref_arity_mismatch: 'REF: pin mismatch',
  ref_target_not_registered: 'no circuit',
};

describe(`TAP-02 vectors (${vectors.format})`, () => {
  it('has the expected shape', () => {
    expect(vectors.valid.length).toBe(5);
    expect(vectors.illFormed.length).toBe(8);
  });

  for (const v of vectors.valid) {
    it(`valid: ${v.name}`, () => {
      const bytes = hexToBytes(v.netlist);
      const elements = decodeNetlist(bytes);
      expect(bytesToHex(encodeNetlist(elements))).toBe(v.netlist.toLowerCase());
      const c = resolveCircuit({ nIn: v.nIn, nOut: v.nOut, elements }, optionsFor(v.refs));
      expect(c.nState).toBe(v.nState);
      if (v.truthTable) {
        expect(v.truthTable.length).toBe(1 << v.nIn);
        for (const row of v.truthTable) expect(plain(evalBytes(c, hexToBytes(row.inputs)))).toBe(row.outputs);
      }
      if (v.beats) {
        for (const b of v.beats) {
          const r = stepBytes(c, hexToBytes(b.state), hexToBytes(b.inputs));
          expect(plain(r.newState)).toBe(b.newState);
          expect(plain(r.outputs)).toBe(b.outputs);
        }
      }
    });
  }

  for (const v of vectors.illFormed) {
    it(`ill-formed: ${v.name} → "${EXPECTED_REASON[v.name]}"`, () => {
      let err: unknown;
      try {
        resolveCircuit({ nIn: v.nIn, nOut: v.nOut, elements: decodeNetlist(hexToBytes(v.netlist)) }, optionsFor(v.refs));
      } catch (e) {
        err = e;
      }
      expect(err).toBeInstanceOf(IllFormedError);
      expect((err as IllFormedError).reason).toBe(EXPECTED_REASON[v.name]);
    });
  }

  describe('packing edge cases', () => {
    const v = vectors.valid.find((x) => x.name === vectors.packingEdgeCases.circuit)!;
    const c = resolveCircuit({ nIn: v.nIn, nOut: v.nOut, elements: decodeNetlist(hexToBytes(v.netlist)) });
    for (const k of vectors.packingEdgeCases.cases) {
      it(k.case, () => expect(plain(evalBytes(c, hexToBytes(k.inputs)))).toBe(k.outputs));
    }
  });
});
