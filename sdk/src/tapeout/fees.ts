/** Protocol fees on X Layer, in wei of OKB. Verified live 2026-11-01; always re-read before sending. */
export const OKB = 10n ** 18n;

export const XLAYER_FEES = Object.freeze({
  /** `Factory.deployFee()`: msg.value must equal it exactly; excess is NOT refunded. */
  deployFee: 6_600_000_000_000_000n,
  /** `Transistors.protocolFee()`: flat per `mint` call, not per transistor. */
  mintProtocolFeePerCall: 660_000_000_000_000n,
  /** `Circuits.TAPEOUT_FEE()`: msg.value must equal it exactly (under- and overpayment revert). */
  tapeoutFee: 1_300_000_000_000_000n,
  /** `Opener.FEE()`: excess refunded. */
  openerFee: 80_000_000_000_000_000n,
  /** `DomainBinding.monthlyFee()`: 0 on X Layer. */
  domainBindMonthlyFee: 0n,
});

/** `msg.value` for `Transistors.mint(id, amount)`. */
export function mintValue(amount: bigint, mintPrice: bigint, protocolFee: bigint = XLAYER_FEES.mintProtocolFeePerCall): bigint {
  if (amount <= 0n) throw new RangeError('amount must be > 0');
  return amount * mintPrice + protocolFee;
}

export function formatOkb(wei: bigint, maxDecimals = 6): string {
  const neg = wei < 0n;
  const abs = neg ? -wei : wei;
  const whole = abs / OKB;
  let frac = (abs % OKB).toString().padStart(18, '0').slice(0, maxDecimals).replace(/0+$/, '');
  return `${neg ? '-' : ''}${whole}${frac ? '.' + frac : ''} OKB`;
}

export interface LaunchPlan {
  nand: bigint;
  latch: bigint;
  mintPrice: bigint;
  circuits: number;
  containers: number;
  domainMonths?: number;
}

export interface LaunchBudget {
  lines: Array<{ label: string; wei: bigint }>;
  /** Fees that leave the creator's wallet for good. */
  protocolFees: bigint;
  /** Mint revenue that returns to the creator through `Transistors.withdraw()`. */
  creatorRecoverable: bigint;
  /** Total OKB that must be in the wallet up front (excluding gas). */
  total: bigint;
}

/** Up-front OKB needed to launch a processor, mint transistors, tape out circuits and open containers. */
export function launchBudget(p: LaunchPlan, fees = XLAYER_FEES): LaunchBudget {
  const lines: LaunchBudget['lines'] = [];
  const mintCalls = (p.nand > 0n ? 1n : 0n) + (p.latch > 0n ? 1n : 0n);
  const mintRevenue = (p.nand + p.latch) * p.mintPrice;
  lines.push({ label: 'Factory.createCPU deployFee', wei: fees.deployFee });
  lines.push({ label: `Transistors.mint protocol fee × ${mintCalls}`, wei: fees.mintProtocolFeePerCall * mintCalls });
  lines.push({ label: 'Transistors.mint price (recoverable via withdraw)', wei: mintRevenue });
  lines.push({ label: `Circuits.tapeout × ${p.circuits}`, wei: fees.tapeoutFee * BigInt(p.circuits) });
  lines.push({ label: `Opener.open × ${p.containers}`, wei: fees.openerFee * BigInt(p.containers) });
  lines.push({ label: `DomainBinding.bind × ${p.domainMonths ?? 0} months`, wei: fees.domainBindMonthlyFee * BigInt(p.domainMonths ?? 0) });
  const total = lines.reduce((a, l) => a + l.wei, 0n);
  return { lines, protocolFees: total - mintRevenue, creatorRecoverable: mintRevenue, total };
}
