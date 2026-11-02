import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));
export const money = (v: number, currency = 'MNT') => (currency === 'MNT' ? `${v.toLocaleString('en-US')}₮` : `${v.toLocaleString('en-US')} ${currency}`);
export const date = (v?: string | null) => (v ? new Date(v).toLocaleDateString('sv-SE') : '—');
export const dateTime = (v?: string | null) => (v ? new Date(v).toLocaleString('sv-SE', { dateStyle: 'short', timeStyle: 'short' }) : '—');
export function runtime(seconds?: number) {
  if (!seconds) return '';
  const m = Math.max(1, Math.round(seconds / 60));
  return m >= 60 ? `${Math.floor(m / 60)}ц ${m % 60}м` : `${m}м`;
}
