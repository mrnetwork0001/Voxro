import { useCallback, useEffect, useState } from 'react';

export type AppRouteId = 'pulse' | 'directory' | 'inbox' | 'studio' | 'card' | 'gallery' | 'prover' | 'receipt';
export type RouteId = 'landing' | AppRouteId;
/** App views in masthead order; the landing page lives at `#/`. */
export const ROUTES: AppRouteId[] = ['pulse', 'directory', 'inbox', 'studio', 'card', 'gallery', 'prover'];
/** Routes that exist but are not in the masthead. */
const HIDDEN: AppRouteId[] = ['receipt'];

function parse(): { id: RouteId; arg: string } {
  const raw = location.hash.replace(/^#\/?/, '');
  const [head = '', ...rest] = raw.split('/');
  if (head === '') return { id: 'landing', arg: '' };
  const id: RouteId = (ROUTES as string[]).includes(head) || (HIDDEN as string[]).includes(head) ? (head as AppRouteId) : 'pulse';
  return { id, arg: decodeURIComponent(rest.join('/')) };
}

export const href = (id: RouteId, arg?: string) => (id === 'landing' ? '#/' : `#/${id}${arg ? `/${encodeURIComponent(arg)}` : ''}`);

export function navigate(id: RouteId, arg?: string) {
  location.hash = href(id, arg);
}

export function useRoute() {
  const [route, setRoute] = useState(parse);
  useEffect(() => {
    const on = () => setRoute(parse());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  const go = useCallback((id: RouteId, arg?: string) => navigate(id, arg), []);
  return { ...route, go };
}
