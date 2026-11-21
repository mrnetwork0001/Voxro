import { formatOkb } from '@voxro/sdk';
import { formatUnits, parseUnits } from 'viem';
import { TOKENS, type Token } from './sim/escrow.ts';

export function fmtAmount(token: Token, v: bigint, digits?: number): string {
  const s = formatUnits(v, TOKENS[token].decimals);
  const [w = '0', f = ''] = s.split('.');
  const frac = f.slice(0, digits ?? (token === 'OKB' ? 4 : 2)).replace(/0+$/, '');
  return frac ? `${w}.${frac}` : w;
}

export const fmtMoney = (token: Token, v: bigint) => `${fmtAmount(token, v)} ${TOKENS[token].symbol}`;
export const parseAmount = (token: Token, s: string) => parseUnits(s || '0', TOKENS[token].decimals);
export { formatOkb };

export function fmtDuration(seconds: number, lang: 'en' | 'zh'): string {
  const d = Math.floor(seconds / 86_400);
  const h = Math.floor((seconds % 86_400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (lang === 'zh') return d ? `${d}天${h ? ` ${h}小时` : ''}` : h ? `${h}小时${m ? ` ${m}分` : ''}` : `${m}分`;
  return d ? `${d}d${h ? ` ${h}h` : ''}` : h ? `${h}h${m ? ` ${m}m` : ''}` : `${m}m`;
}

export function fmtCountdown(remaining: number, lang: 'en' | 'zh'): string {
  if (remaining <= 0) return lang === 'zh' ? '已过期' : 'expired';
  const s = remaining % 60;
  return `${fmtDuration(remaining, lang)} ${String(s).padStart(2, '0')}s`;
}

export const fmtTime = (unix: number) => new Date(unix * 1000).toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
