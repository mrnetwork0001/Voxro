import { useCallback, useEffect, useState } from 'react';

export type AppRouteId = 'pulse' | 'directory' | 'inbox' | 'start' | 'studio' | 'card' | 'gallery' | 'prover' | 'receipt';
export type RouteId = 'landing' | AppRouteId;
/** App views in masthead order; the landing page lives at `#/`. */
export const ROUTES: AppRouteId[] = ['pulse', 'directory', 'start', 'inbox', 'card', 'studio', 'gallery', 'prover'];
/** Routes that exist but are not in the masthead. */
const HIDDEN: AppRouteId[] = ['receipt'];

function parse(): { id: RouteId; arg: string } {
  const raw = location.hash.replace(/^#\/?/, '');
  const [head = '', ...rest] = raw.split('/');
  if (head === '') return { id: 'landing', arg: '' };
  // public profile link: #/@handle opens the Directory with that inbox selected
  if (head.startsWith('@') && head.length > 1) return { id: 'directory', arg: decodeURIComponent(head.slice(1)) };
  const id: RouteId = (ROUTES as string[]).includes(head) || (HIDDEN as string[]).includes(head) ? (head as AppRouteId) : 'pulse';
  return { id, arg: decodeURIComponent(rest.join('/')) };
}

export const href = (id: RouteId, arg?: string) => (id === 'landing' ? '#/' : `#/${id}${arg ? `/${encodeURIComponent(arg)}` : ''}`);

/** Shareable public link for an inbox, e.g. https://voxro.shieldsuite.xyz/#/@voxro */
export const PUBLIC_ORIGIN = 'https://voxro.shieldsuite.xyz';
export const profileLink = (handle: string) => `${PUBLIC_ORIGIN}/#/@${handle}`;
/** The Voxro Telegram bot, opened straight into alerts for an inbox. */
export const TELEGRAM_BOT = 'VoxrolayerBOT';
export const telegramAlerts = (handle: string) => `https://t.me/${TELEGRAM_BOT}?start=watch_${handle}`;

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
