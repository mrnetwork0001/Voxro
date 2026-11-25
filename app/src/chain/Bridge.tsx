import { useEffect, useState } from 'react';
import { DEPLOYED } from '../config.ts';
import { useWallet } from '../wallet/wallet.tsx';
import { chainStore, onTxStatus, setSender, setWalletContext, startPolling, type TxStatus } from './escrow.ts';

/** Keeps the chain data layer in sync with the wallet and surfaces tx status as a toast. */
export function ChainBridge() {
  const w = useWallet();
  const [status, setStatus] = useState<TxStatus | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (!DEPLOYED) return;
    startPolling();
    return chainStore.subscribe(() => setErr(chainStore.error()));
  }, []);
  useEffect(() => {
    if (!DEPLOYED) return;
    setSender(w.address);
    setWalletContext(w.walletClient && w.address ? { walletClient: w.walletClient, address: w.address, ...(w.chainId !== undefined ? { chainId: w.chainId } : {}), switchToXLayer: w.switchToXLayer, okx: w.providerName === 'OKX Wallet' } : null);
  }, [w.address, w.walletClient, w.chainId, w.switchToXLayer]);
  useEffect(() => {
    if (!DEPLOYED) return;
    return onTxStatus((s) => {
      setStatus(s);
      if (s.kind === 'mined' || s.kind === 'error') window.setTimeout(() => setStatus((cur) => (cur === s ? null : cur)), 6000);
    });
  }, []);
  if (!DEPLOYED) return null;
  return (
    <>
      {status && (
        <div className="toast" style={{ bottom: 20 }}>
          {status.kind === 'pending' && <span className="spin" style={{ marginRight: 8 }} />}
          {status.kind === 'error' ? '✗ ' : status.kind === 'mined' ? '✓ ' : ''}
          {status.label}
          {status.error ? ` · ${status.error.slice(0, 120)}` : ''}
          {status.link && (
            <>
              {' · '}
              <a href={status.link} target="_blank" rel="noreferrer" style={{ color: 'inherit' }}>
                tx
              </a>
            </>
          )}
        </div>
      )}
      {err && <div className="toast" style={{ bottom: 64, background: 'var(--bad)' }}>RPC: {err.slice(0, 140)}</div>}
    </>
  );
}
