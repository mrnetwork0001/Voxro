import { useEffect, useRef, useState } from 'react';
import { enableNotifications, listenNotifications, readChannelRecord, type Notice } from '../chain/relay.ts';
import { Badge, Button, Note, Panel } from '../components/ui.tsx';
import { fmtMoney } from '../format.ts';
import { useI18n } from '../i18n.tsx';
import type { InboxView, Token } from '../model.ts';
import tapeoutMark from '../assets/tapeout-mark.svg';

type Status = 'checking' | 'off' | 'ready' | 'listening' | 'error';

/** TapeRelay (TAP-14) instant notifications for an inbox the connected wallet holds. */
export function RelayPanel({ inbox }: { inbox: InboxView }) {
  const { t } = useI18n();
  const [status, setStatus] = useState<Status>('checking');
  const [detail, setDetail] = useState('');
  const [busy, setBusy] = useState(false);
  const [notices, setNotices] = useState<Notice[]>([]);
  const stopRef = useRef<(() => void) | null>(null);
  const container = inbox.memberContainers[0];
  const member = inbox.memberIds[0];

  useEffect(() => {
    let alive = true;
    if (!container || !member) return;
    readChannelRecord(container, member)
      .then((r) => alive && setStatus(r ? 'ready' : 'off'))
      .catch(() => alive && setStatus('off'));
    return () => {
      alive = false;
      stopRef.current?.();
    };
  }, [container, member]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setDetail('');
    try {
      await fn();
    } catch (e) {
      setStatus((s) => (s === 'listening' ? s : 'error'));
      setDetail(e instanceof Error ? e.message.slice(0, 200) : String(e));
    } finally {
      setBusy(false);
    }
  };

  const enable = () =>
    run(async () => {
      await enableNotifications(inbox);
      setStatus('ready');
    });

  const listen = () =>
    run(async () => {
      if (typeof Notification !== 'undefined' && Notification.permission === 'default') void Notification.requestPermission();
      stopRef.current = await listenNotifications(
        inbox,
        (n) => {
          setNotices((l) => [n, ...l].slice(0, 6));
          const line = `${t('relay.newMsg')} #${n.ticketId} · ${fmtMoney(n.token as Token, BigInt(n.amount))}`;
          if (typeof Notification !== 'undefined' && Notification.permission === 'granted') new Notification(`@${inbox.handle} · Voxro`, { body: line });
        },
        (s, d) => {
          setStatus(s === 'listening' ? 'listening' : s === 'error' ? 'listening' : 'ready');
          setDetail(s === 'error' ? `${t('relay.retrying')}: ${d ?? ''}` : (d ?? ''));
        },
      );
    });

  const stop = () => {
    stopRef.current?.();
    stopRef.current = null;
    setStatus('ready');
  };

  return (
    <Panel
      kicker={
        <span className="row" style={{ gap: 6 }}>
          <img src={tapeoutMark} alt="" width={13} height={13} style={{ opacity: 0.85 }} /> TapeRelay · TAP-14
        </span>
      }
      title={t('relay.title')}
      right={<Badge tone={status === 'listening' ? 'ok' : status === 'ready' ? 'signal' : status === 'error' ? 'warn' : undefined}>{t(`relay.s.${status}`)}</Badge>}
    >
      <div className="stack">
        <p className="small muted">{t('relay.lede')}</p>
        {status === 'off' && (
          <div className="row">
            <Button variant="signal" size="sm" disabled={busy} onClick={() => void enable()}>
              {busy ? <span className="spin" /> : null} {t('relay.enable')}
            </Button>
            <span className="small muted">{t('relay.enableHint')}</span>
          </div>
        )}
        {(status === 'ready' || status === 'error') && (
          <div className="row">
            <Button variant="signal" size="sm" disabled={busy} onClick={() => void listen()}>
              {busy ? <span className="spin" /> : null} {t('relay.listen')}
            </Button>
            {status === 'error' && (
              <Button size="sm" disabled={busy} onClick={() => void enable()}>
                {t('relay.republish')}
              </Button>
            )}
          </div>
        )}
        {status === 'listening' && (
          <div className="row between">
            <span className="small">
              <span className="dot live" style={{ marginRight: 8 }} />
              {t('relay.listening')} {detail && <span className="muted">· {detail}</span>}
            </span>
            <Button size="sm" variant="ghost" onClick={stop}>
              {t('relay.stop')}
            </Button>
          </div>
        )}
        {status === 'error' && detail && <Note tone="warn">{detail}</Note>}
        {notices.length > 0 && (
          <div className="lp-log" style={{ minHeight: 0 }}>
            {notices.map((n) => (
              <div key={n.ticketId}>
                <span className="t">#{n.ticketId}</span>
                {t('relay.newMsg')} · {fmtMoney(n.token as Token, BigInt(n.amount))}
              </div>
            ))}
          </div>
        )}
      </div>
    </Panel>
  );
}
