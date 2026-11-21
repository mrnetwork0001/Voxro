/** 20px line icons in the terminal style (stroke = currentColor). Hand-drawn; no icon library. */
import type { ReactElement } from 'react';

export type Icon = (p: { className?: string }) => ReactElement;
const S = ({ children, className }: { children: ReactElement | ReactElement[]; className?: string }) => (
  <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="square" strokeLinejoin="miter" aria-hidden="true">
    {children}
  </svg>
);

/** Pulse: a heartbeat trace on a baseline. */
export const IconPulse: Icon = (p) => (
  <S {...p}>
    <path d="M2 13h4l2.5-6 4 12 3-9 1.5 3H22" />
  </S>
);
/** Directory: stacked cards with a search lens. */
export const IconDirectory: Icon = (p) => (
  <S {...p}>
    <path d="M4 5h11M4 10h7M4 15h6" />
    <circle cx="16.5" cy="15.5" r="3.5" />
    <path d="M19 18l3 3" />
  </S>
);
/** Inbox: a tray with an arrow dropping in. */
export const IconInbox: Icon = (p) => (
  <S {...p}>
    <path d="M3 13l2.5-8h13L21 13v7H3z" />
    <path d="M3 13h5l1.5 3h5l1.5-3h5" />
    <path d="M12 3v7M9.5 7.5L12 10l2.5-2.5" />
  </S>
);
/** Studio: a NAND gate symbol. */
export const IconStudio: Icon = (p) => (
  <S {...p}>
    <path d="M5 5h6a7 7 0 010 14H5z" />
    <circle cx="19.5" cy="12" r="1.6" />
    <path d="M2 9h3M2 15h3M21 12h1" />
  </S>
);
/** Card: a contact card with a tape:// slot. */
export const IconCard: Icon = (p) => (
  <S {...p}>
    <rect x="3" y="5" width="18" height="14" />
    <circle cx="8.5" cy="11" r="2" />
    <path d="M5.5 16c.8-1.6 1.8-2.2 3-2.2s2.2.6 3 2.2M14 10h4M14 13.5h3" />
  </S>
);
/** Circuits: a chip with pins. */
export const IconCircuits: Icon = (p) => (
  <S {...p}>
    <rect x="6.5" y="6.5" width="11" height="11" />
    <rect x="10" y="10" width="4" height="4" />
    <path d="M9 2.5v4M15 2.5v4M9 17.5v4M15 17.5v4M2.5 9h4M2.5 15h4M17.5 9h4M17.5 15h4" />
  </S>
);
/** Prover: a check inside brackets. */
export const IconProver: Icon = (p) => (
  <S {...p}>
    <path d="M7 4H4v16h3M17 4h3v16h-3" />
    <path d="M8 12.5l2.8 2.8L16.5 9" />
  </S>
);
export const IconPanelClose: Icon = (p) => (
  <S {...p}>
    <rect x="3" y="4" width="18" height="16" />
    <path d="M9 4v16M16 9l-3 3 3 3" />
  </S>
);
export const IconPanelOpen: Icon = (p) => (
  <S {...p}>
    <rect x="3" y="4" width="18" height="16" />
    <path d="M9 4v16M13 9l3 3-3 3" />
  </S>
);
export const IconWallet: Icon = (p) => (
  <S {...p}>
    <path d="M3 7h16v13H3z" />
    <path d="M3 7l12-3v3M15 13.5h4" />
  </S>
);
export const IconLogout: Icon = (p) => (
  <S {...p}>
    <path d="M10 4H4v16h6M14 8l4 4-4 4M18 12H9" />
  </S>
);
