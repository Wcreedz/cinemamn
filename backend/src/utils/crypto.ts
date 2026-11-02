import crypto from 'crypto';
import { env } from '../config/env';

const KEY = () => Buffer.from(env.SETTINGS_ENCRYPTION_KEY, 'base64');

// AES-256-GCM. `context` (AAD) нь шифрийг тухайн талбарт холбож, нэг талбарын утгыг
// өөр талбар руу хуулж тавихыг илрүүлнэ. Формат: v1.<iv>.<tag>.<ciphertext>
export function encryptSecret(plain: string, context: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY(), iv);
  cipher.setAAD(Buffer.from(context));
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), ct.toString('base64url')].join('.');
}

export function decryptSecret(payload: string, context: string): string {
  const [v, iv, tag, ct] = payload.split('.');
  if (v !== 'v1' || !iv || !tag || ct === undefined) throw new Error('Шифрлэгдсэн утгын формат буруу байна.');
  const d = crypto.createDecipheriv('aes-256-gcm', KEY(), Buffer.from(iv, 'base64url'));
  d.setAAD(Buffer.from(context));
  d.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([d.update(Buffer.from(ct, 'base64url')), d.final()]).toString('utf8');
}

export const sha256 = (v: string) => crypto.createHash('sha256').update(v).digest('hex');
export const hmac = (v: string, key: string) => crypto.createHmac('sha256', key).update(v).digest('hex');
export const randomToken = (bytes = 48) => crypto.randomBytes(bytes).toString('base64url');

export function safeEqual(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

export function maskSecret(value?: string | null) {
  if (!value) return '';
  const tail = value.length > 8 ? value.slice(-4) : '';
  return `••••••••${tail}`;
}
