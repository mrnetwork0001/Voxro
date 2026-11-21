/**
 * Live rehearsal against an Anvil fork of X Layer mainnet:
 *   anvil --fork-url https://rpc.xlayer.tech --port 8545
 *   VOXRO_FORK_RPC=http://127.0.0.1:8545 pnpm test:fork
 * Creates a throw-away processor, mints transistors, tapes out the whole Voxro catalog and
 * replays every transition of every circuit through the chain's step().
 */
import { createTestClient, defineChain, http, parseEther, publicActions, walletActions, type Address as ViemAddress } from 'viem';
import { xLayer } from 'viem/chains';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  LATCH_TOKEN_ID,
  NAND_TOKEN_ID,
  XLAYER,
  buildCatalog,
  catalogBurn,
  circuitsAbi,
  createCircuitCache,
  factoryAbi,
  loadCircuit,
  mintValue,
  proveAgainstChain,
  resolveCircuit,
  transistorsAbi,
  type Address,
  type CatalogEntry,
} from '../src/index.js';

const RPC = process.env.VOXRO_FORK_RPC;
const d = RPC ? describe : describe.skip;

/** Built lazily so collecting the suite without VOXRO_FORK_RPC never touches viem. */
function makeClient(rpc: string) {
  const chain = defineChain({ ...xLayer, rpcUrls: { default: { http: [rpc] } } });
  return createTestClient({ chain, mode: 'anvil', transport: http(rpc, { timeout: 60_000 }), pollingInterval: 500 }).extend(publicActions).extend(walletActions);
}

