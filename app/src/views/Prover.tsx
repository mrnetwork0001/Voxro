import { OP_REF, XLAYER, beat, bitsFromInt, chainEval, chainStep, circuitsAbi, createCircuitCache, factoryAbi, formatNetlist, intFromBits, loadCircuit, packBits, proveAgainstChain, renderDatasheetSvg, topLevelBurn, unpackBits, type Address, type Bit, type ProofResult, type ResolvedCircuit } from '@voxro/sdk';
import { useEffect, useMemo, useState } from 'react';
import { explorerAddress, publicClient } from '../chain/client.ts';
import { Addr, Badge, Bits, Button, Note, Panel, Stat } from '../components/ui.tsx';
import { useI18n } from '../i18n.tsx';

const cache = createCircuitCache();

interface Target {
  cpu: Address;
  id: bigint;
  cpuIndex?: number;
}

/** `#1@2.0`, `1.2.0.tape`, `0xabc…:1` */
async function parseTarget(raw: string): Promise<Target | null> {
  const s = raw.trim();
  let m = /^#?(\d+)@2\.(\d+)$/.exec(s) ?? /^(\d+)\.2\.(\d+)(?:\.tape)?$/.exec(s);
  if (m) {
    const id = BigInt(m[1]!);
    const cpuIndex = Number(m[2]);
    const cpu = (await publicClient.readContract({ address: XLAYER.factory, abi: factoryAbi, functionName: 'cpuAt', args: [BigInt(cpuIndex)] })) as Address;
    return { cpu, id, cpuIndex };
  }
  m = /^(0x[0-9a-fA-F]{40})[:#](\d+)$/.exec(s);
  if (m) return { cpu: m[1] as Address, id: BigInt(m[2]!) };
  return null;
}

interface Loaded extends Target {
  circuit: ResolvedCircuit;
  name: string;
  symbol: string;
  burn: { nand: number; latch: number };
}

export function Prover({ arg }: { arg: string }) {
  const { t } = useI18n();
  const [input, setInput] = useState(arg || '#1@2.0');
  const [phase, setPhase] = useState<'idle' | 'loading' | 'proving' | 'done'>('idle');
  const [err, setErr] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [proof, setProof] = useState<ProofResult | null>(null);
  const [progress, setProgress] = useState(0);
  const [state, setState] = useState<Bit[]>([]);
  const [inputs, setInputs] = useState<Bit[]>([]);
  const [chainOut, setChainOut] = useState<{ newState: Bit[]; outputs: Bit[] } | null>(null);

  const run = async (raw: string) => {
    setErr(null);
    setLoaded(null);
    setProof(null);
    setChainOut(null);
    setPhase('loading');
    try {
      const target = await parseTarget(raw);
      if (!target) throw new Error(t('prover.err.parse'));
      const circuit = await loadCircuit(publicClient, target.cpu, target.id, { cache });
      const [name, symbol] = await Promise.all([
        publicClient.readContract({ address: target.cpu, abi: circuitsAbi, functionName: 'name' }),
        publicClient.readContract({ address: target.cpu, abi: circuitsAbi, functionName: 'symbol' }),
      ]);
      const l: Loaded = { ...target, circuit, name, symbol, burn: topLevelBurn(circuit.elements) };
      setLoaded(l);
      setState(bitsFromInt(0, circuit.nState));
      setInputs(bitsFromInt(0, circuit.nIn));
      if (circuit.nState + circuit.nIn <= 12) {
        setPhase('proving');
        const total = (1 << circuit.nState) * (1 << circuit.nIn);
        setProgress(0);
        // chunked replay with progress: proveAgainstChain is one call, so approximate progress by chunks
        const chunk = 128;
        const t0 = performance.now();
        const results: ProofResult = { ok: true, total: 0, mismatches: [], elapsedMs: 0, transitions: [] };
        const limits = { maxStateBits: 12, maxInputBits: 12 };
        // run in slices by limiting through repeated calls on sub-ranges is not supported; call once but show indeterminate bar
        void chunk;
        void total;
        const r = await proveAgainstChain(publicClient, target.cpu, target.id, circuit, { chunk: 128, limits });
        results.ok = r.ok;
        results.total = r.total;
        results.mismatches = r.mismatches;
        results.transitions = r.transitions;
        results.elapsedMs = performance.now() - t0;
        setProgress(100);
        setProof(results);
      }
      setPhase('done');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setErr(/cpuAt|out of bounds|reverted/i.test(msg) && !/no circuit/i.test(msg) ? `${t('prover.err.cpu')} (${msg.slice(0, 120)})` : msg.slice(0, 240));
      setPhase('idle');
    }
  };

  useEffect(() => {
    if (arg) void run(arg);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arg]);

  const local = useMemo(() => (loaded && state.length === loaded.circuit.nState && inputs.length === loaded.circuit.nIn ? beat(loaded.circuit, state, inputs) : null), [loaded, state, inputs]);

  const bench = async () => {
    if (!loaded) return;
    try {
      if (loaded.circuit.nState) {
        const r = await chainStep(publicClient, loaded.cpu, loaded.id, packBits(state), packBits(inputs));
        setChainOut({ newState: unpackBits(r.newState, loaded.circuit.nState), outputs: unpackBits(r.outputs, loaded.circuit.nOut) });
      } else {
        const o = await chainEval(publicClient, loaded.cpu, loaded.id, packBits(inputs));
        setChainOut({ newState: [], outputs: unpackBits(o, loaded.circuit.nOut) });
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message.slice(0, 200) : String(e));
    }
  };

  const svg = useMemo(
    () =>
      loaded
        ? renderDatasheetSvg({
            name: `${loaded.symbol} #${loaded.id.toString()}`,
            cpu: loaded.cpu,
            id: loaded.id,
            nIn: loaded.circuit.nIn,
            nOut: loaded.circuit.nOut,
            nState: loaded.circuit.nState,
            gateCount: loaded.circuit.gateCount,
            burn: loaded.burn,
            ...(proof ? { proven: { total: proof.total, ok: proof.ok, elapsedMs: proof.elapsedMs } } : {}),
            label: loaded.cpuIndex !== undefined ? `${loaded.id.toString()}.2.${loaded.cpuIndex}.tape · ${loaded.name}` : loaded.name,
          })
        : '',
    [loaded, proof],
  );
  const svgUrl = useMemo(() => (svg ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}` : ''), [svg]);
  const downloadSvg = () => {
    const a = document.createElement('a');
    a.href = svgUrl;
    a.download = loaded ? `${loaded.symbol}-${loaded.id.toString()}-datasheet.svg` : 'datasheet.svg';
    a.click();
  };
  const refs = loaded ? loaded.circuit.elements.filter((e) => e.op === OP_REF) : [];
  const chainMatches = chainOut && local ? chainOut.outputs.join('') === local.outputs.join('') && chainOut.newState.join('') === local.newState.join('') : null;

  return (
    <>
      <div className="mb">
        <div className="kicker">{t('nav.prover')}</div>
        <h2>{t('prover.title')}</h2>
        <p className="lede small mt-s">{t('prover.lede')}</p>
      </div>
      <div className="row">
        <input
          className="input mono"
          style={{ maxWidth: 420 }}
          value={input}
          placeholder={t('prover.input')}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void run(input);
          }}
        />
        <Button variant="signal" onClick={() => void run(input)} disabled={phase === 'loading' || phase === 'proving'}>
          {phase === 'loading' || phase === 'proving' ? <span className="spin" /> : null} {t('prover.load')}
        </Button>
        <span className="small muted">{t('prover.examples')}:</span>
        {['#1@2.0', '#2@2.0', '#1@2.275'].map((x) => (
          <button key={x} className="copy mono" onClick={() => { setInput(x); void run(x); }}>
            {x}
          </button>
        ))}
      </div>
      {phase === 'loading' && <Note>{t('prover.loading')}</Note>}
      {phase === 'proving' && (
        <Note tone="signal">
          <span className="spin" /> {t('prover.proving')} {progress ? `${progress}%` : ''}
        </Note>
      )}
      {err && <Note tone="warn">{err}</Note>}

      {loaded && (
        <div className="grid side mt">
          <div className="stack">
            <Panel kicker={`${t('prover.processor')} · ${loaded.name} (${loaded.symbol})`} title={`#${loaded.id.toString()}${loaded.cpuIndex !== undefined ? ` · ${loaded.id.toString()}.2.${loaded.cpuIndex}.tape` : ''}`} right={<Addr value={loaded.cpu} link={explorerAddress(loaded.cpu)} />}>
              <div className="grid cols-4">
                <Stat label="nIn / nOut / nState" value={`${loaded.circuit.nIn} / ${loaded.circuit.nOut} / ${loaded.circuit.nState}`} />
                <Stat label="gateCount" value={loaded.circuit.gateCount} sub="incl. REF" />
                <Stat label={t('studio.burn')} value={`${loaded.burn.nand}N ${loaded.burn.latch}L`} tone="signal" />
                <Stat
                  label={t('studio.prover')}
                  value={proof ? (proof.ok ? `${proof.total} ✓` : `${proof.mismatches.length} ✗`) : loaded.circuit.nState + loaded.circuit.nIn > 12 ? '—' : '…'}
                  sub={proof ? `${proof.elapsedMs.toFixed(0)} ms · Multicall3` : loaded.circuit.nState + loaded.circuit.nIn > 12 ? t('prover.tooLarge') : ''}
                  tone={proof ? (proof.ok ? 'ok' : 'warn') : undefined}
                />
              </div>
              {proof && <div className={`mt-s ${proof.ok ? 'ok' : 'bad'}`}>{proof.ok ? t('prover.result.ok') : t('prover.result.bad')}</div>}
              {refs.length > 0 && (
                <div className="small mt-s">
                  <span className="kicker">{t('prover.refs')}</span>{' '}
                  {refs.map((r, i) => (r.op === OP_REF ? <span key={i} className="mono">{r.cpu.slice(0, 8)}…#{r.id.toString()} ({r.ins.length}→{r.nOuts}) </span> : null))}
                </div>
              )}
            </Panel>

            <Panel kicker={t('prover.bench')} title={loaded.circuit.nState ? 'step(state, inputs)' : 'eval(inputs)'}>
              <div className="grid cols-2">
                <div>
                  <div className="kicker">{t('c.state')} ({loaded.circuit.nState})</div>
                  <div className="row mt-s">
                    {state.length === 0 && <span className="muted small">—</span>}
                    {state.map((b, i) => (
                      <button key={i} className={`btn sm${b ? ' signal' : ' ghost'}`} onClick={() => setState(state.map((x, k) => (k === i ? ((1 - x) as Bit) : x)))}>
                        s{i}={b}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="kicker">{t('c.inputs')} ({loaded.circuit.nIn})</div>
                  <div className="row mt-s">
                    {inputs.map((b, i) => (
                      <button key={i} className={`btn sm${b ? ' signal' : ' ghost'}`} onClick={() => setInputs(inputs.map((x, k) => (k === i ? ((1 - x) as Bit) : x)))}>
                        in{i}={b}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="grid cols-2 mt">
                <Stat label={`${t('prover.local')} · ${t('c.outputs')}`} value={local ? <Bits bits={local.outputs} /> : '—'} sub={local && loaded.circuit.nState ? `newState ${intFromBits(local.newState)}` : ''} />
                <Stat
                  label={`${t('prover.chain')} · ${t('c.outputs')}`}
                  value={chainOut ? <Bits bits={chainOut.outputs} /> : <Button size="sm" onClick={() => void bench()}>step()</Button>}
                  sub={chainOut ? (chainMatches ? <span className="ok">= local</span> : <span className="bad">≠ local</span>) : ''}
                  tone={chainOut ? (chainMatches ? 'ok' : 'warn') : undefined}
                />
              </div>
              {chainOut && (
                <Button size="sm" variant="ghost" onClick={() => void bench()}>
                  {t('c.refresh')}
                </Button>
              )}
            </Panel>

            <Panel kicker={t('gal.netlist')} title={`${loaded.circuit.elements.length} records`}>
              <pre className="mono small" style={{ maxHeight: 320, overflow: 'auto' }}>
                {formatNetlist({ nIn: loaded.circuit.nIn, nOut: loaded.circuit.nOut, elements: loaded.circuit.elements })}
              </pre>
            </Panel>
          </div>

          <div className="stack">
            <Panel kicker={t('prover.datasheet')} title={`${loaded.symbol} #${loaded.id.toString()}`} right={<Button size="sm" onClick={downloadSvg}>{t('prover.download')}</Button>}>
              <img src={svgUrl} alt="datasheet" style={{ width: '100%', border: '1px solid var(--rule)' }} />
            </Panel>
            {proof && (
              <Panel kicker={t('studio.table')} title={`${proof.total} transitions`} right={<Badge tone={proof.ok ? 'ok' : 'bad'}>{proof.ok ? 'chain = local' : `${proof.mismatches.length} mismatches`}</Badge>}>
                <div className="scroll">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>state</th>
                        <th>in</th>
                        <th>state′</th>
                        <th>out</th>
                      </tr>
                    </thead>
                    <tbody>
                      {proof.transitions.slice(0, 1024).map((tr, k) => (
                        <tr key={k}>
                          <td>
                            <Bits bits={bitsFromInt(tr.state, loaded.circuit.nState)} />
                          </td>
                          <td>
                            <Bits bits={bitsFromInt(tr.input, loaded.circuit.nIn)} />
                          </td>
                          <td>
                            <Bits bits={bitsFromInt(tr.newState, loaded.circuit.nState)} />
                          </td>
                          <td>
                            <Bits bits={bitsFromInt(tr.output, loaded.circuit.nOut)} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {proof.transitions.length > 1024 && <div className="small muted mt-s">showing 1024 / {proof.transitions.length}</div>}
              </Panel>
            )}
          </div>
        </div>
      )}
    </>
  );
}
