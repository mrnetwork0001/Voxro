import { useCallback, useEffect, useRef, useState } from 'react';

export interface AsyncState<T> {
  data?: T;
  error?: string;
  loading: boolean;
  updatedAt?: number;
  refresh: () => void;
}

/** Run an async read, optionally on an interval; keeps the last good value while refreshing. */
export function useAsync<T>(fn: () => Promise<T>, deps: readonly unknown[], opts: { intervalMs?: number; enabled?: boolean } = {}): AsyncState<T> {
  const enabled = opts.enabled ?? true;
  const [state, setState] = useState<Omit<AsyncState<T>, 'refresh'>>({ loading: enabled });
  const [tick, setTick] = useState(0);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    setState((s) => ({ ...s, loading: true }));
    fnRef
      .current()
      .then((data) => alive && setState({ data, loading: false, updatedAt: Date.now() }))
      .catch((e: unknown) => alive && setState((s) => ({ ...s, loading: false, error: e instanceof Error ? e.message : String(e) })));
    const id = opts.intervalMs ? window.setInterval(() => setTick((t) => t + 1), opts.intervalMs) : undefined;
    return () => {
      alive = false;
      if (id) window.clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick, enabled]);
  const refresh = useCallback(() => setTick((t) => t + 1), []);
  return { ...state, refresh };
}

export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const id = window.setInterval(() => setNow(Math.floor(Date.now() / 1000)), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}