d('X Layer fork: tape out the Voxro catalog and prove it against the chain', () => {
  const DEPLOYER: ViemAddress = '0x1111111111111111111111111111111111111111';
  const client = makeClient(RPC ?? 'http://127.0.0.1:8545');
  const t0 = performance.now();
  const log = (msg: string) => console.log(`[fork +${((performance.now() - t0) / 1000).toFixed(1)}s] ${msg}`);
  let circuits: Address;
  let transistors: Address;
  let catalog: CatalogEntry[];
  const tapedIds = new Map<string, bigint>();

  beforeAll(async () => {
    log('setup: funding + impersonating deployer');
    await client.setBalance({ address: DEPLOYER, value: parseEther('100') });
    await client.impersonateAccount({ address: DEPLOYER });
    const deployFee = await client.readContract({ address: XLAYER.factory, abi: factoryAbi, functionName: 'deployFee' });
    let hash = await client.writeContract({
      account: DEPLOYER,
      address: XLAYER.factory,
      abi: factoryAbi,
      functionName: 'createCPU',
      args: ['Voxro Fork Rehearsal', 'VOXRT', 'fork rehearsal only', 1_000_000n, 10_000_000_000_000n],
      value: deployFee,
    });
    expect((await client.waitForTransactionReceipt({ hash })).status).toBe('success');
    log('createCPU mined');
    const count = await client.readContract({ address: XLAYER.factory, abi: factoryAbi, functionName: 'cpuCount' });
    circuits = await client.readContract({ address: XLAYER.factory, abi: factoryAbi, functionName: 'cpuAt', args: [count - 1n] });
    transistors = await client.readContract({ address: circuits, abi: circuitsAbi, functionName: 'transistors' });
    catalog = buildCatalog(circuits);
    const burn = catalogBurn(catalog);
    const [mintPrice, protocolFee] = await Promise.all([
      client.readContract({ address: transistors, abi: transistorsAbi, functionName: 'mintPrice' }),
      client.readContract({ address: transistors, abi: transistorsAbi, functionName: 'protocolFee' }),
    ]);
    for (const [id, amount] of [[NAND_TOKEN_ID, BigInt(burn.nand)], [LATCH_TOKEN_ID, BigInt(burn.latch)]] as const) {
      hash = await client.writeContract({ account: DEPLOYER, address: transistors, abi: transistorsAbi, functionName: 'mint', args: [id, amount], value: mintValue(amount, mintPrice, protocolFee) });
      expect((await client.waitForTransactionReceipt({ hash })).status).toBe('success');
      log(`minted ${amount} of token ${id}`);
    }
  }, 600_000);

  it('tapes out every catalog circuit with the expected id and burns exactly the top-level gates', async () => {
    const fee = await client.readContract({ address: circuits, abi: circuitsAbi, functionName: 'TAPEOUT_FEE' });
    for (const entry of catalog) {
      const before = await Promise.all([
        client.readContract({ address: transistors, abi: transistorsAbi, functionName: 'balanceOf', args: [DEPLOYER, NAND_TOKEN_ID] }),
        client.readContract({ address: transistors, abi: transistorsAbi, functionName: 'balanceOf', args: [DEPLOYER, LATCH_TOKEN_ID] }),
      ]);
      const hash = await client.writeContract({ account: DEPLOYER, address: circuits, abi: circuitsAbi, functionName: 'tapeout', args: [entry.circuit.hex, entry.circuit.nIn, entry.circuit.nOut], value: fee });
      const rc = await client.waitForTransactionReceipt({ hash });
      expect(rc.status, `tapeout ${entry.name}`).toBe('success');
      log(`taped out #${entry.id} ${entry.name} (${entry.circuit.bytes.length} bytes)`);
      const id = await client.readContract({ address: circuits, abi: circuitsAbi, functionName: 'nextId' });
      expect(id, `${entry.name} id`).toBe(entry.id);
      tapedIds.set(entry.name, id);
      const after = await Promise.all([
        client.readContract({ address: transistors, abi: transistorsAbi, functionName: 'balanceOf', args: [DEPLOYER, NAND_TOKEN_ID] }),
        client.readContract({ address: transistors, abi: transistorsAbi, functionName: 'balanceOf', args: [DEPLOYER, LATCH_TOKEN_ID] }),
      ]);
      expect(Number(before[0] - after[0]), `${entry.name} NAND burn`).toBe(entry.circuit.burn.nand);
      expect(Number(before[1] - after[1]), `${entry.name} LATCH burn`).toBe(entry.circuit.burn.latch);
    }
    const [nand, latch] = await Promise.all([
      client.readContract({ address: transistors, abi: transistorsAbi, functionName: 'balanceOf', args: [DEPLOYER, NAND_TOKEN_ID] }),
      client.readContract({ address: transistors, abi: transistorsAbi, functionName: 'balanceOf', args: [DEPLOYER, LATCH_TOKEN_ID] }),
    ]);
    expect([nand, latch]).toEqual([0n, 0n]);
  });

  it('chain circuitInfo (nState, gateCount) equals the local resolver for every circuit', async () => {
    const cache = createCircuitCache();
    for (const entry of catalog) {
      const onChain = await loadCircuit(client, circuits, entry.id, { cache });
      const localC = resolveCircuit({ nIn: entry.circuit.nIn, nOut: entry.circuit.nOut, elements: entry.circuit.elements }, { resolve: (cpu, id) => cache.circuits.get(`${cpu.toLowerCase()}:${id}`) });
      expect([onChain.nState, onChain.gateCount], entry.name).toEqual([localC.nState, localC.gateCount]);
    }
  });

  it('every transition of every circuit matches step() on chain', async () => {
    const cache = createCircuitCache();
    const rows: Array<{ id: number; name: string; transitions: number; mismatches: number; ms: number }> = [];
    for (const entry of catalog) {
      const c = await loadCircuit(client, circuits, entry.id, { cache });
      const r = await proveAgainstChain(client, circuits, entry.id, c, { chunk: 128 });
      rows.push({ id: Number(entry.id), name: entry.name, transitions: r.total, mismatches: r.mismatches.length, ms: Math.round(r.elapsedMs) });
      expect(r.mismatches, entry.name).toEqual([]);
    }
    console.table(rows);
  });
});
