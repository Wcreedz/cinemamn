import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { PublicSettings, SubscriptionMe } from '@mongolflix/shared';

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));
export const money = (v: number, currency = 'MNT') => (currency === 'MNT' ? `${v.toLocaleString('en-US')}₮` : `${v.toLocaleString('en-US')} ${currency}`);
export const date = (v?: string | null) => (v ? new Date(v).toLocaleDateString('sv-SE') : '—');
export const dateTime = (v?: string | null) => (v ? new Date(v).toLocaleString('sv-SE', { dateStyle: 'short', timeStyle: 'short' }) : '—');
// Бүх киноны эрх эсвэл зөвхөн энэ киноны хүчинтэй эрх.
export function canWatchMovie(movieId: string, ctx: { signedIn: boolean; access: SubscriptionMe | null; settings: PublicSettings | null }) {
  if (ctx.settings?.subscription.paymentRequired === false) return ctx.signedIn;
  return !!ctx.access?.hasAccess || !!ctx.access?.movies?.some((m) => m.movieId === movieId);
}
export const movieAccessOf = (movieId: string, access: SubscriptionMe | null) => access?.movies?.find((m) => m.movieId === movieId) ?? null;

// "Бүх киноны сарын эрх": багцын үнийн хажууд юу авч байгаагаа харуулна.
export function accessLabel(durationDays?: number) {
  if (!durationDays) return 'Бүх киноны эрх';
  return durationDays >= 28 && durationDays <= 31 ? 'Бүх киноны сарын эрх' : `Бүх киноны ${durationDays} хоногийн эрх`;
}

export function runtime(seconds?: number) {
  if (!seconds) return '';
  const m = Math.max(1, Math.round(seconds / 60));
  return m >= 60 ? `${Math.floor(m / 60)}ц ${m % 60}м` : `${m}м`;
}
