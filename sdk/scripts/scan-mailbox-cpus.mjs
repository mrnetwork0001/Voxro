import { createPublicClient, http, fallback, parseAbi } from 'viem';
import { xLayer } from 'viem/chains';
import { factoryAbi, transistorsAbi, circuitsAbi, XLAYER } from '../dist/index.js';
const pc = createPublicClient({ chain: xLayer, transport: fallback(XLAYER.rpcUrls.map((u) => http(u, { timeout: 20000 }))), batch: { multicall: true } });
const N = 386; // processors 0..385 match the DeWebHub codehash
const cpus = await pc.multicall({ allowFailure: false, contracts: Array.from({ length: N }, (_, i) => ({ address: XLAYER.factory, abi: factoryAbi, functionName: 'cpuAt', args: [BigInt(i)] })) });
const trs = await pc.multicall({ allowFailure: true, contracts: cpus.map((c) => ({ address: c, abi: circuitsAbi, functionName: 'transistors' })) });
const rows = [];
for (let i = 0; i < N; i++) {
  const t = trs[i].result; if (!t) continue;
  rows.push({ i, cpu: cpus[i], t });
}
const info = await pc.multicall({ allowFailure: true, contracts: rows.flatMap((r) => [
  { address: r.t, abi: transistorsAbi, functionName: 'minted' }, { address: r.t, abi: transistorsAbi, functionName: 'supplyCap' },
  { address: r.t, abi: transistorsAbi, functionName: 'mintPrice' }, { address: r.t, abi: transistorsAbi, functionName: 'cpuName' },
  { address: r.cpu, abi: circuitsAbi, functionName: 'nextId' }, { address: r.cpu, abi: transistorsAbi, functionName: 'symbol' } ]) });
const out = rows.map((r, k) => { const g = (j) => info[k * 6 + j].result; return { ...r, minted: g(0), cap: g(1), price: g(2), name: g(3), nextId: g(4), symbol: g(5) }; })
  .filter((r) => r.minted !== undefined && r.cap !== undefined && r.minted < r.cap)
  .sort((a, b) => Number(a.price - b.price));
console.log('open-supply processors with hub-compatible code:', out.length, 'of', rows.length);
for (const r of out.slice(0, 25)) console.log(String(r.i).padStart(3), r.cpu, (r.name ?? '').slice(0, 22).padEnd(22), 'free', String(r.cap - r.minted).padStart(9), 'price', (Number(r.price) / 1e18).toFixed(8), 'OKB', 'circuits', String(r.nextId));
