import { XLAYER, circuitsAbi, factoryAbi, transistorsAbi, type Address } from '@voxro/sdk';
import { parseAbi } from 'viem';
import { CONFIG } from '../config.ts';
import { publicClient } from './client.ts';
import { useAsync } from './hooks.ts';

const openerAbi = parseAbi(['function FEE() view returns (uint256)']);
const marketAbi = parseAbi(['function feeBps() view returns (uint256)']);
const domainAbi = parseAbi(['function monthlyFee() view returns (uint256)']);

export interface Telemetry {
  block: bigint;
  cpuCount: bigint;
  deployFee: bigint;
  openerFee: bigint;
  marketFeeBps: bigint;
  domainMonthlyFee: bigint;
  cpu0: Address;
  tapeoutFee: bigint;
  voxr?: {
    name: string;
    symbol: string;
    nextId: bigint;
    transistors: Address;
    minted: bigint;
    supplyCap: bigint;
    mintPrice: bigint;
    protocolFee: bigint;
  };
}

export async function readTelemetry(): Promise<Telemetry> {
  const [block, base] = await Promise.all([
    publicClient.getBlockNumber(),
    publicClient.multicall({
      allowFailure: false,
      contracts: [
        { address: XLAYER.factory, abi: factoryAbi, functionName: 'cpuCount' },
        { address: XLAYER.factory, abi: factoryAbi, functionName: 'deployFee' },
        { address: XLAYER.opener, abi: openerAbi, functionName: 'FEE' },
        { address: XLAYER.circuitMarket, abi: marketAbi, functionName: 'feeBps' },
        { address: XLAYER.domainBinding, abi: domainAbi, functionName: 'monthlyFee' },
        { address: XLAYER.factory, abi: factoryAbi, functionName: 'cpuAt', args: [0n] },
      ],
    }),
  ]);
  const [cpuCount, deployFee, openerFee, marketFeeBps, domainMonthlyFee, cpu0] = base;
  const tapeoutFee = await publicClient.readContract({ address: cpu0 as Address, abi: circuitsAbi, functionName: 'TAPEOUT_FEE' });
  const t: Telemetry = { block, cpuCount, deployFee, openerFee, marketFeeBps, domainMonthlyFee, cpu0: cpu0 as Address, tapeoutFee };
  if (CONFIG.voxrCpu) {
    const cpu = CONFIG.voxrCpu;
    const [name, symbol, nextId, transistors] = await publicClient.multicall({
      allowFailure: false,
      contracts: [
        { address: cpu, abi: circuitsAbi, functionName: 'name' },
        { address: cpu, abi: circuitsAbi, functionName: 'symbol' },
        { address: cpu, abi: circuitsAbi, functionName: 'nextId' },
        { address: cpu, abi: circuitsAbi, functionName: 'transistors' },
      ],
    });
    const tr = transistors as Address;
    const [minted, supplyCap, mintPrice, protocolFee] = await publicClient.multicall({
      allowFailure: false,
      contracts: [
        { address: tr, abi: transistorsAbi, functionName: 'minted' },
        { address: tr, abi: transistorsAbi, functionName: 'supplyCap' },
        { address: tr, abi: transistorsAbi, functionName: 'mintPrice' },
        { address: tr, abi: transistorsAbi, functionName: 'protocolFee' },
      ],
    });
    t.voxr = { name, symbol, nextId, transistors: tr, minted, supplyCap, mintPrice, protocolFee };
  }
  return t;
}

export const useTelemetry = () => useAsync(readTelemetry, [], { intervalMs: 15_000 });
