/** The circuits Voxro tapes out on the VOXR processor, in tape-out order. */
import type { Address } from '../tapeout/netlist.js';
import type { BuiltCircuit } from './builder.js';
import { buildInboxController, PRESET_NAMES, type CellRefs, type ControllerPreset } from './cells/inboxController.js';
import { buildSaturatingQueue3, SATURATING_QUEUE3 } from './cells/saturatingQueue3.js';
import { buildSurgeCurveDecoder, SURGE_CURVE_DECODER } from './cells/surgeCurveDecoder.js';
import { buildVipPassGate, VIP_PASS_GATE } from './cells/vipPassGate.js';

export interface CatalogEntry {
  /** Expected circuit id when taped out in order on a fresh processor. */
  id: bigint;
  name: string;
  kind: 'cell' | 'controller';
  preset?: ControllerPreset;
  circuit: BuiltCircuit;
}

/** Launch order: #4 FounderBalanced, #5 VcFortress, #6 AuditorDisclosure, #7 Steep, #8 Configurable. */
export const LAUNCH_PRESETS = ['balanced', 'fortress', 'gentle', 'steep', 'configurable'] as const satisfies readonly ControllerPreset[];

/** Standard cells first (ids 1..3), then the controllers that REF them (ids 4..). */
export function buildCatalog(cpu: Address, presets: readonly ControllerPreset[] = LAUNCH_PRESETS): CatalogEntry[] {
  const refs: CellRefs = { cpu, saturatingQueue3: 1n, surgeCurveDecoder: 2n, vipPassGate: 3n };
  const entries: CatalogEntry[] = [
    { id: 1n, name: SATURATING_QUEUE3.name, kind: 'cell', circuit: buildSaturatingQueue3() },
    { id: 2n, name: SURGE_CURVE_DECODER.name, kind: 'cell', circuit: buildSurgeCurveDecoder() },
    { id: 3n, name: VIP_PASS_GATE.name, kind: 'cell', circuit: buildVipPassGate() },
  ];
  let id = 4n;
  for (const preset of presets) {
    entries.push({ id, name: PRESET_NAMES[preset], kind: 'controller', preset, circuit: buildInboxController(preset, refs) });
    id++;
  }
  return entries;
}

/** Transistors to mint for the whole catalog (plus the headroom you want for user tape-outs). */
export function catalogBurn(entries: readonly CatalogEntry[]): { nand: number; latch: number } {
  return entries.reduce((acc, e) => ({ nand: acc.nand + e.circuit.burn.nand, latch: acc.latch + e.circuit.burn.latch }), { nand: 0, latch: 0 });
}
