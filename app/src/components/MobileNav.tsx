import { useCallback, useEffect, useState, type MouseEvent, type ReactNode } from 'react';
import { Wordmark } from './Wordmark.tsx';

/** Drawer open state; closes on Esc and on any route (hash) change. */
export function useDrawer() {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const toggle = useCallback(() => setOpen((o) => !o), []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    window.addEventListener('hashchange', close);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('hashchange', close);
    };
  }, [close]);
  useEffect(() => {
    document.body.classList.toggle('drawer-lock', open);
    return () => document.body.classList.remove('drawer-lock');
  }, [open]);
  return { open, close, toggle };
}

/** Three-line button that animates to an ×; only shown at ≤ 900px. */
export function Burger({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <button type="button" className={`burger-btn${open ? ' open' : ''}`} aria-expanded={open} aria-controls="mobile-drawer" aria-label={open ? 'Close menu' : 'Open menu'} onClick={onToggle}>
      <span />
      <span />
      <span />
    </button>
  );
}

/** Left drawer with a dimmed backdrop: brand + Close head, links, controls pinned at the bottom. */
export function Drawer({ open, onClose, children, footer }: { open: boolean; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  return (
    <>
      <button type="button" className={`drawer-backdrop${open ? ' show' : ''}`} aria-label="Close menu" tabIndex={open ? 0 : -1} onClick={onClose} />
      <aside id="mobile-drawer" className={`drawer${open ? ' open' : ''}`} aria-hidden={!open} aria-label="Menu">
        <div className="drawer-head">
          <Wordmark />
          <button type="button" className="drawer-close" onClick={onClose} aria-label="Close menu">
            ×
          </button>
        </div>
        <nav className="drawer-links">{children}</nav>
        {footer && <div className="drawer-foot">{footer}</div>}
      </aside>
    </>
  );
}

/**
 * In-page link for the landing sections. The app routes on the hash (`#/pulse`), so a bare `#why`
 * would be read as a route; scroll to the section instead and leave the hash alone.
 */
export function SectionLink({ to, children, onNavigate }: { to: string; children: ReactNode; onNavigate?: () => void }) {
  const go = (e: MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    onNavigate?.();
    document.getElementById(to)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  return (
    <a href={`#/`} onClick={go}>
      {children}
    </a>
  );
}
